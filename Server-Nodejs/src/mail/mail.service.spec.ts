import { ConfigService } from '@nestjs/config';
import { MailService } from './mail.service';

describe('MailService', () => {
  const mockTransporter = {
    sendMail: jest.fn().mockResolvedValue({ messageId: 'test' }),
  };

  function createService(transporter: unknown, smtpFrom = 'KeelBase <no-reply@example.com>') {
    const mockConfig = {
      get: jest.fn((key: string) => {
        if (key === 'SMTP_FROM') return smtpFrom;
        return undefined;
      }),
    };
    return new MailService(
      transporter as any,
      mockConfig as unknown as ConfigService,
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
});
