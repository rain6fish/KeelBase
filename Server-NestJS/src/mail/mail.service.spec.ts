import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  const mockTransporter = {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }),
  };

  function createService(transporter: unknown, smtpFrom = 'KeelBase <no-reply@example.com>', circuitBreaker?: unknown) {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'SMTP_FROM') return smtpFrom;
        return undefined;
      }),
    };
    return new MailService(
      transporter as any,
      mockConfig as unknown as ConfigService,
      circuitBreaker as any,
    );
  }

  describe('sendMail', () => {
    it('禁用时（transporter null）不调用 transporter，正常返回', async () => {
      const service = createService(null);

      expect(service.enabled).toBe(false);
      await expect(
        service.sendMail({ to: 'a@b.com', subject: 't', html: '<p>x</p>' }),
      ).resolves.toBeUndefined();
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });

    it('启用时调用 transporter.sendMail 并带上 from/to/subject/html', async () => {
      const service = createService(mockTransporter);

      expect(service.enabled).toBe(true);
      await service.sendMail({
        to: 'user@example.com',
        subject: '标题',
        html: '<p>内容</p>',
      });

      expect(mockTransporter.sendMail).toHaveBeenCalledWith({
        from: 'KeelBase <no-reply@example.com>',
        to: 'user@example.com',
        subject: '标题',
        html: '<p>内容</p>',
      });
    });
  });

  describe('模板方法', () => {
    beforeEach(() => mockTransporter.sendMail.mockClear());

    it('sendVerificationEmail 生成含验证码的验证邮件', async () => {
      const service = createService(mockTransporter);
      await service.sendVerificationEmail('user@example.com', '123456');

      const call = mockTransporter.sendMail.mock.calls[0][0];
      expect(call.to).toBe('user@example.com');
      expect(call.subject).toContain('验证码');
      expect(call.html).toContain('123456');
    });

    it('sendPasswordResetEmail 生成含重置链接的邮件', async () => {
      const service = createService(mockTransporter);
      await service.sendPasswordResetEmail(
        'user@example.com',
        'https://app.example.com/reset?token=abc',
      );

      const call = mockTransporter.sendMail.mock.calls[0][0];
      expect(call.subject).toContain('重置密码');
      expect(call.html).toContain('https://app.example.com/reset?token=abc');
    });

    it('sendNotificationEmail 生成含标题与正文的通知邮件', async () => {
      const service = createService(mockTransporter);
      await service.sendNotificationEmail(
        'user@example.com',
        '新事件提醒',
        '你有一个会议明天开始',
      );

      const call = mockTransporter.sendMail.mock.calls[0][0];
      expect(call.subject).toBe('【KeelBase】新事件提醒');
      expect(call.html).toContain('新事件提醒');
      expect(call.html).toContain('你有一个会议明天开始');
    });

    it('模板方法在禁用时同样降级不抛错', async () => {
      const service = createService(null);
      await expect(
        service.sendVerificationEmail('user@example.com', '123456'),
      ).resolves.toBeUndefined();
      await expect(
        service.sendPasswordResetEmail('user@example.com', 'https://x'),
      ).resolves.toBeUndefined();
      expect(mockTransporter.sendMail).not.toHaveBeenCalled();
    });
  });

  describe('发送失败 / circuitBreaker 路径', () => {
    beforeEach(() => mockTransporter.sendMail.mockClear());

    it('transporter.sendMail 失败时错误向上传播（不静默吞掉）', async () => {
      const service = createService(mockTransporter);
      mockTransporter.sendMail.mockRejectedValueOnce(new Error('smtp down'));

      await expect(
        service.sendMail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' }),
      ).rejects.toThrow('smtp down');
    });

    it('注入 circuitBreaker 时经 fire 发送', async () => {
      const fire = jest.fn(async (_name: string, fn: () => Promise<unknown>) => fn());
      const service = createService(mockTransporter, undefined, { fire });

      await service.sendMail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });

      expect(fire).toHaveBeenCalledWith('mail', expect.any(Function));
      expect(mockTransporter.sendMail).toHaveBeenCalled();
    });

    it('未注入 circuitBreaker 时直接调用 transporter（else 分支）', async () => {
      const service = createService(mockTransporter);

      await service.sendMail({ to: 'a@b.com', subject: 's', html: '<p>x</p>' });

      expect(mockTransporter.sendMail).toHaveBeenCalledTimes(1);
    });
  });

  describe('sendMarketingEmail（G-3 运营邮件 + CR-23 转义）', () => {
    beforeEach(() => mockTransporter.sendMail.mockClear());

    it('无 cta 时不渲染按钮链接', async () => {
      const service = createService(mockTransporter);
      await service.sendMarketingEmail('user@example.com', '周报', '本周数据');

      const call = mockTransporter.sendMail.mock.calls[0][0];
      expect(call.subject).toBe('【KeelBase】周报');
      expect(call.html).toContain('本周数据');
      expect(call.html).not.toContain('<a href=');
    });

    it('合法 http/https cta 渲染按钮链接', async () => {
      const service = createService(mockTransporter);
      await service.sendMarketingEmail('user@example.com', '活动', '点击参与', {
        label: '去参加',
        url: 'https://example.com/a?x=1&y=2',
      });

      const call = mockTransporter.sendMail.mock.calls[0][0];
      expect(call.html).toContain('https://example.com/a?x=1&amp;y=2');
      expect(call.html).toContain('去参加');
    });

    it('非 http/https cta（javascript:）被忽略，不渲染按钮', async () => {
      const service = createService(mockTransporter);
      await service.sendMarketingEmail('user@example.com', '活动', '安全提示', {
        label: '点我',
        url: 'javascript:alert(1)',
      });

      const call = mockTransporter.sendMail.mock.calls[0][0];
      expect(call.html).not.toContain('javascript:');
      expect(call.html).not.toContain('<a href=');
    });

    it('subject/body 特殊字符被 HTML 转义（防注入）', async () => {
      const service = createService(mockTransporter);
      await service.sendMarketingEmail('user@example.com', '周报 <script>', '正文 & " \' <b>');

      const call = mockTransporter.sendMail.mock.calls[0][0];
      expect(call.html).toContain('&lt;script&gt;');
      expect(call.html).not.toContain('<script>');
      expect(call.html).toContain('&lt;b&gt;');
    });
  });
});
