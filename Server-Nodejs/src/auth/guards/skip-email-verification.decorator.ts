import { SetMetadata } from '@nestjs/common';

export const SKIP_EMAIL_VERIFICATION_KEY = 'skip_email_verification';

/**
 * 标记端点跳过邮箱验证限制（未验证邮箱也可访问）。
 */
export const SkipEmailVerification = () =>
  SetMetadata(SKIP_EMAIL_VERIFICATION_KEY, true);
