// SPDX-License-Identifier: Apache-2.0
import { HealthModule } from './health.module';
import { QueueModule } from '../queue/queue.module';

/**
 * The module graph is otherwise never built in a test: `health.controller.spec.ts` supplies the Queue
 * by hand, and the e2e harness both sets `QUEUE_ENABLED=false` and overrides the queue with a stub. A
 * module-scope omission is therefore invisible — and that is exactly what shipped: `/health?detail=true`
 * reported `queue: down` on a deployment whose queue was enabled and whose Redis was reachable, because
 * `HealthModule` never imported the registration `@InjectQueue('push')` comes from. (`BullModule.forRoot`
 * is `@Global()`; the dynamic module `registerQueue` returns is not.)
 *
 * This is a wiring assertion, not a behavioural one — it fails if that import goes away, which is the
 * regression it exists for. A behavioural guard would need an e2e harness with the queue enabled and
 * a reachable Redis; no such harness exists today.
 *
 * 这个依赖图在别处从没被建过：`health.controller.spec.ts` 手工给队列，e2e 既把 `QUEUE_ENABLED` 置
 * `false`、又把队列 override 成 stub ⇒ 模块级的遗漏**看不出来**。而那正是发出去的那个缺陷：
 * `HealthModule` 没 import 注册 `@InjectQueue('push')` 的那个模块，于是「队列已启用 + Redis 可达」
 * 的部署被读成了 `queue: down`。
 *
 * 这是一条**接线断言**、不是行为断言 —— 它只在那个 import 消失时变红，而那正是它要守的回归。
 * 真正行为级的守卫需要一个「队列开启 + Redis 可达」的 e2e harness，今天还没有。
 */
describe('HealthModule wiring', () => {
  it('registers the queue module, so @InjectQueue("push") resolves in HealthController', () => {
    const imports = (Reflect.getMetadata('imports', HealthModule) ?? []) as Array<{ module?: unknown }>;
    expect(imports.some((entry) => entry?.module === QueueModule)).toBe(true);
  });
});
