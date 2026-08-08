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
