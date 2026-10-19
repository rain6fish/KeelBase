// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../data/models/tool_step_model.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/api/sse_client.dart';
import '../../../../core/api/ws_client.dart';
import '../../../../core/errors/exceptions.dart';
import '../utils/ai_presentation_text.dart';

/// 流式失败类别（判据来自失败来源，而非错误文案猜测）。
enum StreamFailureKind {
  /// 连接被拒/断开/超时：传输层，没拿到 HTTP 状态。
  transport,
  /// 流式端点 5xx，或服务端以 `ai:error` 结束流。
  serverUnavailable,
  /// 401/403/429/4xx 业务拒绝（含 WS 前门的 AI_DISABLED / AI_RATE_LIMITED）。
  authOrPolicy,
}

/// 流式失败后要做什么。
enum StreamFailureAction { retryStream, fallbackToNonStreaming, surfaceError }

/// 决定「重试一次 / 回退非流式 / 只报错」。
///
/// 规则是闭集，可直接对表断言：
/// - 已发生工具或确认事件 → 只报错：重放会重复副作用，或丢掉待确认的写操作；
/// - 鉴权/限流/4xx 业务拒绝 → 只报错：换个通道也一样被拒；
/// - 传输层失败、尚无内容、首次尝试 → 重试流式一次；
/// - 其余（5xx、服务端流错误、重试后仍失败、已有文本但无副作用）→ 回退非流式。
///
/// The rules are a closed set: any tool/confirmation event means we must not replay
/// (duplicate side effects or drop a pending write); auth/policy rejections are not
/// channel-specific; transient transport failures get exactly one streaming retry;
/// everything else degrades to the non-streaming endpoint.
StreamFailureAction classifyStreamFailure({
  required StreamFailureKind kind,
  required bool hasContent,
  required bool hasSideEffectEvents,
  required int retryCount,
  bool retryable = false,
}) {
  if (hasSideEffectEvents) return StreamFailureAction.surfaceError;
  if (kind == StreamFailureKind.authOrPolicy) return StreamFailureAction.surfaceError;
  if (kind == StreamFailureKind.transport &&
      retryable &&
      !hasContent &&
      retryCount == 0) {
    return StreamFailureAction.retryStream;
  }
  return StreamFailureAction.fallbackToNonStreaming;
}

/// 一次流式尝试的结果：成功（null 以外的 failed=false）或失败详情。
class _StreamOutcome {
  final bool failed;
  final String? message;
  final StreamFailureKind kind;
  /// 是否值得重试（连接断/拒绝这类显式传输信号；超时不算）。
  final bool retryable;

  const _StreamOutcome.success()
      : failed = false,
        message = null,
        kind = StreamFailureKind.transport,
        retryable = false;

  const _StreamOutcome.failure(
    this.message, {
    required this.kind,
    this.retryable = false,
  }) : failed = true;

  /// 服务端/SSE 给的错误文本：`HTTP <status>` 按状态码分类，其余按传输或服务端错误。
  factory _StreamOutcome.fromErrorText(String text, {required bool transportHint}) {
    final match = RegExp(r'^HTTP (\d{3})$').firstMatch(text);
    if (match != null) {
      final status = int.parse(match.group(1)!);
      if (status >= 500) {
        return _StreamOutcome.failure(text,
            kind: StreamFailureKind.serverUnavailable);
      }
      if (status == 408) {
        return _StreamOutcome.failure(text,
            kind: StreamFailureKind.transport, retryable: true);
      }
      return _StreamOutcome.failure(text, kind: StreamFailureKind.authOrPolicy);
    }
    return _StreamOutcome.failure(
      text,
      kind: transportHint
          ? StreamFailureKind.transport
          : StreamFailureKind.serverUnavailable,
      retryable: transportHint,
    );
  }
}

/// 单条聊天消息模型
class ChatMessageModel {
  final String role; // 'user' | 'assistant'
  final String content;
  final bool isStreaming;
  final PendingConfirmation? pendingConfirmation;
  final ToolStepModel? toolStep;

  const ChatMessageModel({
    required this.role,
    required this.content,
    this.isStreaming = false,
    this.pendingConfirmation,
    this.toolStep,
  });

  ChatMessageModel copyWith({
    String? content,
    bool? isStreaming,
    PendingConfirmation? pendingConfirmation,
    bool clearConfirmation = false,
    ToolStepModel? toolStep,
  }) {
    return ChatMessageModel(
      role: role,
      content: content ?? this.content,
      isStreaming: isStreaming ?? this.isStreaming,
      pendingConfirmation:
          clearConfirmation ? null : (pendingConfirmation ?? this.pendingConfirmation),
      toolStep: toolStep ?? this.toolStep,
    );
  }
}

/// Explainable Authz（W5-⑦）：单条授权检查（tool_enabled / role_allowed / user_scoped / risk_policy）
class AuthorizationCheck {
  final String name;
  final bool ok;
  final String? note;

  const AuthorizationCheck({required this.name, required this.ok, this.note});

  factory AuthorizationCheck.fromJson(Map<String, dynamic> json) =>
      AuthorizationCheck(
        name: json['name'] as String? ?? '',
        ok: json['ok'] as bool? ?? false,
        note: json['note'] as String?,
      );
}

/// Explainable Authz（W5-⑦）：授权依据——为何允许 / 为何需确认
class AuthorizationReasons {
  final String riskLevel; // R0-R5
  final String riskStrategy; // auto / policy / confirmation / human_approval / block
  final bool requiresConfirmation;
  final List<AuthorizationCheck> checks;

  const AuthorizationReasons({
    required this.riskLevel,
    required this.riskStrategy,
    required this.requiresConfirmation,
    this.checks = const [],
  });

  factory AuthorizationReasons.fromJson(Map<String, dynamic> json) =>
      AuthorizationReasons(
        riskLevel: json['riskLevel'] as String? ?? '',
        riskStrategy: json['riskStrategy'] as String? ?? '',
        requiresConfirmation: json['requiresConfirmation'] as bool? ?? false,
        checks: (json['checks'] as List?)
                ?.map((c) => AuthorizationCheck.fromJson(c as Map<String, dynamic>))
                .toList() ??
            const [],
      );
}

/// KB-5 run 批内单个动作（逐条 diff 摘要，run 卡"有 diff"核心）
class RunConfirmationItem {
  final String toolName;
  final AiPresentationText? summary;
  final String riskLevel;

  const RunConfirmationItem({
    required this.toolName,
    this.summary,
    this.riskLevel = '',
  });

  factory RunConfirmationItem.fromJson(Map<String, dynamic> json) =>
      RunConfirmationItem(
        toolName: json['toolName'] as String? ?? '',
        summary: json['summary'] == null
            ? null
            : AiPresentationText.fromJson(json['summary']),
        riskLevel: json['riskLevel'] as String? ?? '',
      );
}

/// 影响预览中的一类对象（§22.17 ④）：resultType 为机器标识，与撤销/审计口径一致，不翻译。
class ConfirmationImpactTarget {
  final String resultType;
  final int count;

  const ConfirmationImpactTarget({required this.resultType, required this.count});

  factory ConfirmationImpactTarget.fromJson(Map<String, dynamic> json) =>
      ConfirmationImpactTarget(
        resultType: json['resultType'] as String? ?? '',
        count: (json['count'] as num?)?.toInt() ?? 0,
      );
}

/// §22.17 ④ 影响预览（估计值，非承诺）：将执行几个写动作、涉及哪些对象类型。
class ConfirmationImpact {
  final int actions;
  final List<ConfirmationImpactTarget> targets;

  const ConfirmationImpact({required this.actions, this.targets = const []});

  factory ConfirmationImpact.fromJson(Map<String, dynamic> json) => ConfirmationImpact(
        actions: (json['actions'] as num?)?.toInt() ?? 0,
        targets: [
          if (json['targets'] is List)
            ...(json['targets'] as List)
                .whereType<Map<String, dynamic>>()
                .map(ConfirmationImpactTarget.fromJson),
        ],
      );
}

/// 待人工确认的 AI 写操作（来自 SSE confirmation_request 事件）
/// KB-5：mode==='run' 时表示一次授权整批（runItems 多动作），token 即 runId。
class PendingConfirmation {
  final String token;
  final String toolName;
  final AiPresentationText? summary;
  final Map<String, dynamic> arguments;
  final AuthorizationReasons? authorization;
  /// KB-5 确认形态：'confirmation'（缺省，R3 单动作）| 'approval'（R4）| 'run'（整批）
  final String mode;
  /// mode==='run' 时的逐条动作（run 卡渲染）
  final List<RunConfirmationItem> runItems;
  /// mode==='run' 时批级最高风险（spec §2.2 runRisk，用户据此做整批授权决定）；缺省空
  final String runRisk;
  /// §22.17 ④ 影响预览；后端无可解析对象时省略（无该字段 → 卡片不渲染影响行）
  final ConfirmationImpact? impact;

  const PendingConfirmation({
    required this.token,
    required this.toolName,
    this.summary,
    this.arguments = const {},
    this.authorization,
    this.mode = 'confirmation',
    this.runItems = const [],
    this.runRisk = '',
    this.impact,
  });

  /// run 卡以 mode 为准（不因 runItems 为空退化成单动作卡——那会以空摘要误导用户，而批准仍放行整批）
  bool get isRun => mode == 'run';
}

/// AI 对话状态管理
class AiChatProvider extends ChangeNotifier {
  final ApiClient _apiClient;
  final SseClient _sseClient;
  final WsClient? _wsClient;
  final String Function(String msg) _errorWithDetail;
  final String Function() _errorRetry;
  final String Function() _confirmFailed;

  /// i18n 回调注入：provider 无 BuildContext，错误文案由调用方本地化；缺省英文兜底。
  AiChatProvider(
    this._apiClient,
    this._sseClient, {
    this._wsClient,
    String Function(String msg)? errorWithDetail,
    String Function()? errorRetry,
    String Function()? confirmFailed,
  }) : _errorWithDetail = errorWithDetail ?? ((msg) => 'Sorry, an error occurred: $msg'),
       _errorRetry = errorRetry ?? (() => 'Sorry, an error occurred. Please try again.'),
       _confirmFailed = confirmFailed ?? (() => 'Confirmation request failed, please retry.');

  bool _disposed = false;

  @override
  void dispose() {
    _disposed = true;
    _cancelWsStream();
    super.dispose();
  }

  /// 流式/异步完成点统一经此通知：已 dispose 后不再 notify（CR-26 mounted 保护）。
  void _safeNotify() {
    if (!_disposed) notifyListeners();
  }

  /// 委托（子代理 / plan）**不需要客户端判**：服务端的技能短路两条端点各有一份，走 SSE 照样委托。
  /// 此前这里揣了一份后端触发词的副本 + 一条非流式绕行；2026-10-02 服务端把路由收进流式端点后
  /// 一并删除 —— 触发词只此一处（后端 `skills-registry.ts`），客户端不再猜。

  // --- 状态 ---
  List<ChatMessageModel> _messages = [];
  bool _isLoading = false;
  bool _isStreaming = false;
  String? _currentConversationId;
  String? _error;
  String? _navigateTo;
  String? _pendingMessage;
  String _provider = 'deepseek';
  PendingConfirmation? _currentConfirmation;
  bool _isConfirming = false;

  /// 本轮是否已出现工具/确认事件：出现后不再重试或回退（重放会重复副作用）。
  bool _turnHasSideEffectEvents = false;

  /// 最近一轮是否因流式不可用而回退到非流式（UI 据此如实告知用户）。
  bool _fellBackToNonStreaming = false;

  /// SSE 流代际计数：clearConversation / loadConversation 递增以取消进行中的流。
  int _streamGeneration = 0;

  /// WS 进行中的 ai:chat 订阅（用于 clear/load 时取消 + 发 ai:abort）
  StreamSubscription<Map<String, dynamic>>? _wsSub;

  // --- Getters ---
  List<ChatMessageModel> get messages => _messages;
  bool get isLoading => _isLoading;
  bool get isStreaming => _isStreaming;
  String? get currentConversationId => _currentConversationId;
  String? get error => _error;
  String? get navigateTo => _navigateTo;
  String get provider => _provider;
  PendingConfirmation? get currentConfirmation => _currentConfirmation;
  bool get isConfirming => _isConfirming;

  /// 最近一轮是否回退到非流式（文案由页面按当前语言渲染，provider 不持有 BuildContext）。
  bool get fellBackToNonStreaming => _fellBackToNonStreaming;

  // 当前模型的**展示名**不在这里 —— 这一层没有 BuildContext，「通义千问/Qwen」说不了两种语言。
  // 消费方用 `provider`（id）+ `l10n.aiProviderName(id)` 取名字。

  /// 切换模型（model 留空，后端用该 provider 的默认模型）
  void switchModel(String provider) {
    if (provider == _provider) return;
    _provider = provider;
    _safeNotify();
  }

  /// 消费待发送消息（首页输入框跳转时使用）
  String? consumePendingMessage() {
    final msg = _pendingMessage;
    _pendingMessage = null;
    return msg;
  }

  /// 设置待发送消息并跳转（从首页输入框调用）
  void sendFromHome(String text, String route) {
    _pendingMessage = text.trim();
    _navigateTo = route;
    _safeNotify();
  }

  /// 发送消息（SSE 流式）
  Future<void> sendMessage(String text) async {
    if (text.trim().isEmpty) return;
    if (_isLoading || _isStreaming) return; // 防止流式请求进行中重入

    _messages = [..._messages, ChatMessageModel(role: 'user', content: text.trim())];
    _isLoading = true;
    _isStreaming = true;
    _error = null;
    // 新请求开始时清掉旧的待消费导航，避免 sendFromHome 的 '/ai' 或上一轮
    // delegate 遗留导航被本页 _handleNavigation 再次触发（重复 push）。
    _navigateTo = null;
    _safeNotify();

    // 添加空白的 assistant 消息，后续逐字追加
    final aiMsg = ChatMessageModel(role: 'assistant', content: '', isStreaming: true);
    _messages = [..._messages, aiMsg];
    _safeNotify();

    final body = <String, dynamic>{
      'message': text.trim(),
      'provider': _provider,
    };
    if (_currentConversationId != null) {
      body['conversationId'] = _currentConversationId;
    }

    final gen = _streamGeneration;
    final buf = StringBuffer();
    _turnHasSideEffectEvents = false;
    _fellBackToNonStreaming = false;

    try {
      // 首次流式尝试。null = 代际已变（clear/load 取消了本轮），不再做任何处理。
      var outcome = await _streamOnce(body, gen, buf);
      var retries = 0;
      var action = outcome == null || !outcome.failed || gen != _streamGeneration
          ? null
          : _actionFor(outcome, buf, retries);

      if (action == StreamFailureAction.retryStream) {
        _cancelWsStream(); // 停掉旧流（WS 发 ai:abort；SSE 已断）
        retries = 1;
        buf.clear(); // 该分支只在尚无内容时成立
        outcome = await _streamOnce(body, gen, buf);
        if (gen != _streamGeneration) return;
        if (outcome != null && outcome.failed) {
          action = _actionFor(outcome, buf, retries);
        } else {
          action = null;
        }
      }

      if (action == StreamFailureAction.fallbackToNonStreaming) {
        _cancelWsStream();
        final delivered = await _fallbackToNonStreaming(body, gen);
        if (gen != _streamGeneration) return;
        if (delivered) {
          // 如实告知：回退不是正常流式路径，页面按此状态显示提示条。
          _fellBackToNonStreaming = true;
          _safeNotify();
        } else if (outcome != null) {
          // 非流式也失败：报原始流式错误，不让用户只看到「双双失败」的迷雾。
          _surfaceStreamError(outcome);
        }
      } else if (action == StreamFailureAction.surfaceError && outcome != null) {
        _surfaceStreamError(outcome);
      }
    } catch (e) {
      // 未预料的异常：保持旧行为 —— 还没有内容时显示重试提示。
      if (gen == _streamGeneration && buf.isEmpty && _messages.isNotEmpty) {
        _messages = [
          ..._messages.sublist(0, _messages.length - 1),
          ChatMessageModel(role: 'assistant', content: _errorRetry()),
        ];
      }
    } finally {
      // 仅当本次请求仍是当前代时才清理共享状态，避免覆盖 clear/load 后的新会话
      if (gen == _streamGeneration) {
        _isLoading = false;
        _isStreaming = false;
        // 成功或失败都移除 streaming 标记，避免光标永久闪烁
        if (_messages.isNotEmpty) {
          final last = _messages.last;
          if (last.isStreaming) {
            _messages[_messages.length - 1] = last.copyWith(isStreaming: false);
          }
        }
        // 流中断/error 时，把仍未结束的步骤卡置为 error（避免悬空 running）
        if (_messages.any((m) =>
            m.toolStep != null && m.toolStep!.status == ToolStepStatus.running)) {
          _messages = _messages.map((m) {
            final step = m.toolStep;
            if (step != null && step.status == ToolStepStatus.running) {
              return m.copyWith(
                toolStep: step.copyWith(status: ToolStepStatus.error),
              );
            }
            return m;
          }).toList();
        }
        _safeNotify();
      }
    }
  }

  /// 执行一次流式尝试（WS 或 SSE），把失败折叠成结果对象供分类。
  Future<_StreamOutcome?> _streamOnce(
    Map<String, dynamic> body,
    int gen,
    StringBuffer buf,
  ) async {
    try {
      if (_wsClient != null) {
        // RG-6：走 WS 双向通道（ai:chat → ai:* 事件）
        return await _sendViaWs(body, gen, buf);
      }
      // SSE 降级：per-request 流
      return await _sendViaSse(body, gen, buf);
    } catch (e) {
      // 传输层异常（连接被拒等）：标记为可重试的传输失败。
      return _StreamOutcome.failure(
        e.toString(),
        kind: StreamFailureKind.transport,
        retryable: true,
      );
    }
  }

  /// SSE 流式：逐个事件喂给 [_handleChunk]；`error` 事件折叠为失败结果。
  Future<_StreamOutcome?> _sendViaSse(
    Map<String, dynamic> body,
    int gen,
    StringBuffer buf,
  ) async {
    await for (final event in _sseClient.postStream('/ai/chat/stream', body: body)) {
      // clearConversation / loadConversation 会递增 _streamGeneration 取消本次流
      if (gen != _streamGeneration) return null;
      final type = event['type'] as String?;
      final data = event['data'] as Map<String, dynamic>?;
      if (type == 'error') {
        final msg = data?['error'] as String? ?? 'Stream error';
        // `source=transport` 是 SSE 客户端自己补的（连接/解码异常）；
        // 服务端在流里发的 error 事件不带 source，按服务端错误处理（回退而非重试）。
        if (data?['source'] == 'transport') {
          return _StreamOutcome.failure(
            msg,
            kind: StreamFailureKind.transport,
            retryable: true,
          );
        }
        return _StreamOutcome.fromErrorText(msg, transportHint: false);
      }
      _handleChunk(type, data, buf);
    }
    if (gen != _streamGeneration) return null;
    return const _StreamOutcome.success();
  }

  /// WS 流式：发 ai:chat，消费 ai:* 帧（剥离 ai: 前缀喂给 [_handleChunk]）；
  /// done/error/断线/代际变化时终止。确认决策仍走 REST /ai/confirmations/:token。
  Future<_StreamOutcome?> _sendViaWs(
    Map<String, dynamic> body,
    int gen,
    StringBuffer buf,
  ) async {
    final ws = _wsClient!;
    ws.connect();
    final done = Completer<_StreamOutcome?>();
    void finish(_StreamOutcome? outcome) {
      _wsSub?.cancel();
      if (!done.isCompleted) done.complete(outcome);
    }

    _wsSub?.cancel();
    _wsSub = ws.events.listen((frame) {
      if (gen != _streamGeneration) {
        finish(null);
        return;
      }
      final event = frame['event'] as String?;
      final data = frame['data'] as Map<String, dynamic>?;
      if (event == 'ws:reconnecting') {
        // 连接断开/握手失败：明确的传输信号，可重试一次。
        finish(const _StreamOutcome.failure(
          'WebSocket disconnected',
          kind: StreamFailureKind.transport,
          retryable: true,
        ));
        return;
      }
      if (event == 'error') {
        // WS 前门错误（网关在进流之前发）：换个通道也一样被拒，不回退。
        final code = data?['code'] as String?;
        if (code == 'AI_DISABLED' || code == 'AI_RATE_LIMITED') {
          finish(_StreamOutcome.failure(
            data?['message'] as String? ?? code!,
            kind: StreamFailureKind.authOrPolicy,
          ));
        }
        return;
      }
      if (event == null || !event.startsWith('ai:')) return; // 只处理 AI 流帧
      final type = event.substring(3);
      if (type == 'error') {
        finish(_StreamOutcome.fromErrorText(
          data?['error'] as String? ?? 'Stream error',
          transportHint: false,
        ));
        return;
      }
      _handleChunk(type, data, buf);
      if (type == 'done') finish(const _StreamOutcome.success());
    });
    ws.send('ai:chat', body);
    // 兜底超时：后端总在流 finally 发 ai:done；极端情况（abort/断连）90s 放行。
    // 超时不算「明确传输信号」，故不重试、直接按规则回退。
    return await done.future.timeout(
      const Duration(seconds: 90),
      onTimeout: () {
        finish(const _StreamOutcome.failure(
          'Stream timed out',
          kind: StreamFailureKind.transport,
        ));
        return null;
      },
    );
  }

  StreamFailureAction _actionFor(
    _StreamOutcome outcome,
    StringBuffer buf,
    int retries,
  ) {
    return classifyStreamFailure(
      kind: outcome.kind,
      hasContent: buf.isNotEmpty,
      hasSideEffectEvents: _turnHasSideEffectEvents,
      retryCount: retries,
      retryable: outcome.retryable,
    );
  }

  /// 非流式回退：`POST /ai/chat` 返回 `ChatResponse.reply`。
  /// 成功则把占位回复替换成完整答案，并记下 conversationId。
  Future<bool> _fallbackToNonStreaming(Map<String, dynamic> body, int gen) async {
    try {
      final json = await _apiClient.post('/ai/chat', data: body);
      if (gen != _streamGeneration) return false;
      final response =
          ApiResponse.fromJson(json, (data) => data as Map<String, dynamic>);
      if (!response.isSuccess) return false;
      final data = response.data;
      final reply = data?['reply'];
      if (reply is! String) return false;
      final conversationId = data?['conversationId'];
      if (conversationId is String && conversationId.isNotEmpty) {
        _currentConversationId = conversationId;
      }
      if (_messages.isNotEmpty && _messages.last.role == 'assistant') {
        _messages[_messages.length - 1] =
            ChatMessageModel(role: 'assistant', content: reply);
      } else {
        _messages = [..._messages, ChatMessageModel(role: 'assistant', content: reply)];
      }
      return true;
    } catch (_) {
      // 非流式也失败：由调用方报原始流式错误（不把两个失败拼成一句模糊文案）。
      return false;
    }
  }

  /// 流式错误按旧行为呈现：把末尾占位回复替换成带详情的错误文案。
  void _surfaceStreamError(_StreamOutcome outcome) {
    if (_messages.isEmpty) return;
    final errMsg = outcome.message ?? 'Stream error';
    _messages = [
      ..._messages.sublist(0, _messages.length - 1),
      ChatMessageModel(role: 'assistant', content: _errorWithDetail(errMsg)),
    ];
    _safeNotify();
  }

  /// 处理单个流式 chunk（SSE 与 WS 共用，type 已去 ai: 前缀）。
  void _handleChunk(String? type, Map<String, dynamic>? data, StringBuffer buf) {
    switch (type) {
      case 'text':
        final content = data?['content'] as String? ?? '';
        buf.write(content);
        if (_messages.isEmpty) break;
        // 原地替换最后一条，避免每次 chunk 全量重建列表（O(n²)→O(1)）
        final last = _messages[_messages.length - 1];
        _messages[_messages.length - 1] = last.copyWith(
          content: buf.toString(),
          isStreaming: true,
          clearConfirmation: true,
        );
        _safeNotify();
      case 'tool_call':
        // Tool calling in progress — user sees "searching" from the streaming text
        break;
      case 'confirmation_request':
        _turnHasSideEffectEvents = true;
        final c = data?['confirmation'] as Map<String, dynamic>?;
        if (c != null) {
          // KB-5：读 mode/run（run = 一次授权整批，token 即 runId）
          final mode = c['mode'] as String? ?? 'confirmation';
          final runMap = c['run'] as Map<String, dynamic>?;
          final runItems = <RunConfirmationItem>[
            if (runMap?['items'] is List)
              ...(runMap!['items'] as List)
                  .whereType<Map<String, dynamic>>()
                  .map(RunConfirmationItem.fromJson),
          ];
          final pending = PendingConfirmation(
            token: c['token'] as String,
            toolName: c['toolName'] as String? ?? '',
            summary: c['summary'] == null ? null : AiPresentationText.fromJson(c['summary']),
            arguments: (c['arguments'] as Map?)?.cast<String, dynamic>() ??
                const {},
            authorization: c['authorization'] is Map<String, dynamic>
                ? AuthorizationReasons.fromJson(
                    c['authorization'] as Map<String, dynamic>)
                : null,
            mode: mode,
            runItems: runItems,
            runRisk: runMap?['riskLevel'] as String? ?? '',
            impact: c['impact'] is Map<String, dynamic>
                ? ConfirmationImpact.fromJson(c['impact'] as Map<String, dynamic>)
                : null,
          );
          _currentConfirmation = pending;
          if (_messages.isNotEmpty) {
            _messages = [
              ..._messages.sublist(0, _messages.length - 1),
              _messages.last
                  .copyWith(isStreaming: false)
                  .copyWith(pendingConfirmation: pending),
            ];
          }
          _safeNotify();
        }
      case 'tool_start':
        _turnHasSideEffectEvents = true;
        final ts = data?['toolStart'] as Map<String, dynamic>?;
        if (ts != null) {
          final step = ToolStepModel(
            name: ts['name'] as String? ?? '',
            status: ToolStepStatus.running,
            summary: ts['summary'] == null ? null : AiPresentationText.fromJson(ts['summary']),
            isWrite: ts['isWrite'] == true,
          );
          if (_messages.isEmpty) break;
          _messages = [
            ..._messages.sublist(0, _messages.length - 1),
            ChatMessageModel(role: 'assistant', content: '', toolStep: step),
            _messages.last,
          ];
          _safeNotify();
        }
      case 'tool_end':
        _turnHasSideEffectEvents = true;
        final te = data?['toolEnd'] as Map<String, dynamic>?;
        if (te != null) {
          final name = te['name'] as String? ?? '';
          final idx = _messages.lastIndexWhere((m) =>
              m.toolStep != null &&
              m.toolStep!.name == name &&
              m.toolStep!.status == ToolStepStatus.running);
          if (idx >= 0) {
            final step = _messages[idx].toolStep!;
            final success = te['success'] == true;
            final updated = _messages[idx].copyWith(
              toolStep: step.copyWith(
                status: success ? ToolStepStatus.success : ToolStepStatus.error,
                summary: te['summary'] == null
                    ? step.summary
                    : AiPresentationText.fromJson(te['summary']),
                error: te['error'] as String?,
              ),
            );
            _messages = [
              ..._messages.sublist(0, idx),
              updated,
              ..._messages.sublist(idx + 1),
            ];
            _safeNotify();
          }
        }
      case 'confirmation_decision':
        _turnHasSideEffectEvents = true;
        _currentConfirmation = null;
        if (_messages.isNotEmpty) {
          _messages = [
            ..._messages.sublist(0, _messages.length - 1),
            _messages.last.copyWith(clearConfirmation: true),
          ];
        }
        _safeNotify();
      case 'done':
        _currentConversationId = data?['conversationId'] as String?;
        break;
    }
  }

  /// 取消进行中的 WS AI 流：取消订阅并通知后端停流。
  void _cancelWsStream() {
    _wsSub?.cancel();
    _wsSub = null;
    _wsClient?.send('ai:abort');
  }

  /// 确认 / 拒绝 AI 的写操作（调用后端 confirmation 端点，恢复被挂起的流）
  Future<void> confirmPending({required bool approved, bool trustTool = false}) async {
    final conf = _currentConfirmation;
    if (conf == null || _isConfirming) return;
    _isConfirming = true;
    _safeNotify();
    try {
      await _apiClient.post(
        '/ai/confirmations/${conf.token}',
        data: {
          'decision': approved ? 'approve' : 'decline',
          // 仅批准时传播信任标记：拒绝时忽略，避免 Reject 误把工具标记为已信任
          if (approved && trustTool) 'trustTool': true,
        },
      );
    } catch (_) {
      _error = _confirmFailed();
    } finally {
      _isConfirming = false;
      _safeNotify();
    }
  }

  /// 清空对话并消费导航（导航只触发一次）
  String? consumeNavigateTo() {
    final route = _navigateTo;
    _navigateTo = null;
    return route;
  }

  /// 清空当前对话
  void clearConversation() {
    _streamGeneration++; // 取消进行中的 SSE/WS 流
    _cancelWsStream();
    _messages = [];
    _currentConversationId = null;
    _currentConfirmation = null;
    _isConfirming = false;
    _isLoading = false;
    _isStreaming = false;
    _error = null;
    _navigateTo = null;
    _pendingMessage = null;
    _turnHasSideEffectEvents = false;
    _fellBackToNonStreaming = false;
    _safeNotify();
  }

  /// 加载历史对话的完整消息，填充聊天界面（用于从历史列表切换）
  Future<void> loadConversation(String id) async {
    // Bump the generation to cancel an in-flight stream and to make any earlier
    // conversation load stale.
    //
    // 递增代际：取消进行中的流，并把更早的会话加载标记为过期响应。
    final generation = ++_streamGeneration;
    _cancelWsStream();
    _currentConfirmation = null;
    _isConfirming = false;
    _isLoading = false;
    _isStreaming = false;
    _navigateTo = null;
    _pendingMessage = null;
    _turnHasSideEffectEvents = false;
    _fellBackToNonStreaming = false;
    try {
      final json = await _apiClient.get('/ai/conversations/$id');
      // A newer load or a clear has taken over; drop this stale response.
      //
      // 已有更新的加载或清空接管，丢弃这份过期响应。
      if (generation != _streamGeneration) return;
      final response = ApiResponse.fromJson(json, (data) => data as Map<String, dynamic>);
      if (!response.isSuccess) {
        throw NetworkException(response.message);
      }
      final data = response.data;
      final rawMessages = data?['messages'] as List? ?? [];

      final loaded = <ChatMessageModel>[];
      for (final m in rawMessages) {
        if (m is! Map<String, dynamic>) continue; // 防御：跳过畸形消息
        final role = m['role'] as String?;
        final content = m['content'] as String? ?? '';
        if (role == 'user' || role == 'assistant') {
          loaded.add(ChatMessageModel(role: role!, content: content));
        }
      }

      _messages = loaded;
      _currentConversationId = id;
      _error = null;
      // 继续聊时用会话原 provider，保持模型一致
      final convProvider = data?['provider'] as String?;
      if (convProvider != null && convProvider.isNotEmpty) {
        _provider = convProvider;
      }
      _safeNotify();
    } catch (e) {
      // A stale failure must not overwrite the newer conversation's state.
      //
      // 过期的失败不得覆盖新会话的状态。
      if (generation != _streamGeneration) return;
      _error = e.toString();
      _safeNotify();
    }
  }
}
