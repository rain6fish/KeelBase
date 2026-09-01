// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'dart:convert';
import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/core/api/ws_client.dart';
import 'package:front_app/core/constants/app_constants.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  setUp(() {
    // flutter_test 默认拦截真实网络，WS 测试需要 loopback 直连。
    HttpOverrides.global = null;
  });

  tearDown(() {
    AppConstants.activeBaseUrl = AppConstants.baseUrl;
  });

  /// 起一个 loopback WebSocket 服务端。
  /// [onConnection] 在每次客户端升级连接时被调用，负责收发帧。
  Future<HttpServer> startServer(
    FutureOr<void> Function(WebSocket sock) onConnection,
  ) async {
    final server = await HttpServer.bind(InternetAddress.loopbackIPv4, 0);
    addTearDown(() => server.close(force: true));
    server.listen((req) async {
      if (req.uri.path != '/ws') {
        try {
          req.response.statusCode = 404;
          await req.response.close();
        } catch (_) {}
        return;
      }
      try {
        final sock = await WebSocketTransformer.upgrade(req);
        // 每个 handler 自行为 WebSocket 附加唯一 listener（单订阅流），
        // 只发不收帧的用例自行 drain。
        await onConnection(sock);
      } catch (_) {
        // 客户端提前断开等场景：忽略
      }
    });
    AppConstants.activeBaseUrl = 'http://127.0.0.1:${server.port}';
    return server;
  }

  /// 消费服务端收到的帧（不处理内容），避免单订阅流无 listener。
  void drain(WebSocket sock) {
    sock.listen((_) {}, onError: (_) {}, onDone: () {});
  }

  WsClient createClient({
    Duration? pingInterval,
    Duration? pongTimeout,
  }) {
    return WsClient(
      getAccessToken: () => 'tok123',
      pingInterval: pingInterval ?? const Duration(seconds: 20),
      pongTimeout: pongTimeout ?? const Duration(seconds: 30),
    );
  }

  test('连接成功后派发 connected 与业务帧', () async {
    await startServer((sock) async {
      drain(sock);
      sock.add(jsonEncode({'event': 'connected', 'data': {'userId': 1}}));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      sock.add(jsonEncode({'event': 'notification', 'data': {'id': 7}}));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await sock.close();
    });

    final ws = createClient();
    final events = <Map<String, dynamic>>[];
    final sub = ws.events.listen(events.add);
    addTearDown(() {
      sub.cancel();
      ws.dispose();
    });

    ws.connect();
    await Future<void>.delayed(const Duration(milliseconds: 300));

    final names = events.map((e) => e['event']).toList();
    expect(names, contains('connected'));
    expect(names, contains('notification'));
    expect(
      (events.firstWhere((e) => e['event'] == 'notification')['data']
          as Map)['id'],
      7,
    );
  });

  test('收到 pong 帧派发 pong 事件', () async {
    await startServer((sock) async {
      drain(sock);
      sock.add(jsonEncode({'event': 'connected', 'data': {}}));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      sock.add(jsonEncode({'event': 'pong', 'data': null}));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await sock.close();
    });

    final ws = createClient();
    final events = <Map<String, dynamic>>[];
    final sub = ws.events.listen(events.add);
    addTearDown(() {
      sub.cancel();
      ws.dispose();
    });

    ws.connect();
    await Future<void>.delayed(const Duration(milliseconds: 300));

    expect(events.map((e) => e['event']).toList(), contains('pong'));
  });

  test('非 JSON 帧被忽略且不中断连接', () async {
    await startServer((sock) async {
      drain(sock);
      sock.add(jsonEncode({'event': 'connected', 'data': {}}));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      sock.add('not-json{{{{');
      await Future<void>.delayed(const Duration(milliseconds: 20));
      sock.add(jsonEncode({'event': 'notification', 'data': {'id': 2}}));
      await Future<void>.delayed(const Duration(milliseconds: 20));
      await sock.close();
    });

    final ws = createClient();
    final events = <Map<String, dynamic>>[];
    final sub = ws.events.listen(events.add);
    addTearDown(() {
      sub.cancel();
      ws.dispose();
    });

    ws.connect();
    await Future<void>.delayed(const Duration(milliseconds: 300));

    final names = events.map((e) => e['event']).toList();
    expect(names, contains('connected'));
    expect(names, contains('notification'));
    expect(names, isNot(contains('not-json')));
  });

  test('连接断开后自动退避重连', () async {
    var connections = 0;
    await startServer((sock) async {
      connections++;
      drain(sock);
      sock.add(jsonEncode({'event': 'connected', 'data': {}}));
      if (connections == 1) {
        // 第一条连接立即断开，触发客户端重连
        await sock.close();
        return;
      }
      await Future<void>.delayed(const Duration(milliseconds: 200));
      await sock.close();
    });

    final ws = createClient();
    final events = <Map<String, dynamic>>[];
    final sub = ws.events.listen(events.add);
    addTearDown(() {
      sub.cancel();
      ws.dispose();
    });

    ws.connect();
    // 第一次连接 + 断开 + 1s 退避 + 重连
    await Future<void>.delayed(const Duration(milliseconds: 1700));

    expect(connections, greaterThanOrEqualTo(2));
    final names = events.map((e) => e['event']).toList();
    expect(names, contains('ws:reconnecting'));
    expect(
      events.where((e) => e['event'] == 'connected').length,
      greaterThanOrEqualTo(2),
    );
  });

  test('send 发送编码后的 JSON 帧', () async {
    final frames = <Map<String, dynamic>>[];
    await startServer((sock) async {
      sock.listen((raw) {
        frames.add(jsonDecode(raw as String) as Map<String, dynamic>);
      });
      await Future<void>.delayed(const Duration(milliseconds: 200));
      await sock.close();
    });

    final ws = createClient();
    addTearDown(ws.dispose);

    ws.connect();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    ws.send('foo', {'a': 1});
    await Future<void>.delayed(const Duration(milliseconds: 200));

    expect(frames, isNotEmpty);
    expect(frames.any((f) => f['event'] == 'foo'), isTrue);
    expect(
      frames.firstWhere((f) => f['event'] == 'foo')['data'],
      {'a': 1},
    );
  });

  test('心跳：周期发送 ping 帧', () async {
    final frames = <String>[];
    await startServer((sock) async {
      sock.listen((raw) => frames.add(raw as String));
      await Future<void>.delayed(const Duration(milliseconds: 800));
      await sock.close();
    });

    final ws = createClient(
      pingInterval: const Duration(milliseconds: 200),
      pongTimeout: const Duration(seconds: 10),
    );
    addTearDown(ws.dispose);

    ws.connect();
    await Future<void>.delayed(const Duration(milliseconds: 700));

    final decoded = frames.map((f) => jsonDecode(f) as Map<String, dynamic>);
    expect(decoded.map((f) => f['event']).toList(), contains('ping'));
  });

  test('dispose 后不再重连且事件流关闭', () async {
    var connections = 0;
    await startServer((sock) async {
      connections++;
      drain(sock);
      sock.add(jsonEncode({'event': 'connected', 'data': {}}));
      await sock.close();
    });

    final ws = createClient();
    final events = <Map<String, dynamic>>[];
    final sub = ws.events.listen(events.add);

    ws.connect();
    await Future<void>.delayed(const Duration(milliseconds: 100));
    ws.dispose();
    await sub.cancel();

    final countAtDispose = connections;
    await Future<void>.delayed(const Duration(milliseconds: 1300));
    expect(connections, countAtDispose); // 不再重连
  });
}
