// SPDX-License-Identifier: Apache-2.0

import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../common/entities/user.entity';

/**
 * MINI-2 微信订阅消息：小程序用户授权后，服务端推送订阅模板消息（补小程序无设备推送通道的缺口）。
 * 依赖 WECHAT_APP_ID/SECRET（换取 access_token，2h 缓存）+ WECHAT_REMIND_TEMPLATE_ID（模板）。
 * 未配置凭据 / 非微信登录用户 → 降级 no-op（不影响主流程），与 PushService 的 Noop 降级同模式。
 *
 * 注：data 字段名（thing1/time2）按模板实际定义调整；小程序端需先 requestSubscribeMessage 授权。
 */
@Injectable()
export class WxSubscribeService {
  private readonly logger = new Logger(WxSubscribeService.name);
  private token: { value: string; expiresAt: number } | null = null;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
  ) {}

  /** 事件提醒 → 微信订阅消息（仅微信登录的小程序用户）。 */
  async sendReminder(userId: number, eventTitle: string): Promise<void> {
    const templateId = this.configService.get<string>('WECHAT_REMIND_TEMPLATE_ID', '');
    if (!templateId || !this._configured()) return; // 未配置 → 降级
    try {
      const user = await this.userRepo.findOne({ where: { id: userId } });
      if (!user || user.provider !== 'wechat' || !user.providerId) return; // 非微信登录用户
      const token = await this._accessToken();
      await this._send(token, user.providerId, templateId, {
        thing1: { value: eventTitle.slice(0, 20) },
        time2: { value: this._now() },
      });
      this.logger.log(`[WxSubscribe] reminder sent user=${userId}`);
    } catch (err) {
      this.logger.warn(`[WxSubscribe] send failed user=${userId}: ${(err as Error).message}`);
    }
  }

  private _configured(): boolean {
    return (
      !!this.configService.get<string>('WECHAT_APP_ID', '') &&
      !!this.configService.get<string>('WECHAT_APP_SECRET', '')
    );
  }

  /** 获取微信 access_token（内存缓存，提前 5 分钟过期刷新）。 */
  private async _accessToken(): Promise<string> {
    if (this.token && this.token.expiresAt > Date.now()) return this.token.value;
    const appId = this.configService.get<string>('WECHAT_APP_ID', '');
    const secret = this.configService.get<string>('WECHAT_APP_SECRET', '');
    const res = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(appId)}&secret=${encodeURIComponent(secret)}`,
    );
    const body = (await res.json()) as { access_token?: string; expires_in?: number; errmsg?: string };
    if (!body.access_token) throw new Error(body.errmsg || '获取微信 access_token 失败');
    this.token = {
      value: body.access_token,
      expiresAt: Date.now() + ((body.expires_in ?? 7200) - 300) * 1000,
    };
    return body.access_token;
  }

  private async _send(
    token: string,
    openid: string,
    templateId: string,
    data: Record<string, { value: string }>,
  ): Promise<void> {
    const res = await fetch(
      `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${token}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          touser: openid,
          template_id: templateId,
          page: 'pages/index/index',
          data,
          miniprogram_state: 'formal',
        }),
      },
    );
    const body = (await res.json()) as { errcode?: number; errmsg?: string };
    if (body.errcode !== 0) throw new Error(`微信订阅消息失败 ${body.errcode}: ${body.errmsg}`);
  }

  private _now(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
}
