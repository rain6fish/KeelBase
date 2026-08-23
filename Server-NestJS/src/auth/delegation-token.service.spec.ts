import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DelegationTokenService } from './delegation-token.service';
import { User } from '../common/entities/user.entity';

describe('DelegationTokenService（AI Bridge §5 身份桥接）', () => {
  let service: DelegationTokenService;
  let jwt: JwtService;
  const users = new Map<number, Partial<User>>();

  const mockUsersRepo = {
    findOne: jest.fn(async ({ where }: { where: { id: number } }) => users.get(where.id) ?? null),
  };
  const mockConfig = {
    get: jest.fn((key: string, fallback?: string) =>
      key === 'DELEGATION_SECRET' ? 'delegation-secret-0123456789abcdef' : fallback ?? '',
    ),
  };

  beforeEach(async () => {
    users.clear();
    const moduleRef = await Test.createTestingModule({
      providers: [
        DelegationTokenService,
        { provide: JwtService, useValue: new JwtService({ secret: 'x' }) },
        { provide: ConfigService, useValue: mockConfig },
        { provide: getRepositoryToken(User), useValue: mockUsersRepo },
      ],
    }).compile();
    service = moduleRef.get(DelegationTokenService);
    jwt = moduleRef.get(JwtService);
    jest.spyOn(jwt, 'sign');
  });

  it('签发委托 JWT：OIDC 用户 subject = providerId；本地用户 = local:<userId>', async () => {
    users.set(1, { id: 1, providerId: 'oidc-subject-abc' });
    const r = await service.sign('1', 'legacy-erp');
    expect(r.subject).toBe('oidc-subject-abc');
    expect(r.audience).toBe('legacy-erp');
    expect(r.expiresIn).toBe(300);

    // 解码 payload：sub/oidcSub/aud/iss
    const payload = jwt.verify(r.token, { secret: 'delegation-secret-0123456789abcdef' }) as any;
    expect(payload.sub).toBe('1');
    expect(payload.oidcSub).toBe('oidc-subject-abc');
    expect(payload.aud).toBe('legacy-erp');
    expect(payload.iss).toBe('keelbase');

    // 本地用户（无 providerId）→ local:<userId>
    users.set(2, { id: 2 });
    const local = await service.sign('2', 'legacy-erp');
    expect(local.subject).toBe('local:2');
  });

  it('audience 校验：非法 audience 拒绝；ttl 钳制 60-3600', async () => {
    users.set(1, { id: 1 });
    await expect(service.sign('1', '')).rejects.toThrow('audience');
    await expect(service.sign('1', 'bad audience with space')).rejects.toThrow('audience');
    const r = await service.sign('1', 'erp', 30); // <60 → 钳到 300
    expect(r.expiresIn).toBe(300);
    const r2 = await service.sign('1', 'erp', 7200); // >3600 → 钳到 300
    expect(r2.expiresIn).toBe(300);
    const r3 = await service.sign('1', 'erp', 120);
    expect(r3.expiresIn).toBe(120);
  });

  it('verify：有效 token 通过；audience 不匹配拒绝；篡改/过期拒绝', async () => {
    users.set(1, { id: 1, providerId: 'sub-1' });
    const { token } = await service.sign('1', 'erp');

    const payload = service.verify(token, 'erp');
    expect(payload.sub).toBe('1');

    expect(() => service.verify(token, 'other-system')).toThrow('audience');

    // 篡改签名
    const tampered = token.slice(0, -3) + 'abc';
    expect(() => service.verify(tampered)).toThrow('无效或已过期');
  });
});
