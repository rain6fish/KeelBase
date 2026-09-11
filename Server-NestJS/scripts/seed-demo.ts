// SPDX-License-Identifier: Apache-2.0

/**
 * 为演示用户补种演示数据（PM-2 / DX-1）。
 *
 * 用法：
 *   npm run seed:demo            # 默认给 alex 种（缺失时自动建账号）
 *   npm run seed:demo -- --username bob
 *   （容器内：node dist/scripts/seed-demo.js）
 *
 * 幂等：目标用户已有演示事件时跳过。已存在账号不覆盖密码，仅补数据。
 */

import * as dotenv from 'dotenv';
import * as bcrypt from 'bcrypt';
import { AppDataSource } from '../src/config/typeorm-data-source';
import { User, UserRole } from '../src/common/entities/user.entity';
import { seedDemoData } from '../src/common/demo-data';
import { ReadinessService } from '../src/app-version/readiness.service';

dotenv.config();

function arg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
}

/**
 * 确保演示用户存在：缺失时补建（对齐 create-admin 模式）。
 * 这样新用户跑一次 `npm run seed:demo` 即可得到完整可登录演示环境。
 */
async function ensureDemoUser(
  userRepo: import('typeorm').Repository<User>,
  username: string,
  password: string,
): Promise<{ user: User; created: boolean }> {
  const existing = await userRepo.findOne({ where: { username } });
  if (existing) return { user: existing, created: false };
  const hashed = await bcrypt.hash(password, 12);
  const user = await userRepo.save(
    userRepo.create({
      username,
      email: `${username}@example.com`,
      password: hashed,
      nickname: username.charAt(0).toUpperCase() + username.slice(1),
      // admin 用户名自动赋予管理员角色（单容器一键部署的管理台登录账号）
      role: username === 'admin' ? UserRole.ADMIN : undefined,
      emailVerified: true,
    }),
  );
  return { user, created: true };
}

async function main() {
  const username = arg('username') || 'alex';
  const password = arg('password') || 'Alex@2026$Demo';

  await AppDataSource.initialize();
  // 全新数据库（单容器首启）无表：synchronize 幂等建表（对齐主程序 DB_SYNCHRONIZE=true 的 synchronize，避免迁移重复建表冲突）
  await AppDataSource.synchronize();
  try {
    const userRepo = AppDataSource.getRepository(User);
    const { user, created } = await ensureDemoUser(userRepo, username, password);

    const seeded = await seedDemoData(AppDataSource, {
      id: user.id,
      username: user.username,
    });
    console.log(
      seeded
        ? `Demo data seeded for "${username}": events/todos/knowledge/conversations/notifications`
        : `Skipped: "${username}" already has demo data (idempotent).`,
    );
    if (created) {
      console.log(`Demo account created: ${username} / ${password}`);
    }
    // NC-3 首次运行就绪清单：落「演示数据已种」标记（demo 维度的判据）。幂等 upsert；
    // 标记写入失败不影响种子结果，仅告警（引导信息缺失不应让 seed 失败）。
    try {
      await AppDataSource.getRepository('settings').upsert(
        {
          key: ReadinessService.DEMO_SEEDED_KEY,
          value: new Date().toISOString().slice(0, 10),
          type: 'string',
          description: '演示数据播种日期（首次运行就绪清单用）',
        },
        ['key'],
      );
    } catch (err) {
      console.warn(`[seed:demo] 就绪标记写入失败（不影响数据）：${(err as Error).message}`);
    }
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Failed to seed demo data:', err);
  process.exit(1);
});
