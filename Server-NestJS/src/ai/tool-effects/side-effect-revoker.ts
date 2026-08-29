import { Injectable } from '@nestjs/common';
import { InjectEntityManager } from '@nestjs/typeorm';
import { EntityManager } from 'typeorm';

/**
 * D2-1f 副作用撤销执行器（SideEffectRevoker）——解耦准备：
 * 撤销 AI 副作用不再硬编码业务实体映射，而是通过可替换的 revoker 分派。
 * - 本地实现 LocalEntityRevoker：软删本地业务实体（event/todo/crm_task/pm_task/app_request）
 * - 远程实现（D2-4 独立治理控制平面）：发请求到业务系统补偿端点，替代本地软删
 * - B 路径外部（proxy_call）继续走已有 ExternalRevoker（ProxyToolRevokerService，Java 补偿）
 */

/** 撤销器注入 token */
export const SIDE_EFFECT_REVOKER = 'SIDE_EFFECT_REVOKER';

export interface SideEffectRevoker {
  /** 该 revoker 是否能处理此 resultType */
  canHandle(resultType: string): boolean;
  /** 撤销（本地软删 / 外部补偿） */
  revoke(
    resultType: string,
    resultId: number,
    userId: string,
  ): Promise<{ revoked: boolean; message?: string }>;
  /** 目标记录当前状态（列表富化用） */
  describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ title?: string; deletedAt?: Date | null } | null>;
}

/** resultType → 本地业务实体名（无映射 = 外部系统目标，非本地）；E-1 快照捕获复用 */
export function entityFor(type: string): string | null {
  switch (type) {
    case 'event':
      return 'Event';
    case 'crm_task':
      return 'CrmTask';
    case 'pm_task':
      return 'PmTask';
    case 'app_request':
      return 'ApprovalRequest';
    case 'proxy_call':
      return null; // B 路径外部写调用（目标在 Java 系统，无本地实体）
    default:
      return 'Todo';
  }
}

/** 本地实现：软删业务实体（可经 RG-3 回收站恢复）；独立治理库/独立服务后由远程 revoker 替换 */
@Injectable()
export class LocalEntityRevoker implements SideEffectRevoker {
  constructor(@InjectEntityManager() private readonly entityManager: EntityManager) {}

  canHandle(resultType: string): boolean {
    return entityFor(resultType) !== null;
  }

  async revoke(
    resultType: string,
    resultId: number,
    _userId: string,
  ): Promise<{ revoked: boolean; message?: string }> {
    const entity = entityFor(resultType);
    if (!entity) return { revoked: false, message: '无本地实体可软删' };
    const repo = this.entityManager.getRepository(entity);
    const target = await repo.findOne({ where: { id: resultId } } as any);
    if (target) {
      await repo.softDelete(resultId);
    }
    return { revoked: true };
  }

  async describeTarget(
    resultType: string,
    resultId: number,
  ): Promise<{ title?: string; deletedAt?: Date | null } | null> {
    const entity = entityFor(resultType);
    if (!entity) {
      // 外部系统写调用：目标在业务系统（无本地记录），撤销语义在外部
      return { title: '外部系统写调用（B 路径）', deletedAt: null };
    }
    const repo = this.entityManager.getRepository(entity);
    return (await repo.findOne({
      where: { id: resultId },
      withDeleted: true,
      select: { title: true, deletedAt: true },
    } as any)) as any;
  }
}
