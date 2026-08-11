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
import { User } from '../src/common/entities/user.entity';
import { seedDemoData } from '../src/common/demo-data';

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
      emailVerified: true,
    }),
  );
  return { user, created: true };
}

async function main() {
  const username = arg('username') || 'alex';
  const password = arg('password') || '123456';

  await AppDataSource.initialize();
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
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Failed to seed demo data:', err);
  process.exit(1);
});
