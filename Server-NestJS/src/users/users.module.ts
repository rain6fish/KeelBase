import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { User } from '../common/entities/user.entity';
import { SeedService } from '../common/seed';
import { CacheModule } from '../common/cache/cache.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), CacheModule],
  controllers: [UsersController],
  providers: [UsersService, SeedService],
  exports: [UsersService],
})
export class UsersModule {}
