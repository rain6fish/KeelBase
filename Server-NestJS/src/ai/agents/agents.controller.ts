import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { CheckPolicies } from '../../common/casl/check-policies.decorator';
import { AiAgentService } from './ai-agent.service';
import { AiAgent } from './ai-agent.entity';

/**
 * D5 Agent Registry（roadmap §22.10）：管理台查看已注册 Agent（企业可信的可见呈现）。
 */
@ApiTags('Agent Registry')
@Controller({ path: 'ai/agents', version: '1' })
export class AgentsController {
  constructor(private readonly agents: AiAgentService) {}

  @Get()
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '已注册 Agent 清单（管理台，D5）' })
  list(): Promise<AiAgent[]> {
    return this.agents.list();
  }
}
