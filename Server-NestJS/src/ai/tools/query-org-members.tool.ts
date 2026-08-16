/**
 * ORG-5 组织成员目录工具 — query_org_members
 *
 * 组织边界授权：返回请求用户所属组织的成员（脱敏白名单：昵称/部门/角色）。
 * 可按部门名筛选。
 */

import { AiTool, ToolDefinition, ToolResult } from '../interfaces/tool.interface';
import { ToolParameter } from '../interfaces/tool.interface';

interface OrgServiceLike {
  getUserOrgId(userId: number): Promise<number | null>;
  listMyMembers(userId: number): Promise<Array<Record<string, unknown>>>;
}

export class QueryOrgMembersTool implements AiTool {
  readonly name = 'query_org_members';
  readonly description =
    '查询组织成员目录（昵称/部门/角色）。组织边界授权：仅返回请求用户所属组织的数据。';
  readonly parameters: ToolParameter[] = [
    {
      name: 'deptName',
      type: 'string',
      description: '按部门名筛选（可选）',
      required: false,
    },
  ];

  constructor(private readonly orgService: OrgServiceLike) {}

  toToolDefinition(): ToolDefinition {
    return {
      type: 'function',
      function: {
        name: this.name,
        description: this.description,
        parameters: {
          type: 'object',
          properties: {
            deptName: { type: 'string', description: '部门名筛选' },
          },
        },
      },
    };
  }

  async execute(args: Record<string, unknown>, userId: string): Promise<ToolResult> {
    try {
      const orgId = await this.orgService.getUserOrgId(Number(userId));
      if (orgId == null) {
        return { success: false, error: '您不是任何组织的成员' };
      }
      const members = await this.orgService.listMyMembers(Number(userId));
      const deptFilter = args.deptName as string | undefined;
      const rows = members
        .filter((m: Record<string, unknown>) =>
          deptFilter ? String(m.deptName ?? '') === deptFilter : true,
        )
        .map((m: Record<string, unknown>) => ({
          nickname: m.nickname ?? null,
          deptName: m.deptName ?? null,
          role: m.role ?? 'member',
        }));

      return { success: true, data: { orgId, members: rows } };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  }
}
