/**
 * delete_customer 工具（R5 阻断演示载体）单元测试
 *
 * 覆盖：风险级 R5 声明、R5 不进入确认、工具定义、防御性 execute 返回阻断语义。
 */

import { DeleteCustomerTool } from './delete-customer.tool';

describe('DeleteCustomerTool', () => {
  let tool: DeleteCustomerTool;

  beforeEach(() => {
    tool = new DeleteCustomerTool();
  });

  it('元数据：R5 阻断，不进入确认', () => {
    expect(tool.name).toBe('delete_customer');
    expect(tool.riskLevel).toBe('R5');
    expect(tool.requiresConfirmation).toBe(false);
    expect(tool.permissions?.requireVerifiedEmail).toBe(true);
  });

  it('toToolDefinition 暴露 customerId 必填参数', () => {
    const def = tool.toToolDefinition();
    expect(def.function.name).toBe('delete_customer');
    const props = def.function.parameters.properties as Record<string, any>;
    expect(props.customerId.type).toBe('number');
    const required = def.function.parameters.required as string[];
    expect(required).toContain('customerId');
  });

  it('execute 返回阻断语义（R5 阻断先于执行，防御性返回）', async () => {
    const res = await tool.execute({ customerId: 1, reason: '演示' }, '1');
    expect(res.success).toBe(false);
    expect(res.error).toContain('blocked (risk level R5)');
  });
});
