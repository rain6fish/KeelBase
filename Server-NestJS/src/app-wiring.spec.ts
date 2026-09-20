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

describe('装配冒烟（模块能被实例化）', () => {
  it('AppModule：整张依赖图装得起来', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    await moduleRef.close();
  }, 120_000);

  it('GovernanceModule：独立控制平面装得起来', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [GovernanceModule] }).compile();
    await moduleRef.close();
  }, 120_000);
});
