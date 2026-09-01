// SPDX-License-Identifier: Apache-2.0

import 'dart:async';
import 'package:flutter/foundation.dart';
import '../../data/models/tool_step_model.dart';
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../../../../core/api/sse_client.dart';
import '../../../../core/api/ws_client.dart';
import '../../../../core/errors/exceptions.dart';

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

/// 待人工确认的 AI 写操作（来自 SSE confirmation_request 事件）
class PendingConfirmation {
  final String token;
  final String toolName;
  final String summary;
  final Map<String, dynamic> arguments;
  final AuthorizationReasons? authorization;

  const PendingConfirmation({
    required this.token,
    required this.toolName,
    required this.summary,
    this.arguments = const {},
    this.authorization,
  });
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

  /// 委托触发词（与后端 SkillsRegistry.triggerKeywords + router delegateKeywords 对齐）。
  /// 命中 → 走非流式 /ai/chat 触发 SubAgentOrchestrator，而非流式 SSE 无意图路由。
  static const List<String> _delegateTriggers = [
    // week-plan 技能
    '安排本周', '安排这周', '规划本周', '规划这周', '本周安排', '这周安排', '本周计划', '周计划', '周安排',
    // delegate 意图
    '综合分析', '综合来看', '分别', '统筹', '全面分析', '盘点', '帮我规划', '做个规划', '汇总一下', '归纳',
  ];

  /// 动作词（写操作 → 走流式确认，不委托）
  static const List<String> _actionVerbs = ['创建', '新增', '添加', '删除', '编辑', '修改', '取消'];
  /// 导航词（→ 走流式导航，不委托）
  static const List<String> _navVerbs = ['打开', '去', '跳转', '转到', '前往', '进入', '到'];

  /// 是否应走非流式委托：命中委托触发词，且非动作/导航请求。
  bool _shouldDelegate(String text) {
    final t = text.trim();
    if (_actionVerbs.any((v) => t.contains(v))) return false;
    if (_navVerbs.any((v) => t.contains(v))) return false;
    return _delegateTriggers.any((k) => t.contains(k));
  }

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

  /// 当前模型展示名
  String get providerLabel => switch (_provider) {
        'qwen' => '通义千问',
        _ => 'DeepSeek',
      };

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

    try {
      if (_shouldDelegate(text)) {
        // 委托请求：走非流式 /ai/chat（后端触发 SubAgentOrchestrator），无 SSE 打字机
        await _sendNonStreaming(body, gen);
      } else if (_wsClient != null) {
        // RG-6：走 WS 双向通道（ai:chat → ai:* 事件）
        await _sendViaWs(body, gen);
      } else {
        // SSE 降级：per-request 流
        await for (final event in _sseClient.postStream('/ai/chat/stream', body: body)) {
          // clearConversation / loadConversation 会递增 _streamGeneration 取消本次流
          if (gen != _streamGeneration) break;
          _handleChunk(event['type'] as String?, event['data'] as Map<String, dynamic>?, buf);
        }
      }
    } catch (e) {
      // 如果还没有任何内容被追加，显示错误
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

  /// WS 流式：发 ai:chat，消费 ai:* 帧（剥离 ai: 前缀喂给 [_handleChunk]）；
  /// done/error 或代际变化时终止。确认决策仍走 REST /ai/confirmations/:token。
  Future<void> _sendViaWs(Map<String, dynamic> body, int gen) async {
    final ws = _wsClient!;
    ws.connect();
    final buf = StringBuffer();
    final done = Completer<void>();
    _wsSub?.cancel();
    _wsSub = ws.events.listen((frame) {
      if (gen != _streamGeneration) {
        _wsSub?.cancel();
        if (!done.isCompleted) done.complete();
        return;
      }
      final event = frame['event'] as String?;
      final data = frame['data'] as Map<String, dynamic>?;
      if (event == null || !event.startsWith('ai:')) return; // 只处理 AI 流帧
      final type = event.substring(3);
      _handleChunk(type, data, buf);
      if (type == 'error' || type == 'done') {
        _wsSub?.cancel();
        if (!done.isCompleted) done.complete();
      }
    });
    ws.send('ai:chat', body);
    // 兜底超时：后端总在流 finally 发 ai:done；极端情况（abort/断连）90s 放行
    await done.future.timeout(const Duration(seconds: 90), onTimeout: () {});
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
        final c = data?['confirmation'] as Map<String, dynamic>?;
        if (c != null) {
          final pending = PendingConfirmation(
            token: c['token'] as String,
            toolName: c['toolName'] as String? ?? '',
            summary: c['summary'] as String? ?? '',
            arguments: (c['arguments'] as Map?)?.cast<String, dynamic>() ??
                const {},
            authorization: c['authorization'] is Map<String, dynamic>
                ? AuthorizationReasons.fromJson(
                    c['authorization'] as Map<String, dynamic>)
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
        final ts = data?['toolStart'] as Map<String, dynamic>?;
        if (ts != null) {
          final step = ToolStepModel(
            name: ts['name'] as String? ?? '',
            status: ToolStepStatus.running,
            summary: ts['summary'] as String? ?? '',
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
                summary: te['summary'] as String? ?? step.summary,
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
      case 'error':
        final errMsg = data?['error'] as String? ?? 'Stream error';
        if (_messages.isNotEmpty) {
          _messages = [
            ..._messages.sublist(0, _messages.length - 1),
            ChatMessageModel(role: 'assistant', content: _errorWithDetail(errMsg)),
          ];
          _safeNotify();
        }
        break;
    }
  }

  /// 非流式委托调用：替换占位 assistant 消息为完整回复，并同步 conversationId / 导航。
  Future<void> _sendNonStreaming(Map<String, dynamic> body, int gen) async {
    try {
      final json = await _apiClient.post('/ai/chat', data: body);
      final response = ApiResponse.fromJson(json, (data) => data as Map<String, dynamic>);
      if (response.code < 200 || response.code >= 300) {
        throw NetworkException(response.message);
      }
      if (gen != _streamGeneration) return; // 已被 clear/load 取消
      final data = response.data;
      final reply = data?['reply'] as String? ?? '';
      final convId = data?['conversationId'] as String?;
      final nav = data?['navigateTo'] as String?;

      if (_messages.isEmpty) return; // 对话已被清空
      _messages = [
        ..._messages.sublist(0, _messages.length - 1),
        ChatMessageModel(role: 'assistant', content: reply),
      ];
      if (convId != null && convId.isNotEmpty) {
        _currentConversationId = convId;
      }
      if (nav != null && nav.isNotEmpty) {
        _navigateTo = nav;
      }
      _error = null;
      _safeNotify();
    } catch (e) {
      if (gen != _streamGeneration) return;
      if (_messages.isEmpty) return;
      _messages = [
        ..._messages.sublist(0, _messages.length - 1),
        ChatMessageModel(role: 'assistant', content: _errorRetry()),
      ];
      _safeNotify();
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
          'decision': approved ? 'approve' : 'reject',
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
    _safeNotify();
  }

  /// 加载历史对话的完整消息，填充聊天界面（用于从历史列表切换）
  Future<void> loadConversation(String id) async {
    _streamGeneration++; // 取消进行中的 SSE/WS 流
    _cancelWsStream();
    _currentConfirmation = null;
    _isConfirming = false;
    _isLoading = false;
    _isStreaming = false;
    _navigateTo = null;
    _pendingMessage = null;
    try {
      final json = await _apiClient.get('/ai/conversations/$id');
      final response = ApiResponse.fromJson(json, (data) => data as Map<String, dynamic>);
      if (response.code < 200 || response.code >= 300) {
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
      _error = e.toString();
      _safeNotify();
    }
  }
}
