import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { OAuthService } from './oauth.service';
import { OAuthProvidersConfigService } from './oauth-providers.config';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MfaService } from './mfa/mfa.service';
import { User } from '../common/entities/user.entity';
import { UserSession } from './user-session.entity';
import { PhoneVerificationCode } from './phone-verification-code.entity';
import { Event } from '../events/event.entity';
import { Todo } from '../todos/todo.entity';
import { Notification } from '../notifications/notification.entity';
import { PushToken } from '../push/push-token.entity';
import { AiConversation } from '../ai/conversation/ai-conversation.entity';
import { AiMessage } from '../ai/conversation/ai-message.entity';
import { OperationAuditLog } from '../operation-audit/operation-audit-log.entity';
import { MailModule } from '../mail/mail.module';
import { CacheModule } from '../common/cache/cache.module';
import { SmsModule } from '../sms/sms.module';
import { OrgModule } from '../org/org.module';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.getOrThrow<string>('JWT_SECRET'),
        signOptions: {
          expiresIn: configService.get<string>('JWT_EXPIRES_IN', '15m') as any,
        },
      }),
    }),
    TypeOrmModule.forFeature([
      User,
      UserSession,
      PhoneVerificationCode,
      Event,
      Todo,
      Notification,
      PushToken,
      AiConversation,
      AiMessage,
      OperationAuditLog,
    ]),
    MailModule,
    CacheModule,
    SmsModule,
    OrgModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, OAuthService, OAuthProvidersConfigService, JwtStrategy, MfaService],
  exports: [AuthService, OAuthService, OAuthProvidersConfigService, JwtModule, PassportModule, TypeOrmModule],
})
export class AuthModule {}
