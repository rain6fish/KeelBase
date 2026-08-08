/**
 * 邮件服务 — SMTP 发送 + 事务邮件模板
 *
 * 注入 MAIL_TRANSPORTER（未配置 SMTP 时为 null，优雅降级为日志）。
 * 消费方（如 AU-1 密码重置、AU-2 邮箱验证）调用模板方法，无需感知环境差异。
 */

import { Injectable, Inject, Optional, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MAIL_TRANSPORTER } from './mail.constants';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';

export interface MailMessage {
  to: string;
  subject: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly from: string;

  constructor(
    @Inject(MAIL_TRANSPORTER) private readonly transporter: nodemailer.Transporter | null,
    private readonly configService: ConfigService,
    @Optional() private readonly circuitBreaker?: CircuitBreakerService,
  ) {
    this.from = this.configService.get<string>('SMTP_FROM', '');
  }

  get enabled(): boolean {
    return this.transporter != null;
  }

  /**
   * 发送邮件。SMTP 未配置时记录日志并直接返回，不抛错。
   */
  async sendMail(message: MailMessage): Promise<void> {
    if (!this.transporter) {
      this.logger.log(`[Mail] disabled — skip send to ${message.to} (${message.subject})`);
      return;
    }
    const send = () =>
      this.transporter!.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
      });
    if (this.circuitBreaker) {
      await this.circuitBreaker.fire('mail', send);
    } else {
      await send();
    }
    this.logger.log(`[Mail] sent to ${message.to} (${message.subject})`);
  }

  /**
   * 注册验证邮件（验证码）
   */
  async sendVerificationEmail(email: string, code: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: '【ShiYu-AppBase】邮箱验证码',
      html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <h2>邮箱验证</h2>
  <p>您好，</p>
  <p>您的验证码是：</p>
  <p style="font-size: 28px; font-weight: bold; letter-spacing: 4px; color: #1a73e8;">${code}</p>
  <p>验证码 10 分钟内有效，请勿泄露给他人。</p>
  <p>如果这不是您的操作，请忽略本邮件。</p>
</body>
</html>`,
    });
  }

  /**
   * 密码重置邮件（重置链接）
   */
  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    await this.sendMail({
      to: email,
      subject: '【ShiYu-AppBase】重置密码',
      html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <h2>重置密码</h2>
  <p>您好，</p>
  <p>我们收到了重置您密码的请求，请点击以下链接（30 分钟内有效）：</p>
  <p><a href="${resetUrl}" style="display:inline-block; background:#1a73e8; color:#fff; padding:10px 20px; border-radius:4px; text-decoration:none;">重置密码</a></p>
  <p>如果链接无法点击，请复制到浏览器打开：${resetUrl}</p>
  <p>如果这不是您的操作，请忽略本邮件，您的密码不会被修改。</p>
</body>
</html>`,
    });
  }

  /**
   * 站内通知邮件
   */
  async sendNotificationEmail(
    email: string,
    title: string,
    body: string,
  ): Promise<void> {
    await this.sendMail({
      to: email,
      subject: `【ShiYu-AppBase】${title}`,
      html: `<!DOCTYPE html>
<html>
<body style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
  <h2>${title}</h2>
  <p>${body.replace(/\n/g, '<br/>')}</p>
</body>
</html>`,
    });
  }
}
