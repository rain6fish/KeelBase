import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { User } from '../common/entities/user.entity';
import { MailModule } from '../mail/mail.module';
import { MarketingService } from './marketing.service';
import { MarketingController } from './marketing.controller';

@Module({
  imports: [TypeOrmModule.forFeature([User]), MailModule],
  controllers: [MarketingController],
  providers: [MarketingService],
})
export class MarketingModule {}
