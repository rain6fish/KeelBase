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

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = '服务器内部错误';
    let code = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
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
