import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { ApiResponse } from '../interfaces/api-response.interface';
import { API_ERROR_CODES } from '../errors/api-error-codes';
import { BusinessException } from '../errors/business.exception';

/** 按 Accept-Language 选择语言（zh 开头 → 中文，其余 → 英文） */
function pickLanguage(request: Request): 'zh' | 'en' {
  const accept = request.headers['accept-language'];
  return typeof accept === 'string' && accept.toLowerCase().startsWith('zh') ? 'zh' : 'en';
}

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const lang = pickLanguage(request);

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = lang === 'zh' ? '服务器内部错误' : 'Internal server error';
    let code = HttpStatus.INTERNAL_SERVER_ERROR;
    let errorCode: string | undefined;

    if (exception instanceof BusinessException) {
      // 业务错误码：按 Accept-Language 本地化；显式覆盖 message 时用覆盖值
      const def = API_ERROR_CODES[exception.errorCode];
      httpStatus = exception.getStatus();
      code = httpStatus;
      errorCode = exception.errorCode;
      message =
        exception.customMessage ??
        (def ? (lang === 'zh' ? def.zh : def.en) : exception.message);
    } else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'string') {
        message = exceptionResponse;
      } else if (typeof exceptionResponse === 'object') {
        const resp = exceptionResponse as Record<string, unknown>;
        message =
          (resp.message as string) ||
          (resp.error as string) ||
          exception.message;

        // class-validator 返回的 message 可能是数组
        if (Array.isArray(resp.message)) {
          message = (resp.message as string[]).join('; ');
        }
      }

      code = httpStatus;
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    this.logger.error(
      `${request.method} ${request.url} - ${httpStatus}: ${message}`,
      exception instanceof Error ? exception.stack : '',
    );

    const body: Record<string, unknown> = {
      code,
      message,
      data: null,
      timestamp: new Date().toISOString(),
    };

    if (errorCode != null) {
      body.errorCode = errorCode;
    }

    // Pass through extra fields from the exception (e.g. retryAfter)
    if (exception instanceof HttpException) {
      const resp = exception.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        const record = resp as Record<string, unknown>;
        if (record.retryAfter != null) {
          body.retryAfter = record.retryAfter;
        }
      }
    }

    response.status(httpStatus).json(body);
  }
}
