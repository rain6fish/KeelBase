import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { User, UserRole } from './entities/user.entity';

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

    const hashedPassword = await bcrypt.hash('123456', 12);
    const hashedAdminPassword = await bcrypt.hash('Admin@1234', 12);

    await this.usersRepository.save([
      {
        username: 'alex',
        email: 'alex@example.com',
        password: hashedPassword,
        nickname: 'Alex',
        firstName: 'Alex',
        lastName: 'Smith',
      },
      {
        username: 'admin',
        email: 'admin@example.com',
        password: hashedAdminPassword,
        nickname: 'Admin',
        role: UserRole.ADMIN,
      },
    ]);

    this.logger.log('Demo users created: alex / 123456, admin / Admin@1234');
  }
}
