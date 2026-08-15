import {
  Controller,
  Get,
  Post,
  Query,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { PointsService } from './points.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('积分')
@ApiBearerAuth()
@FeatureFlag('points')
@Controller({ path: 'points', version: '1' })
export class PointsController {
  constructor(private pointsService: PointsService) {}

  @Get('me')
  @ApiOperation({ summary: '我的积分概览（余额/今日是否已签/连签天数）' })
  getMyOverview(@CurrentUser() user: JwtPayload) {
    return this.pointsService.getMyOverview(user.sub);
  }

  @Post('checkin')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: '每日签到（返回本次积分 + 余额 + 连签）' })
  checkIn(@CurrentUser() user: JwtPayload) {
    return this.pointsService.checkIn(user.sub);
  }

  @Get('leaderboard')
  @ApiOperation({ summary: '积分排行榜（脱敏：仅昵称/头像/积分）' })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  getLeaderboard(
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.pointsService.getLeaderboard(limit);
  }

  @Get('achievements')
  @ApiOperation({ summary: '我的成就（规则计算：连签/累计积分）' })
  getAchievements(@CurrentUser() user: JwtPayload) {
    return this.pointsService.getAchievements(user.sub);
  }
}
