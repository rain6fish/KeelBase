// SPDX-License-Identifier: Apache-2.0

import { HttpStatus } from '@nestjs/common';

/**
 * 业务错误码定义（RG-5 + NC-2 DX 错误可执行化）。
 *
 * 每个业务错误码映射：默认 HTTP 状态码 + 中英文文案 + 可选的
 * reason（为什么）/ impact（影响）/ nextStep（下一步怎么办）——把报错变向导。
 * 抛出 BusinessException(errorCode) 时，AllExceptionsFilter 按请求头
 * Accept-Language 返回对应语言的 message，响应体附加 errorCode + reason/impact/nextStep，
 * 供前端按码做精确处理 + 渲染「怎么办」。code 字段保持 HTTP 状态码，向后兼容。
 */
export interface ApiErrorCodeDef {
  status: HttpStatus;
  zh: string;
  en: string;
  /** NC-2：为什么发生（可选，缺省则响应省略该字段） */
  reason?: { zh: string; en: string };
  /** NC-2：对用户/请求的影响 */
  impact?: { zh: string; en: string };
  /** NC-2：下一步怎么办（可执行指引） */
  nextStep?: { zh: string; en: string };
}

export const API_ERROR_CODES: Record<string, ApiErrorCodeDef> = {
  // 认证
  INVALID_CREDENTIALS: {
    status: HttpStatus.UNAUTHORIZED, zh: '用户名或密码错误', en: 'Invalid credentials',
    nextStep: { zh: '请核对用户名与密码后重试，或使用忘记密码', en: 'Check your username and password, or use forgot password' },
  },
  USER_NOT_FOUND: { status: HttpStatus.UNAUTHORIZED, zh: '用户不存在', en: 'User not found' },
  TOKEN_INVALID: { status: HttpStatus.UNAUTHORIZED, zh: '无效的令牌', en: 'Invalid token' },
  TOKEN_EXPIRED: { status: HttpStatus.UNAUTHORIZED, zh: '令牌已过期', en: 'Token expired' },
  ACCOUNT_LOCKED: {
    status: HttpStatus.LOCKED, zh: '账号已锁定，请稍后再试', en: 'Account locked, please try again later',
    impact: { zh: '登录被暂时锁定，期间无法登录', en: 'Login is temporarily locked' },
    nextStep: { zh: '请等待锁定时间结束，或联系管理员解锁', en: 'Wait for the lock to expire or contact an admin' },
  },
  EMAIL_NOT_VERIFIED: {
    status: HttpStatus.FORBIDDEN, zh: '请先验证邮箱', en: 'Please verify your email first',
    impact: { zh: '邮箱未验证，部分写操作被限制', en: 'Email unverified — some write operations are restricted' },
    nextStep: { zh: '查收注册邮箱点击验证链接，或重新发送验证邮件', en: 'Check your inbox for the verification link, or resend the verification email' },
  },

  // WEB-FRONT-4 MFA（TOTP 双因素）
  MFA_REQUIRED: {
    status: HttpStatus.UNAUTHORIZED, zh: '需要两步验证码', en: 'Two-factor code required',
    nextStep: { zh: '用已绑定的身份验证器应用输入 6 位动态码', en: 'Enter the 6-digit code from your authenticator app' },
  },
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
  RATE_LIMITED: {
    status: HttpStatus.TOO_MANY_REQUESTS, zh: '操作过于频繁，请稍后再试', en: 'Too many requests, please try again later',
    impact: { zh: '短时间内请求过多被限流', en: 'Too many requests in a short window' },
    nextStep: { zh: '请稍候片刻再重试', en: 'Please wait a moment and retry' },
  },
  MAINTENANCE_MODE: { status: HttpStatus.SERVICE_UNAVAILABLE, zh: '系统维护中，请稍后再试', en: 'System under maintenance, please try again later' },
  AI_DAILY_LIMIT: {
    status: HttpStatus.TOO_MANY_REQUESTS, zh: '今日 AI 使用次数已达上限', en: 'Daily AI usage limit reached',
    impact: { zh: '今日 AI 对话/工具调用已暂停', en: 'AI usage is paused for today' },
    nextStep: { zh: '次日 0 点自动恢复，或联系管理员调高每日限额', en: 'Resets at midnight, or ask an admin to raise the daily limit' },
  },

  // NC-2：LLM 无可用 provider（未配置 / 全部调用失败）——原裸 Error 500 改可执行
  LLM_UNAVAILABLE: {
    status: HttpStatus.BAD_GATEWAY, zh: 'AI 服务暂不可用', en: 'AI service temporarily unavailable',
    reason: { zh: '没有可用的模型 provider（未配置或全部调用失败）', en: 'No available model provider (not configured or all calls failed)' },
    impact: { zh: '本轮 AI 对话/评测无法生成回答', en: 'This AI request cannot produce a response' },
    nextStep: { zh: '检查 AI_PROVIDER 与对应 API Key / Base URL 配置后重试', en: 'Check the AI_PROVIDER and its API key / base URL, then retry' },
  },
};
