/**
 * 委托 token 请求 DTO（AI Bridge §5 身份桥接）——audience 指定目标系统
 */

import { IsString, IsOptional, IsInt, Min, Max } from 'class-validator';

export class DelegationTokenDto {
  /** 目标系统标识（如 legacy-erp），Java 端验签后按此判定放行 */
  @IsString()
  audience!: string;

  /** 有效期（秒），默认 300，范围 60-3600 */
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(3600)
  ttlSeconds?: number;
}
