import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/api/sse_client.dart';
import 'package:front_app/core/constants/app_constants.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    // flutter_test 默认拦截真实网络，SSE 测试需要 loopback 直连。
    HttpOverrides.global = null;
  });

  tearDown(() {
    AppConstants.activeBaseUrl = AppConstants.baseUrl;
  });

  /// 起一个 loopback SSE 服务，返回指向它的 SseClient。
  /// [handler] 在请求到达时被调用，负责写响应。
  Future<SseClient> startServer(
    void Function(HttpRequest) handler, {
    Future<String?> Function()? refreshToken,
  }) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((req) async {
      try {
        handler(req);
      } catch (_) {
        try {
          req.response.statusCode = 500;
          await req.response.close();
        } catch (_) {}
      }
    });
    AppConstants.activeBaseUrl = 'http://127.0.0.1:${server.port}/api/v1';
    return SseClient(
      getAccessToken: () => 'token',
      refreshToken: refreshToken,
    );
  }

  Future<void> writeSse(HttpRequest req, List<String> fragments) async {
    final res = req.response;
    res.headers.contentType = ContentType('text', 'event-stream');
    for (final fragment in fragments) {
      res.write(fragment);
      await res.flush();
    }
    await res.close();
  }

  test('单个 data 行跨 chunk 拆分为一个事件', () async {
    final sse = await startServer((req) async {
      // 手动控制写入时机，验证长行跨 TCP chunk 也能拼回完整行
      final res = req.response;
      res.headers.contentType = ContentType('text', 'event-stream');
      res.write('event: text\n');
      res.write('data: {"type":"text","content":"he');
      await res.flush();
      await Future<void>.delayed(const Duration(milliseconds: 20));
      res.write('llo"}\n\n');
      await res.close();
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events, hasLength(1));
    expect(events.single['type'], 'text');
    expect((events.single['data'] as Map)['content'], 'hello');
  });

  test('event: 与 data: 配对生成对应类型事件', () async {
    final sse = await startServer((req) async {
      await writeSse(req, [
        'event: done\n',
        'data: {"type":"done","conversationId":"c1"}\n\n',
      ]);
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events, hasLength(1));
    expect(events.single['type'], 'done');
    expect((events.single['data'] as Map)['conversationId'], 'c1');
  });

  test('[DONE] 后停止解析后续事件', () async {
    final sse = await startServer((req) async {
      await writeSse(req, [
        'event: text\ndata: {"type":"text","content":"a"}\n\n',
        'event: text\ndata: [DONE]\n\n',
        'event: text\ndata: {"type":"text","content":"after"}\n\n',
      ]);
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events.map((e) => e['type']).toList(), ['text', 'done']);
    expect(events.last['data'], isNull);
  });

  test('多行 data 合并为一个事件', () async {
    final sse = await startServer((req) async {
      await writeSse(req, [
        'data: hello\n',
        'data: world\n\n',
      ]);
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events, hasLength(1));
    expect(events.single['type'], 'text');
    expect((events.single['data'] as Map)['content'], 'hello\nworld');
  });

  test('末尾无换行的 data 块在流结束时派发', () async {
    final sse = await startServer((req) async {
      await writeSse(req, [
        'event: text\n',
        'data: {"type":"text","content":"tail"}',
      ]);
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events, hasLength(1));
    expect(events.single['type'], 'text');
    expect((events.single['data'] as Map)['content'], 'tail');
  });

  test('非 200 返回 error 事件', () async {
    final sse = await startServer((req) async {
      req.response.statusCode = 401;
      req.response.write('unauthorized');
      await req.response.close();
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events, hasLength(1));
    expect(events.single['type'], 'error');
    expect((events.single['data'] as Map)['error'], 'HTTP 401');
  });

  test('非法 JSON 的 data 行回退为 text 事件', () async {
    final sse = await startServer((req) async {
      await writeSse(req, ['data: plain text\n\n']);
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events.single['type'], 'text');
    expect((events.single['data'] as Map)['content'], 'plain text');
  });

  test('注释行被忽略', () async {
    final sse = await startServer((req) async {
      await writeSse(req, [
        ': heartbeat\n',
        'event: text\ndata: {"type":"text","content":"x"}\n\n',
      ]);
    });

    final events = await sse.postStream('/ai/chat/stream').toList();
    expect(events, hasLength(1));
    expect(events.single['type'], 'text');
  });

  test('401 时先刷新 token 再重试，成功后不残留错误（CR-17）', () async {
    var calls = 0;
    final sse = await startServer(
      (req) async {
        calls++;
        if (calls == 1) {
          req.response.statusCode = 401;
          req.response.write('unauthorized');
          await req.response.close();
          return;
        }
        await writeSse(req, [
          'event: text\ndata: {"type":"text","content":"ok"}\n\n',
        ]);
      },
      refreshToken: () async => 'new-token',
    );

    final events = await sse
        .postStream(
          '/notifications/stream',
          maxAttempts: 3,
          initialBackoff: const Duration(milliseconds: 10),
        )
        .toList();

    expect(calls, 2);
    expect(events.map((e) => e['type']).toList(), ['text']);
    expect((events.single['data'] as Map)['content'], 'ok');
  });

  test('无 refreshToken 时 401 直接透传为 error（原语义）', () async {
    final sse = await startServer((req) async {
      req.response.statusCode = 401;
      req.response.write('unauthorized');
      await req.response.close();
    });

    final events = await sse
        .postStream(
          '/notifications/stream',
          reconnect: true,
          maxAttempts: 2,
          initialBackoff: const Duration(milliseconds: 10),
        )
        .toList();

    expect(events, hasLength(1));
    expect(events.single['type'], 'error');
    expect((events.single['data'] as Map)['error'], 'HTTP 401');
  });

  test('服务端断流（无 [DONE]）时自动重连并继续收到事件（CR-17）', () async {
    var calls = 0;
    final sse = await startServer((req) async {
      calls++;
      if (calls == 1) {
        // 第一次连接：发一个事件后直接断开（断流）
        await writeSse(req, [
          'event: notification\ndata: {"type":"notification","id":1}\n\n',
        ]);
        // 连接随后被服务端关闭，未发 [DONE]
        return;
      }
      await writeSse(req, [
        'event: notification\ndata: {"type":"notification","id":2}\n\n',
        'event: text\ndata: [DONE]\n\n', // 第二次干净结束
      ]);
    });

    final events = await sse
        .postStream(
          '/notifications/stream',
          reconnect: true,
          maxAttempts: 3,
          initialBackoff: const Duration(milliseconds: 10),
        )
        .toList();

    expect(calls, 2);
    final ids = events
        .where((e) => e['type'] == 'notification')
        .map((e) => (e['data'] as Map)['id']);
    expect(ids, [1, 2]);
  });
}
