// SPDX-License-Identifier: Apache-2.0

/**
 * 工具的领域词汇必须取自实体，不能在工具里重抄（codebase-health-audit M4）。
 *
 * 为什么值得一条测试：工具的 JSON schema 是**模型看到的那份词汇表**。实体那边加一个状态、
 * 工具这边还留着旧字面量，模型就会继续只认旧集合——而且**没有任何东西会红**。这类漂移靠人眼
 * 在评审里发现是不可靠的（同一个工具文件里本来就把同一份词汇抄了两遍：`parameters` 一份、
 * `toToolDefinition()` 的 properties 一份）。
 *
 * 断言的是「等于实体常量」。**但要如实说明它能守什么、不能守什么**：它断言的是**值相等**，
 * 所以它可以发现**漂移**（实体加了值、工具那边还停在旧字面量 → 红），但**发现不了「有人重新写死
 * 一份与今天取值相同的字面量」**——那种写法当下无害，只在实体下次变化时才由本测试捕获。
 * 这是一条漂移闸，不是一条「禁止字面量」的静态检查；要后者得读源码，不值当。
 */
import { CUSTOMER_STATUSES, RISK_LEVELS } from '../../crm/crm-customer.entity';
import { PROJECT_STATUSES } from '../../pm/pm-project.entity';
import { REQUEST_STATUSES } from '../../approval/approval-request.entity';
import { AiTool } from '../interfaces/tool.interface';
import { QueryCustomersTool } from './query-customers.tool';
import { QueryProjectsTool } from './query-projects.tool';
import { QueryApprovalRequestsTool } from './query-approval-requests.tool';

/** `toToolDefinition()` 里某个属性的 enum —— 模型实际看到的那一份。 */
function schemaEnum(tool: AiTool, property: string): unknown {
  return (tool.toToolDefinition() as never as {
    function: { parameters: { properties: Record<string, { enum: unknown }> } };
  }).function.parameters.properties[property].enum;
}

/** `parameters[]` 里某个参数的 enum —— 同一文件里的第二份。 */
function declaredEnum(tool: AiTool, name: string): unknown {
  return tool.parameters.find((p) => p.name === name)?.enum;
}

const NO_SERVICE = {} as never;

describe('工具 schema 的领域词汇 = 实体词汇（单源）', () => {
  it('query_customers：status 与 riskLevel 都来自客户实体', () => {
    const tool = new QueryCustomersTool(NO_SERVICE);

    expect(schemaEnum(tool, 'status')).toEqual([...CUSTOMER_STATUSES]);
    expect(schemaEnum(tool, 'riskLevel')).toEqual([...RISK_LEVELS]);
    expect(declaredEnum(tool, 'status')).toEqual([...CUSTOMER_STATUSES]);
    expect(declaredEnum(tool, 'riskLevel')).toEqual([...RISK_LEVELS]);
  });

  it('query_projects：status 来自项目实体', () => {
    const tool = new QueryProjectsTool(NO_SERVICE);

    expect(schemaEnum(tool, 'status')).toEqual([...PROJECT_STATUSES]);
    expect(declaredEnum(tool, 'status')).toEqual([...PROJECT_STATUSES]);
  });

  it('query_approval_requests：status 来自审批实体', () => {
    const tool = new QueryApprovalRequestsTool(NO_SERVICE);

    expect(schemaEnum(tool, 'status')).toEqual([...REQUEST_STATUSES]);
    expect(declaredEnum(tool, 'status')).toEqual([...REQUEST_STATUSES]);
  });
});
