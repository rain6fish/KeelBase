// SPDX-License-Identifier: Apache-2.0

import {
  isSensitiveKey,
  maskEmail,
  maskPhone,
  maskText,
  redactSensitive,
  registerSensitiveKeys,
} from './mask';

describe('mask utils', () => {
  describe('maskEmail', () => {
    it('masks only the local part, keeps the domain', () => {
      expect(maskEmail('alice@example.com')).toBe('a***@example.com');
    });

    it('keeps first char of local part', () => {
      expect(maskEmail('admin@example.com')).toBe('a***@example.com');
    });

    it('handles email without @', () => {
      expect(maskEmail('not-an-email')).toBe('***');
    });
  });

  describe('maskPhone', () => {
    it('keeps first 3 and last 4 digits', () => {
      expect(maskPhone('13800138000')).toBe('138****8000');
    });

    it('strips non-digit separators but keeps all leading digits', () => {
      expect(maskPhone('+86 138-0013-8000')).toBe('861****8000');
    });

    it('short numbers fully masked', () => {
      expect(maskPhone('12345')).toBe('***');
    });
  });

  describe('maskText', () => {
    it('masks short text', () => {
      expect(maskText('张')).toBe('*');
      expect(maskText('Alex')).toBe('Al**');
    });
  });

  describe('redactSensitive', () => {
    it('redacts password and token values', () => {
      const json = JSON.stringify({ username: 'alex', password: 'Secret123', token: 'abc' });
      const out = redactSensitive(json);
      expect(out).toContain('"password":"***"');
      expect(out).toContain('"token":"***"');
      expect(out).toContain('"username":"alex"');
    });

    it('returns original on invalid JSON', () => {
      expect(redactSensitive('not-json')).toBe('not-json');
    });

    // Fragment names: the built-in list cannot enumerate them, so they can only come from the
    // fragment half of the predicate. The old implementation built one regex per exact name, so
    // these names slipped through with their values in clear text.
    // 片段名：内建清单枚举不到它们，只能靠判据的片段那一半覆盖。旧实现按精确名逐个建正则 ——
    // 这些名字连同其值原样漏掉。
    it('命中片段的名字也打码（apiToken / resetTokenHash / confirmPassword）', () => {
      expect(redactSensitive('{"apiToken":"tok-live-1"}')).toBe('{"apiToken":"***"}');
      expect(redactSensitive('{"resetTokenHash":"deadbeef"}')).toBe('{"resetTokenHash":"***"}');
      expect(redactSensitive('{"confirmPassword":"P@ss1"}')).toBe('{"confirmPassword":"***"}');
    });

    it('嵌套对象与数组照旧覆盖', () => {
      expect(redactSensitive('{"user":{"email":"a@b.c"},"list":[{"phone":"13800138000"}]}')).toBe(
        '{"user":{"email":"***"},"list":[{"phone":"***"}]}',
      );
    });

    // The old implementation only matched quoted values, so a numeric token survived in clear text.
    // 旧实现只匹配「带引号的值」，故数字形式的 token 会原样留下。
    it('敏感名下的非字符串值同样打码', () => {
      expect(redactSensitive('{"token":12345}')).toBe('{"token":"***"}');
    });

    it('非敏感名不动', () => {
      expect(redactSensitive('{"title":"X","status":"active"}')).toBe(
        '{"title":"X","status":"active"}',
      );
    });
  });

  // The predicate the audit before-snapshot and the request-body redaction share (D-AUDIT-1). These
  // cases pin both halves of it: the built-in list, which carries the PII names, and the fragment
  // rule, which covers the names the list cannot enumerate.
  // 审计 before 快照与 requestBody 打码共用的判据（D-AUDIT-1）。这里钉住它的两半：
  // 内建清单（含 PII 名）与片段规则（清单枚举不到的名字）。
  describe('isSensitiveKey', () => {
    it('内建清单里的 PII 名算敏感 —— before 快照原先漏掉的正是这些', () => {
      expect(isSensitiveKey('email')).toBe(true);
      expect(isSensitiveKey('phone')).toBe(true);
      expect(isSensitiveKey('dateOfBirth')).toBe(true);
    });

    it('清单枚举不到、但命中片段的名字仍算敏感（并集 ⇒ 旧覆盖不打折）', () => {
      expect(isSensitiveKey('apiToken')).toBe(true);
      expect(isSensitiveKey('resetTokenHash')).toBe(true);
      expect(isSensitiveKey('confirmPassword')).toBe(true);
      expect(isSensitiveKey('clientSecret')).toBe(true);
    });

    it('大小写不敏感', () => {
      expect(isSensitiveKey('EMAIL')).toBe(true);
      expect(isSensitiveKey('AccessToken')).toBe(true);
    });

    it('普通字段名不算敏感', () => {
      expect(isSensitiveKey('title')).toBe(false);
      expect(isSensitiveKey('status')).toBe(false);
    });

    it('模块注册的名算敏感', () => {
      registerSensitiveKeys(['idCardNoKeyTest']);
      expect(isSensitiveKey('idCardNoKeyTest')).toBe(true);
    });
  });

  // Extra key names a module declares (protocol `pii` → registerSensitiveKeys). The names come from
  // the module, so these cases pin exact matching: a name is the declared one or it is not, with no
  // pattern semantics — and registration only ever adds, so a module cannot weaken what the platform
  // already knows.
  // 模块声明的额外键名（协议 pii → registerSensitiveKeys）。键名由模块提供，故这里钉住「精确匹配」：
  // 要么就是声明的那个名字，要么不是 —— 不带模式语义；且只增不减，注册不会削弱平台已知的名字。
  describe('registerSensitiveKeys', () => {
    it('模块声明的键名参与打码（内建清单不认识这些名字）', () => {
      registerSensitiveKeys(['idCardNoPiiTest']);
      expect(redactSensitive('{"idCardNoPiiTest":"110101199001011234"}')).toBe(
        '{"idCardNoPiiTest":"***"}',
      );
    });

    it('含元字符的键名按字面匹配 —— 不得放大匹配', () => {
      registerSensitiveKeys(['a.bPiiTest']);
      expect(redactSensitive('{"a.bPiiTest":"secret"}')).toBe('{"a.bPiiTest":"***"}');
      // Names match literally: one character apart is a different name. Under the old per-name regex,
      // an unescaped `.` would have matched this line too.
      // 名字按字面匹配：差一个字符就不是同一个名字。旧实现的逐名正则里，未转义的 `.` 会把这一行也匹配掉。
      expect(redactSensitive('{"axbPiiTest":"keep"}')).toBe('{"axbPiiTest":"keep"}');
    });

    it('键名含 $ 时按字面匹配（$ 不再有替换串语义）', () => {
      registerSensitiveKeys(['pr$icePiiTest']);
      expect(redactSensitive('{"pr$icePiiTest":"9.99"}')).toBe('{"pr$icePiiTest":"***"}');
    });

    it('忽略空串与非字符串，不抛错', () => {
      expect(() => registerSensitiveKeys(['', undefined as unknown as string])).not.toThrow();
    });
  });
});
