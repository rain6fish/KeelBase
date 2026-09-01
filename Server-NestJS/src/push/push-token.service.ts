// SPDX-License-Identifier: Apache-2.0

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { PushToken } from './push-token.entity';

export interface RegisterTokenData {
  deviceId?: string;
  platform: string;
  token: string;
}

@Injectable()
export class PushTokenService {
  constructor(
    @InjectRepository(PushToken)
    private readonly tokenRepo: Repository<PushToken>,
  ) {}

  /**
   * 注册/更新设备推送 token（按 userId+token upsert）。
   */
  async registerToken(userId: number, data: RegisterTokenData): Promise<PushToken> {
    const existing = await this.tokenRepo.findOne({
      where: { userId, token: data.token },
    });
    if (existing) {
      existing.platform = data.platform;
      if (data.deviceId) existing.deviceId = data.deviceId;
      return this.tokenRepo.save(existing);
    }
    const token = this.tokenRepo.create({
      userId,
      deviceId: data.deviceId ?? null,
      platform: data.platform,
      token: data.token,
    });
    return this.tokenRepo.save(token);
  }

  /**
   * 注销（登出/解绑）。
   */
  async unregisterToken(userId: number, token: string): Promise<void> {
    await this.tokenRepo.delete({ userId, token });
  }

  /**
   * 该用户的全部推送 token。
   */
  async getTokensForUser(userId: number): Promise<PushToken[]> {
    return this.tokenRepo.find({ where: { userId } });
  }
}
