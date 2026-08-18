import 'package:flutter_test/flutter_test.dart';
import 'package:front_app/features/ai/data/models/ai_trace_models.dart';

void main() {
  group('AiTraceEffect', () {
    test('fromJson 全字段', () {
      final e = AiTraceEffect.fromJson({
        'effectId': 7,
        'resultType': 'event',
        'resultId': 42,
        'targetTitle': '产品评审',
        'revocable': true,
      });
      expect(e.effectId, 7);
      expect(e.resultType, 'event');
      expect(e.resultId, 42);
      expect(e.targetTitle, '产品评审');
      expect(e.revocable, true);
    });

    test('缺省字段回退默认值', () {
      final e = AiTraceEffect.fromJson({});
      expect(e.effectId, 0);
      expect(e.resultType, '');
      expect(e.resultId, 0);
      expect(e.targetTitle, isNull);
      expect(e.revocable, false);
    });
  });

  group('AiTraceStep', () {
    test('type 判定 getter', () {
      final step = AiTraceStep(id: 's1', type: 'tool_call', time: 't');
      expect(step.isToolCall, isTrue);
      expect(step.isConfirmation, isFalse);
      expect(step.isEffect, isFalse);
      expect(step.isInput, isFalse);
      expect(step.isAssistant, isFalse);

      final conf = AiTraceStep(id: 'c', type: 'confirmation', time: 't');
      expect(conf.isConfirmation, isTrue);

      final eff = AiTraceStep(id: 'e', type: 'effect', time: 't');
      expect(eff.isEffect, isTrue);

      final input = AiTraceStep(id: 'i', type: 'input', time: 't');
      expect(input.isInput, isTrue);

      final asst = AiTraceStep(id: 'a', type: 'assistant', time: 't');
      expect(asst.isAssistant, isTrue);
    });

    test('fromJson 全字段 + 嵌套 effect', () {
      final s = AiTraceStep.fromJson({
        'id': 's1',
        'type': 'effect',
        'time': '2026-08-01T10:00:00Z',
        'toolName': 'create_event',
        'args': '{"title":"x"}',
        'success': true,
        'errorMessage': null,
        'outcome': 'approve',
        'trusted': true,
        'content': '已创建',
        'detail': 'detail',
        'model': 'deepseek',
        'provider': 'deepseek',
        'tokens': 123,
        'effect': {'effectId': 7, 'resultType': 'event', 'resultId': 42, 'revocable': true},
      });
      expect(s.id, 's1');
      expect(s.type, 'effect');
      expect(s.toolName, 'create_event');
      expect(s.success, true);
      expect(s.outcome, 'approve');
      expect(s.trusted, true);
      expect(s.model, 'deepseek');
      expect(s.tokens, 123);
      expect(s.effect?.effectId, 7);
    });

    test('fromJson 缺省字段回退', () {
      final s = AiTraceStep.fromJson({});
      expect(s.id, '');
      expect(s.type, 'notice');
      expect(s.time, '');
      expect(s.toolName, isNull);
      expect(s.success, isNull);
      expect(s.effect, isNull);
    });

    test('fromJson 非 Map effect 回退 null', () {
      final s = AiTraceStep.fromJson({'id': 'x', 'type': 'tool_call', 'time': 't', 'effect': 'oops'});
      expect(s.effect, isNull);
    });
  });

  group('AiTrace', () {
    test('fromJson 聚合 conversation + steps', () {
      final t = AiTrace.fromJson({
        'conversation': {'id': 'conv-1', 'provider': 'deepseek', 'model': 'deepseek-chat'},
        'steps': [
          {'id': 's1', 'type': 'input', 'time': 't'},
          {'id': 's2', 'type': 'assistant', 'time': 't'},
        ],
      });
      expect(t.id, 'conv-1');
      expect(t.provider, 'deepseek');
      expect(t.model, 'deepseek-chat');
      expect(t.steps, hasLength(2));
      expect(t.steps.first.id, 's1');
    });

    test('缺省字段回退空 conversation', () {
      final t = AiTrace.fromJson({});
      expect(t.id, '');
      expect(t.provider, isNull);
      expect(t.model, isNull);
      expect(t.steps, isEmpty);
    });
  });
}
