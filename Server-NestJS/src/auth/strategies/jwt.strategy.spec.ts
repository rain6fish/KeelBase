import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy', () => {
  let configService: { getOrThrow: jest.Mock };

  beforeEach(() => {
    configService = { getOrThrow: jest.fn().mockReturnValue('test-secret') };
    new JwtStrategy(configService as unknown as ConfigService);
  });

  it('构造时读取 JWT_SECRET', () => {
    expect(configService.getOrThrow).toHaveBeenCalledWith('JWT_SECRET');
  });

  it('validate 返回合法 payload', async () => {
    const strategy = new JwtStrategy(configService as unknown as ConfigService);
    const payload = { sub: 1, username: 'alex' };
    await expect(strategy.validate(payload as never)).resolves.toBe(payload);
  });

  it('validate 缺 sub 或 username 抛 Unauthorized', async () => {
    const strategy = new JwtStrategy(configService as unknown as ConfigService);
    await expect(strategy.validate({} as never)).rejects.toThrow(UnauthorizedException);
    await expect(strategy.validate({ sub: 1 } as never)).rejects.toThrow(UnauthorizedException);
  });
});
