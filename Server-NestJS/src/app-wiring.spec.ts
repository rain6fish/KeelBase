// SPDX-License-Identifier: Apache-2.0

/**
 * 装配冒烟：真实的 `AppModule` 与 `GovernanceModule` 能不能被实例化。
 *
 * 存在的理由是一次事故，而且是同一天两次：`AiService` 的 `useFactory` 里 `inject` 数组比签名多一条，
 * 参数按位置整体左移，`toolRegistry` 收到的是 `ContentSafetyService`——应用**根本起不来**；随后
 * `GovernanceModule` 又因阶段 3 拆出来的 `AuditStatsService` 没被提供而整个控制平面起不来。两次都有
 * 一个共同点：**2644 个单测全绿**。单测从不 boot Nest 容器，装配坏了它看不见。
 *
 * e2e 本可以抓，但它有两条不成立的前提：**它得是绿的**（当时在 main 上长期红着没人处理），且**它得被
 * 跑**。把「装得起来」挪进单测，它就变成每个改动者都会跑的那批断言的一部分。
 *
 * 而且这条断言测的是一个此前**没有任何测试碰过**的对象：`test/helpers` 的 `createTestApp()` 自己重列了
 * 一遍模块清单（为了给每个 app 一个独立库文件），所以**真实的 `AppModule` 从未被装配过**——它的装配被
 * 改坏时，那套平行清单照样能起。这里 import 的是真的那个。
 *
 * 只断言「装得起来」：不 resolve 具体服务（那会把断言绑到实现细节上），也不发请求。
 */

// ⚠ import 顺序即求值顺序，这三条**不能重排**：
//   1) helpers：导入时把 `.env.test` 落盘（缺它时 Joi 会因 JWT_SECRET 缺失直接抛）
//   2) wiring-env：把 DB_PATH 指到本次运行独有的库——必须在 app.module 之前，否则共享的
//      `data/test.sqlite`（表已在、迁移记录不在）会让 migrationsRun 直接抛
//   3) app.module / governance.module：这时才加载，读到的才是上面那份环境
import '../test/helpers';
import '../test/wiring-env';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module';
import { GovernanceModule } from './governance/governance.module';
import { SidecarModule } from './governance-sidecar/sidecar.module';
import { AiAuditModule } from './ai/audit/ai-audit.module';
import { AuditService } from './governance-shared/services/audit.service';
import { GOVERNANCE_REPORTER } from './governance-shared/services/governance-reporter.service';

/**
 * Reporter wiring, read off the instance it was attached to. The constructor parameter is an
 * `@Optional()` provider, so "does this AuditService hold a reporter" has no public surface; touching
 * the private field from a wiring test is the honest probe, and it keeps a production getter from
 * existing only to be testable.
 *
 * 读实例上的 reporter 字段来断言接线。该构造器参数是 `@Optional()` provider，「这个 AuditService
 * 有没有挂 reporter」没有公开面；在装配测试里碰这个私有字段是诚实的探针，也避免为了让断言能写而在
 * 生产代码里加一个只为测试存在的 getter。
 */
const reporterOf = (service: AuditService): unknown =>
  (service as unknown as { reporter?: unknown }).reporter;

/**
 * 三个入口都要装得起来——`npm start` / `start:governance` / `start:sidecar` 各有一个根模块。
 * 只测其中一个，就等于说「另外两个入口的装配坏了不会被发现」；今天两次事故（inject 错位、控制平面
 * 缺 provider）都属这一类。
 */
describe('装配冒烟（模块能被实例化）', () => {
  it('AppModule：整张依赖图装得起来', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.init();
    // S4-H4 C Step 4：业务侧必须把 reporter 挂到共享模块提供的**那一个** AuditService 上。
    // 反向可证：把 AiAuditModule 的 OnModuleInit 去掉（或改回自建 AuditService），本条即红。
    const audit = moduleRef.get(AuditService);
    expect(reporterOf(audit)).toBe(moduleRef.get(GOVERNANCE_REPORTER));
    // 单一实例：AiAuditModule 视角与根容器视角必须是同一个对象，否则就有两个 AuditService。
    expect(moduleRef.select(AiAuditModule).get(AuditService)).toBe(audit);
    await moduleRef.close();
  }, 120_000);

  it('GovernanceModule：独立控制平面装得起来', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [GovernanceModule] }).compile();
    await moduleRef.init();
    // S4-H4 C Step 4：治理进程不得自我上报 —— 它解析出的 AuditService 不能持有 reporter。
    // 反向可证：在 GovernanceModule 里提供 GOVERNANCE_REPORTER（或错误地 attach），本条即红。
    expect(reporterOf(moduleRef.get(AuditService))).toBeUndefined();
    await moduleRef.close();
  }, 120_000);

  it('SidecarModule：审计代理入口装得起来', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [SidecarModule] }).compile();
    await moduleRef.close();
  }, 120_000);
});
