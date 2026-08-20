import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../common/entities/user.entity';
import { MailService } from '../mail/mail.service';

export interface MarketingEmailInput {
  subject: string;
  body: string;
  /** 目标用户筛选：all | admin | user（active 未实现；未知值 service 抛错防静默群发全员） */
  audience?: string;
  ctaLabel?: string;
  ctaUrl?: string;
}

/**
 * G-3 运营邮件：管理员选目标用户分组发送（周报/活动）。
 * MailService 未配置 SMTP 时静默降级（记录日志）。
 */
@Injectable()
export class MarketingService {
  private readonly logger = new Logger(MarketingService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly mailService: MailService,
  ) {}

  async send(input: MarketingEmailInput) {
    const audience = input.audience ?? 'all';
    let users: User[];

    if (audience === 'admin') {
      users = await this.usersRepo.find({ where: { role: UserRole.ADMIN } });
    } else if (audience === 'user') {
      users = await this.usersRepo.find({ where: { role: UserRole.USER } });
    } else if (audience === 'all') {
      users = await this.usersRepo.find();
    } else {
      // 防静默群发：未知 audience 抛错而非落 all
      throw new BadRequestException(`未知 audience: ${audience}`);
    }

    let sent = 0;
    for (const u of users) {
      try {
        await this.mailService.sendMarketingEmail(
          u.email,
          input.subject,
          input.body,
          input.ctaLabel && input.ctaUrl ? { label: input.ctaLabel, url: input.ctaUrl } : undefined,
        );
        sent++;
      } catch (err) {
        this.logger.warn(`[Marketing] send to ${u.email} failed: ${(err as Error).message}`);
      }
    }
    this.logger.log(`[Marketing] sent "${input.subject}" to ${sent}/${users.length} users`);
    return { sent, total: users.length };
  }
}
