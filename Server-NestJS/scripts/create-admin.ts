// SPDX-License-Identifier: Apache-2.0

/**
 * 创建管理员账号（D.7 一键部署用）。
 *
 * 用法：
 *   npm run create:admin -- --username admin --password 'xxx' --email admin@example.com
 *   或容器内：node dist/scripts/create-admin.js --password 'xxx'
 *
 * 生产环境（NODE_ENV=production）seed 不执行，首次部署需手动创建管理员。
 * 该脚本幂等：用户名已存在时只提升为 admin（不覆盖密码）。
 */

import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { AppDataSource } from '../src/config/typeorm-data-source';
import { User, UserRole } from '../src/common/entities/user.entity';

dotenv.config();

function arg(name: string): string {
  const idx = process.argv.indexOf(`--${name}`);
  return idx >= 0 && process.argv[idx + 1] ? process.argv[idx + 1] : '';
}

async function main() {
  const username = arg('username') || 'admin';
  const email = arg('email') || 'admin@example.com';
  const password = arg('password') || 'Admin@2026$KeelBase';

  if (password.length < 8) {
    console.error('Error: password must be at least 8 characters');
    process.exit(1);
  }

  await AppDataSource.initialize();
  try {
    const repo = AppDataSource.getRepository(User);
    let user = await repo.findOne({ where: { username } });

    if (user) {
      if (user.role !== UserRole.ADMIN) {
        user.role = UserRole.ADMIN;
        await repo.save(user);
        console.log(`User "${username}" promoted to admin`);
      } else {
        console.log(`User "${username}" is already admin (skipped)`);
      }
      return;
    }

    const hashed = await bcrypt.hash(password, 12);
    await repo.save(
      repo.create({
        username,
        email,
        password: hashed,
        nickname: username,
        role: UserRole.ADMIN,
      }),
    );
    console.log(`Admin created: ${username} (email=${email})`);
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((err) => {
  console.error('Failed to create admin:', err);
  process.exit(1);
});
