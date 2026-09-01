// SPDX-License-Identifier: Apache-2.0

/**
 * 管理端数据脱敏工具。
 * 原则：管理页面不出现用户填写的个人数据/隐私数据；必须出现时用掩码遮盖。
 * 掩码在服务端完成，前端与管理端 API 调用方均拿不到明文。
 */

/** 邮箱掩码：只掩码 @ 前缀，@ 后的域名保留。alice@example.com → a***@example.com */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  return `${local.slice(0, 1)}***@${domain}`;
}

/** 手机号掩码：13800138000 → 138****8000 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return '***';
  return `${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

/** 通用掩码：超过一半长度用 *，用于姓氏/名等短字段 */
export function maskText(value: string): string {
  if (value.length <= 1) return '*';
  const keep = Math.ceil(value.length / 3);
  return `${value.slice(0, keep)}${'*'.repeat(value.length - keep)}`;
}

/** 敏感字段名（大小写不敏感匹配）——审计 requestBody 打码用 */
const SENSITIVE_KEYS = [
  'password',
  'oldpassword',
  'newpassword',
  'refreshToken',
  'accessToken',
  'token',
  'secret',
  'apikey',
  'apiKey',
  'authorization',
  // CR-4：个人隐私字段（审计 requestBody 打码）
  'email',
  'phone',
  'bio',
  'firstName',
  'lastName',
  'dateOfBirth',
  'birthday',
  'address',
  'avatarUrl',
  'providerId',
  'providerHash',
];

/** 对 JSON 字符串中的敏感字段值打码。非法输入原样返回。 */
export function redactSensitive(json: string): string {
  try {
    let redacted = json;
    for (const key of SENSITIVE_KEYS) {
      // 匹配 "key": "值" 或 "key":"值"
      const re = new RegExp(`"${key}"\\s*:\\s*"[^"]*"`, 'gi');
      redacted = redacted.replace(re, `"${key}":"***"`);
    }
    return redacted;
  } catch {
    return json;
  }
}
