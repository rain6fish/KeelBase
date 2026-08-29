import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';
import { seedDemoData } from './demo-data';

/**
 * 开发环境种子数据：首次启动时创建演示账号。
 */
@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private usersRepository: Repository<User>,
    private configService: ConfigService,
    private dataSource: DataSource,
  ) {}

  async onApplicationBootstrap() {
    const nodeEnv = this.configService.get<string>('NODE_ENV', 'development');
    if (nodeEnv !== 'development') return;

    const count = await this.usersRepository.count();
    if (count > 0) {
      this.logger.log(`Seed skipped: ${count} users already exist`);
      return;
    }

    this.logger.log('Seeding demo user...');

    // 测试/线上环境账号密码一致（2026-08-29 统一为强密码）
    const hashedPassword = await bcrypt.hash('Alex@2026$Demo', 12);
    const hashedAdminPassword = await bcrypt.hash('Admin@2026$KeelBase', 12);

    const users = await this.usersRepository.save([
      {
        username: 'alex',
        email: 'alex@example.com',
        password: hashedPassword,
        nickname: 'Alex',
        firstName: 'Alex',
        lastName: 'Smith',
        // 演示账号开箱即用：已验证邮箱（否则写操作被 EmailVerificationGuard 拦截）
        emailVerified: true,
      },
      {
        username: 'admin',
        email: 'admin@example.com',
        password: hashedAdminPassword,
        nickname: 'Admin',
        role: UserRole.ADMIN,
        emailVerified: true,
      },
    ]);

    this.logger.log('Demo users created: alex / Alex@2026$Demo, admin / Admin@2026$KeelBase');

    // PM-2 演示数据：为演示用户 alex 种入事件/待办/知识库/对话/通知
    // （仅空库首启时执行，幂等；生产/测试环境不执行——已在开头 NODE_ENV 判断排除）
    const alex = users.find((u) => u.username === 'alex');
    if (alex?.id) {
      try {
        const seeded = await seedDemoData(this.dataSource, {
          id: alex.id,
          username: alex.username,
        });
        if (seeded) {
          this.logger.log(
            'Demo data seeded for alex: events/todos/knowledge/conversations/notifications',
          );
        }
      } catch (err) {
        // 演示数据失败不阻断启动（避免缺依赖时新手首启卡住）
        this.logger.warn(
          `Demo data seeding skipped: ${(err as Error).message}`,
        );
      }
    }
  }
}
