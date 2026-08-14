import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User, UserRole } from '../common/entities/user.entity';
import { NotificationsService } from '../notifications/notifications.service';

export interface FeedbackInput {
  type: 'suggestion' | 'bug' | 'praise';
  content: string;
  contact?: string;
}

const TYPE_LABEL: Record<FeedbackInput['type'], string> = {
  suggestion: '建议',
  bug: '问题',
  praise: '好评',
};

/**
 * G-1 应用内反馈：用户提交 → 写 type='feedback' 站内通知给全体管理员。
 * 复用 MS-1 通知中心（管理台通知页即可见），无新表。
 */
@Injectable()
export class FeedbackService {
  private readonly logger = new Logger(FeedbackService.name);

  constructor(
    @InjectRepository(User) private readonly usersRepo: Repository<User>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async submit(userId: string, input: FeedbackInput) {
    const admins = await this.usersRepo.find({ where: { role: UserRole.ADMIN } });
    const label = TYPE_LABEL[input.type];

    let sent = 0;
    for (const admin of admins) {
      try {
        await this.notificationsService.create({
          userId: admin.id,
          title: `用户反馈（${label}）`,
          body: `${input.content}${input.contact ? `\n联系方式：${input.contact}` : ''}`,
          type: 'feedback',
        });
        sent += 1;
      } catch (err) {
        this.logger.warn(`[Feedback] notify admin ${admin.id} failed: ${(err as Error).message}`);
      }
    }
    this.logger.log(`[Feedback] user ${userId} submitted ${label} feedback`);
    return { received: true, notifiedAdmins: sent };
  }
}
