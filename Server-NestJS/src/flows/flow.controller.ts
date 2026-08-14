import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  ParseIntPipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { FlowRuntimeService } from './flow-runtime.service';
import { StartFlowDto } from './dto/start-flow.dto';
import { ApproveTaskDto } from './dto/approve-task.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('工作流')
@ApiBearerAuth()
@Controller({ path: 'flows', version: '1' })
export class FlowController {
  constructor(private readonly runtime: FlowRuntimeService) {}

  @Post(':definitionId/start')
  @ApiOperation({ summary: '发起流程（如 leave_approval 请假审批）' })
  async start(
    @Param('definitionId') definitionId: string,
    @Body() body: StartFlowDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.runtime.start(definitionId, body.data ?? {}, user.sub);
  }

  @Get('tasks')
  @ApiOperation({ summary: '我的待办审批任务' })
  async myTasks(@CurrentUser() user: JwtPayload) {
    return this.runtime.getTasksForUser(user.sub);
  }

  @Post('tasks/:id/approve')
  @ApiOperation({ summary: '审批（approve/reject）' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: ApproveTaskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.runtime.resolveTask(id, body.decision, user.sub, body.note);
  }

  @Get(':id')
  @ApiOperation({ summary: '流程实例详情' })
  async instance(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.runtime.getInstance(id, user.sub, ability);
  }

  @Post(':id/rollback')
  @ApiOperation({ summary: '回滚流程实例（admin）' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async rollback(@Param('id', ParseIntPipe) id: number) {
    return this.runtime.rollback(id);
  }
}
