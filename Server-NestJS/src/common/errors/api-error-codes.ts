import { HttpStatus } from '@nestjs/common';

/**
 * 业务错误码定义（RG-5）。
 *
 * 每个业务错误码映射：默认 HTTP 状态码 + 中英文文案。
 * 抛出 BusinessException(errorCode) 时，AllExceptionsFilter 按请求头
 * Accept-Language 返回对应语言的 message，响应体附加 errorCode 字符串，
 * 供前端按码做精确处理。code 字段保持 HTTP 状态码，向后兼容。
 */
export interface ApiErrorCodeDef {
  status: HttpStatus;
  zh: string;
  en: string;
}

export const API_ERROR_CODES: Record<string, ApiErrorCodeDef> = {
  // 认证
  INVALID_CREDENTIALS: { status: HttpStatus.UNAUTHORIZED, zh: '用户名或密码错误', en: 'Invalid credentials' },
  USER_NOT_FOUND: { status: HttpStatus.UNAUTHORIZED, zh: '用户不存在', en: 'User not found' },
  TOKEN_INVALID: { status: HttpStatus.UNAUTHORIZED, zh: '无效的令牌', en: 'Invalid token' },
  TOKEN_EXPIRED: { status: HttpStatus.UNAUTHORIZED, zh: '令牌已过期', en: 'Token expired' },
  ACCOUNT_LOCKED: { status: HttpStatus.LOCKED, zh: '账号已锁定，请稍后再试', en: 'Account locked, please try again later' },
  EMAIL_NOT_VERIFIED: { status: HttpStatus.FORBIDDEN, zh: '请先验证邮箱', en: 'Please verify your email first' },

  // WEB-FRONT-4 MFA（TOTP 双因素）
  MFA_REQUIRED: { status: HttpStatus.UNAUTHORIZED, zh: '需要两步验证码', en: 'Two-factor code required' },
  INVALID_MFA_CODE: { status: HttpStatus.BAD_REQUEST, zh: '两步验证码错误', en: 'Invalid two-factor code' },
  PASSWORD_SAME_AS_OLD: { status: HttpStatus.BAD_REQUEST, zh: '新密码不能与旧密码相同', en: 'New password must differ from the old one' },

  // 注册/绑定
  USERNAME_ALREADY_EXISTS: { status: HttpStatus.CONFLICT, zh: '用户名已存在', en: 'Username already exists' },
  EMAIL_ALREADY_EXISTS: { status: HttpStatus.CONFLICT, zh: '邮箱已注册', en: 'Email already registered' },
  PHONE_ALREADY_BOUND: { status: HttpStatus.CONFLICT, zh: '该手机号已被绑定', en: 'Phone already bound' },
  PHONE_NOT_REGISTERED: { status: HttpStatus.NOT_FOUND, zh: '手机号未注册', en: 'Phone not registered' },
  VERIFICATION_CODE_INVALID: { status: HttpStatus.BAD_REQUEST, zh: '验证码错误或已过期', en: 'Invalid or expired verification code' },
  RESET_TOKEN_INVALID: { status: HttpStatus.UNAUTHORIZED, zh: '重置链接无效或已过期', en: 'Invalid or expired reset token' },

  // 资源
  EVENT_NOT_FOUND: { status: HttpStatus.NOT_FOUND, zh: '事件不存在', en: 'Event not found' },
  TODO_NOT_FOUND: { status: HttpStatus.NOT_FOUND, zh: '待办不存在', en: 'Todo not found' },
  NOTIFICATION_NOT_FOUND: { status: HttpStatus.NOT_FOUND, zh: '通知不存在', en: 'Notification not found' },
  SESSION_NOT_FOUND: { status: HttpStatus.UNAUTHORIZED, zh: '会话不存在', en: 'Session not found' },
  LAST_ADMIN_PROTECTED: { status: HttpStatus.BAD_REQUEST, zh: '不能删除唯一的系统管理员', en: 'Cannot delete the last admin' },

  // 通用
  FORBIDDEN: { status: HttpStatus.FORBIDDEN, zh: '无权访问', en: 'Forbidden' },
  RATE_LIMITED: { status: HttpStatus.TOO_MANY_REQUESTS, zh: '操作过于频繁，请稍后再试', en: 'Too many requests, please try again later' },
  MAINTENANCE_MODE: { status: HttpStatus.SERVICE_UNAVAILABLE, zh: '系统维护中，请稍后再试', en: 'System under maintenance, please try again later' },
  AI_DAILY_LIMIT: { status: HttpStatus.TOO_MANY_REQUESTS, zh: '今日 AI 使用次数已达上限', en: 'Daily AI usage limit reached' },
};
