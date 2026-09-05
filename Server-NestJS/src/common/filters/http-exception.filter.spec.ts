// SPDX-License-Identifier: Apache-2.0

import { BadRequestException, HttpStatus, InternalServerErrorException } from '@nestjs/common';
import { AllExceptionsFilter } from './http-exception.filter';
import { BusinessException } from '../errors/business.exception';

function makeHost(acceptLanguage?: string) {
  const response = { status: jest.fn().mockReturnThis(), json: jest.fn() };
  const request = {
    method: 'GET',
    url: '/api/v1/test',
    ip: '1.2.3.4',
    headers: acceptLanguage ? { 'accept-language': acceptLanguage } : {},
  };
  const host = {
    switchToHttp: () => ({ getResponse: () => response, getRequest: () => request }),
  };
  return { response, host } as any;
}

describe('AllExceptionsFilter', () => {
  const filter = new AllExceptionsFilter();

  beforeEach(() => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('BusinessException + Accept-Language zh → 中文 message + errorCode', () => {
    const { response, host } = makeHost('zh-CN,zh;q=0.9');
    filter.catch(new BusinessException('EVENT_NOT_FOUND'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe(HttpStatus.NOT_FOUND);
    expect(body.errorCode).toBe('EVENT_NOT_FOUND');
    expect(body.message).toBe('事件不存在');
    expect(body.data).toBeNull();
  });

  it('BusinessException + Accept-Language en → 英文 message', () => {
    const { response, host } = makeHost('en-US,en;q=0.9');
    filter.catch(new BusinessException('EVENT_NOT_FOUND'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('Event not found');
  });

  it('BusinessException 无 Accept-Language → 默认英文 message', () => {
    const { response, host } = makeHost();
    filter.catch(new BusinessException('EVENT_NOT_FOUND'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('Event not found');
  });

  it('BusinessException 覆盖 message 时用覆盖值', () => {
    const { response, host } = makeHost('zh-CN');
    filter.catch(new BusinessException('EVENT_NOT_FOUND', '自定义'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('自定义');
  });

  it('NC-2：带 reason/impact/nextStep 的码 → zh 透传可执行指引', () => {
    const { response, host } = makeHost('zh-CN,zh;q=0.9');
    filter.catch(new BusinessException('LLM_UNAVAILABLE'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe(HttpStatus.BAD_GATEWAY);
    expect(body.errorCode).toBe('LLM_UNAVAILABLE');
    expect(body.reason).toContain('模型 provider');
    expect(body.impact).toContain('无法生成');
    expect(body.nextStep).toContain('API Key');
  });

  it('NC-2：en 语言 → 英文 reason/impact/nextStep', () => {
    const { response, host } = makeHost('en-US,en;q=0.9');
    filter.catch(new BusinessException('LLM_UNAVAILABLE'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('AI service temporarily unavailable');
    expect(body.reason).toContain('No available model provider');
    expect(body.nextStep).toContain('API key');
  });

  it('NC-2：码未填 reason/impact/nextStep → 响应省略这些字段（不空串）', () => {
    const { response, host } = makeHost('zh-CN');
    filter.catch(new BusinessException('EVENT_NOT_FOUND'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.reason).toBeUndefined();
    expect(body.impact).toBeUndefined();
    expect(body.nextStep).toBeUndefined();
  });

  it('普通 HttpException 无 errorCode，message 透传', () => {
    const { response, host } = makeHost('zh-CN');
    filter.catch(new BadRequestException('bad input'), host);
    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe(HttpStatus.BAD_REQUEST);
    expect(body.message).toBe('bad input');
    expect(body.errorCode).toBeUndefined();
  });

  it('class-validator 数组 message 拼接为字符串', () => {
    const { response, host } = makeHost('zh-CN');
    const ex = new BadRequestException(['field required', 'too long']);
    filter.catch(ex, host);
    const body = response.json.mock.calls[0][0];
    expect(body.message).toBe('field required; too long');
  });

  it('CR-5 通用 Error 不向客户端泄漏内部错误，原文只进日志/告警', async () => {
    const sendAlert = jest.fn().mockResolvedValue(undefined);
    const filter = new AllExceptionsFilter({ sendAlert } as any);
    const { response, host } = makeHost('zh-CN');

    filter.catch(new Error('SQL error: SELECT * FROM users -- leaked connection string'), host);

    const body = response.json.mock.calls[0][0];
    expect(body.code).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(body.message).toBe('服务器内部错误'); // 不向客户端泄漏原文
    expect(body.message).not.toContain('SQL error');

    await new Promise((r) => setTimeout(r, 0));
    expect(sendAlert).toHaveBeenCalledWith(
      expect.stringContaining('500'),
      'SQL error: SELECT * FROM users -- leaked connection string',
      { ip: '1.2.3.4' },
    );
  });

  describe('RG-4 告警触发', () => {
    it('5xx 异常时调用 alertWebhook.sendAlert', async () => {
      const sendAlert = jest.fn().mockResolvedValue(undefined);
      const filter = new AllExceptionsFilter({ sendAlert } as any);

      const { response, host } = makeHost();
      filter.catch(new InternalServerErrorException('boom'), host);

      // 响应照常返回
      expect(response.json).toHaveBeenCalled();
      // 异步告警触发（微任务）
      await new Promise((r) => setTimeout(r, 0));
      expect(sendAlert).toHaveBeenCalledWith(
        expect.stringContaining('500'),
        'boom',
        { ip: '1.2.3.4' },
      );
    });

    it('4xx 异常不触发告警', async () => {
      const sendAlert = jest.fn().mockResolvedValue(undefined);
      const filter = new AllExceptionsFilter({ sendAlert } as any);

      const { host } = makeHost();
      filter.catch(new BadRequestException('bad'), host);

      await new Promise((r) => setTimeout(r, 0));
      expect(sendAlert).not.toHaveBeenCalled();
    });

    it('未注入 webhook 时不抛错', () => {
      const filter = new AllExceptionsFilter();
      const { response, host } = makeHost();
      filter.catch(new InternalServerErrorException('x'), host);
      expect(response.json).toHaveBeenCalled();
    });
  });
});
