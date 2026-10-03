// SPDX-License-Identifier: Apache-2.0

import { DataSource } from 'typeorm';
import { Column, DeleteDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { AiToolSideEffect } from './ai-tool-side-effect.entity';
import { AiToolEffectsService } from './ai-tool-effects.service';
import { LocalEntityRevoker } from './side-effect-revoker';

/**
 * REV-16：撤销判定只读 `revoke_status` 与目标软删标记，两者都不知道**派生自**目标的行。
 * 本套件验的是「撤销没够到的那些行」有没有被如实说出，以及**两种读数不塌在一起**。
 *
 * 最小实体：**表名必须与真表一致**（登记表按表名取仓库，`pm_milestones` 正是那条真实存在的边）。
 * `pm_milestones` 带 `@DeleteDateColumn` —— 已软删的引用行不算「活着的下游状态」。
 */
@Entity('pm_projects')
class PmProject {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'varchar', nullable: true })
  title?: string;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}

@Entity('pm_milestones')
class PmMilestone {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}

/**
 * 登记表里另外三条边。**必须有对应元数据** —— 缺一张表，那条边就查不动；扫描对每条边各自软失败
 * （见 `countDerivedReferences`），但本套件要验的是**查得动**时的真实值，故四张都建。
 */
@Entity('pm_tasks')
class PmTask {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}

@Entity('pm_risks')
class PmRisk {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}

@Entity('pm_members')
class PmMember {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ name: 'project_id' })
  projectId!: number;

  @DeleteDateColumn({ name: 'deleted_at' })
  deletedAt?: Date;
}

describe('REV-16 派生引用（撤销没够到的东西）', () => {
  let ds: DataSource;
  let svc: AiToolEffectsService;

  const effects = () => ds.getRepository(AiToolSideEffect);
  const milestones = () => ds.getRepository(PmMilestone);
  const projects = () => ds.getRepository(PmProject);

  const seedProjectEffect = async (): Promise<AiToolSideEffect> =>
    effects().save(
      effects().create({
        idempotencyKey: 'key-rev16',
        userId: '42',
        conversationId: 'conv-rev16',
        toolName: 'create_project_with_tasks',
        argsHash: 'hash',
        resultType: 'pm_project',
        resultId: 7,
        revokeClass: 'local_compensate',
        revokeStatus: null,
        compensationGroup: null,
        parentEffectId: null,
      }),
    );

  beforeEach(async () => {
    ds = new DataSource({
      type: 'better-sqlite3',
      database: ':memory:',
      entities: [AiToolSideEffect, PmProject, PmMilestone, PmTask, PmRisk, PmMember],
      synchronize: true,
    });
    await ds.initialize();
    svc = new AiToolEffectsService(
      effects() as never,
      new LocalEntityRevoker(ds.manager) as never,
    );
  });

  afterEach(async () => {
    await ds.destroy();
  });

  // 「缺席」与「空数组」必须分开：把两者塌在一起，会让每一个未建模的类型都报成「没有东西指着它」——
  // 那正是本仓反复修的那类谎（未知被断言成已知）。
  it('登记表两种读数不塌：核过为空的类型 → `[]`；**没有引用模型**的类型 → `null`', async () => {
    const revoker = new LocalEntityRevoker(ds.manager);
    expect(await revoker.countDerivedReferences('event', 1, [])).toEqual([]);
    expect(await revoker.countDerivedReferences('books', 1, [])).toBeNull();
  });

  it('只数**活着**的引用：已软删的里程碑不计入', async () => {
    await projects().save(projects().create({ id: 7, title: 'Q4 交付' }));
    await milestones().save([
      milestones().create({ id: 1, projectId: 7 }),
      milestones().create({ id: 2, projectId: 7 }),
      milestones().create({ id: 3, projectId: 7 }),
    ]);
    await milestones().softDelete(3); // 已在回收站里 → 不是活着的下游状态

    const revoker = new LocalEntityRevoker(ds.manager);
    expect(await revoker.countDerivedReferences('pm_project', 7, [])).toEqual([
      { table: 'pm_milestones', remaining: 2 },
    ]);
  });

  // **主判据**：撤销一次「项目」，而之后别人给它加的里程碑**不在那个补偿组里** —— 判定照读完成，
  // 而这一行说出它没够到哪。旧实现没有这个字段，故本用例对旧实现为红。
  it('主判据：撤销后仍有人指着它 → 撤销结果如实带上（而那些行不在补偿组里）', async () => {
    await projects().save(projects().create({ id: 7, title: 'Q4 交付' }));
    await milestones().save([
      milestones().create({ id: 1, projectId: 7 }),
      milestones().create({ id: 2, projectId: 7 }),
    ]);
    const effect = await seedProjectEffect();

    const res = await svc.revoke(effect.id);

    // 判定本身**不因此改变**（这是发现，不是裁决）：记录被反转了，撤销就是完成
    expect(res?.revoked).toBe(true);
    expect(res?.revokeStatus).toBe('revoked');
    // 而它没够到的那两行，现在读得出来
    expect(res?.downstreamReferences).toEqual([{ table: 'pm_milestones', remaining: 2 }]);
  });

  it('反向对照：没有人指着它 → 字段**在**，值是空数组（查过、没有），不是缺席', async () => {
    await projects().save(projects().create({ id: 7, title: 'Q4 交付' }));
    const effect = await seedProjectEffect();

    const res = await svc.revoke(effect.id);

    expect(res?.revoked).toBe(true);
    expect(res?.downstreamReferences).toEqual([]);
  });

  it('反向对照：没有引用模型的类型 → 字段**缺席**（未检查），不是空数组', async () => {
    const ev = await effects().save(
      effects().create({
        idempotencyKey: 'key-rev16-books',
        userId: '42',
        conversationId: 'conv-rev16',
        toolName: 'create_book',
        argsHash: 'hash',
        // 名字取一个**不在登记表**里的类型 —— 它有没有引用，本系统没有模型，故只能报「未检查」
        resultType: 'books',
        resultId: 1,
        revokeClass: 'none',
        revokeStatus: null,
        compensationGroup: null,
        parentEffectId: null,
      }),
    );

    const res = await svc.revoke(ev.id);

    // `none` 档位本就拒绝撤销 ⇒ 也不该出现读数（没撤成，谈不上「没够到」）
    expect(res?.revoked).toBe(false);
    expect(res?.downstreamReferences).toBeUndefined();
  });
});
