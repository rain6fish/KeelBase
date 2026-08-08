import { Controller, Post, Delete, Body, Param, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, MinLength, IsIn } from 'class-validator';
import { PushTokenService } from './push-token.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

class RegisterTokenDto {
  @IsOptional()
  @IsString()
  @MaxLength(64)
  deviceId?: string;

  @IsIn(['android', 'ios', 'web'])
  platform!: string;

  @IsString()
  @MinLength(8)
  @MaxLength(255)
  token!: string;
}

@ApiTags('推送')
@ApiBearerAuth()
@FeatureFlag('push')
@Controller({ path: 'push/tokens', version: '1' })
export class PushTokenController {
  constructor(private readonly pushTokenService: PushTokenService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '注册/更新设备推送 token' })
  async register(
    @Body() dto: RegisterTokenDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.pushTokenService.registerToken(user.sub, dto);
  }

  @Delete(':token')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '注销设备推送 token' })
  async unregister(
    @Param('token') token: string,
    @CurrentUser() user: JwtPayload,
  ) {
    await this.pushTokenService.unregisterToken(user.sub, token);
    return null;
  }
}
