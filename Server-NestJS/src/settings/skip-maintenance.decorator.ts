import { SetMetadata } from '@nestjs/common';

export const SKIP_MAINTENANCE_KEY = 'settings:skip_maintenance';

/** 维护模式下仍放行（健康检查 / 登录 / 刷新令牌等认证自身端点）。 */
export const SkipMaintenance = () => SetMetadata(SKIP_MAINTENANCE_KEY, true);
