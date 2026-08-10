import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { IsString, IsOptional, MaxLength, IsIn } from 'class-validator';
import { MarketingService } from './marketing.service';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { SkipAudit } from '../operation-audit/skip-audit.decorator';

export class SendMarketingDto {
  @IsString()
  @MaxLength(200)
  subject!: string;

  @IsString()
  @MaxLength(5000)
  body!: string;

  @IsOptional()
  @IsIn(['all', 'admin', 'user'])
  audience?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  ctaLabel?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  ctaUrl?: string;
}

/** G-3 运营邮件：管理员向目标用户分组发送（周报/活动）。 */
@ApiTags('运营邮件')
@ApiBearerAuth()
@Controller({ path: 'admin/marketing', version: '1' })
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  @Post('send')
  @SkipAudit()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'G-3 发送运营邮件（周报/活动，管理员）' })
  send(@Body() dto: SendMarketingDto) {
    return this.marketingService.send(dto);
  }
}
