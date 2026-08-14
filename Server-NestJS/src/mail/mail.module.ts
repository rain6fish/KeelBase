/**
 * 邮件模块
 *
 * 用 useFactory 按配置创建 SMTP transport（仿 ai.module 的「无 key 不注册」模式）：
 * MAIL_ENABLED && SMTP_HOST 非空才 createTransport，否则注册 null（MailService 降级为日志）。
 */

import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailService } from './mail.service';
import { MAIL_TRANSPORTER } from './mail.constants';

@Module({
  imports: [ConfigModule],
  providers: [
    {
      provide: MAIL_TRANSPORTER,
      useFactory: (configService: ConfigService) => {
        const enabled = configService.get<boolean>('MAIL_ENABLED', false);
        const host = configService.get<string>('SMTP_HOST', '');
        if (!enabled || !host) {
          return null;
        }
        return nodemailer.createTransport({
          host,
          port: configService.get<number>('SMTP_PORT', 465),
          secure: configService.get<boolean>('SMTP_SECURE', true),
          auth:
            configService.get<string>('SMTP_USER', '') &&
            configService.get<string>('SMTP_PASS', '')
              ? {
                  user: configService.get<string>('SMTP_USER', ''),
                  pass: configService.get<string>('SMTP_PASS', ''),
                }
              : undefined,
        });
      },
      inject: [ConfigService],
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
