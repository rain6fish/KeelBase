import { HttpException } from '@nestjs/common';
import { API_ERROR_CODES } from './api-error-codes';

/**
 * 业务异常（RG-5）：抛出业务错误码，由 AllExceptionsFilter 统一按语言本地化。
 *
 * 用法：throw new BusinessException('EVENT_NOT_FOUND');
 * 可选 message 覆盖默认文案（仅当确需自定义时）。
 */
export class BusinessException extends HttpException {
  readonly errorCode: string;

  /** 显式覆盖的文案；undefined 时由 filter 按 Accept-Language 本地化 */
  readonly customMessage?: string;

  constructor(errorCode: string, overrideMessage?: string) {
    const def = API_ERROR_CODES[errorCode];
    const status = def?.status ?? 400;
    super(
      overrideMessage != null ? { errorCode, message: overrideMessage } : { errorCode },
      status,
    );
    this.errorCode = errorCode;
    this.customMessage = overrideMessage;
  }

  static of(errorCode: string, overrideMessage?: string): BusinessException {
    return new BusinessException(errorCode, overrideMessage);
  }
}
