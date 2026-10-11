// SPDX-License-Identifier: Apache-2.0



import { aiService, confirmationStore, installAiServiceTestbed, mockProvider, mockToolGate, mockToolRegistry, toolExecution, toolExposure } from '../../test/ai-service.testbed';

beforeEach(installAiServiceTestbed);

  describe('AiService › System AI Assistant（adminMode / adminOnly / 拒绝透传）', () => {
    it('adminMode=true：关闭关键词导航短路，导航交 LLM（不返回 Flutter 路由）', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'ok' });

      const result = await aiService.chat('1', {
        message: '打开设置',
        adminMode: true,
      });

      // 未短路 → 走 LLM（provider 被调用），不返回 /settings
      expect(mockProvider.generate).toHaveBeenCalled();
      expect(result.navigateTo).toBeUndefined();
      expect(result.reply).toBe('ok');
    });

    it('非 adminMode：导航关键词短路仍生效（回归守卫）', async () => {
      mockProvider.generate.mockResolvedValue({ content: 'should not be used' });

      const result = await aiService.chat('1', { message: '打开设置' });

      expect(mockProvider.generate).not.toHaveBeenCalled();
      expect(result.navigateTo).toBe('/settings');
    });

    it('adminOnly 工具：非管理员（普通用户）调用被结构化拒绝', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'navigate_admin_page',
        permissions: { adminOnly: true },
      } as any);
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'navigate_admin_page', arguments: '{"page":"system"}' },
        ],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'final' });

      await aiService.chat('5', { message: '打开系统信息页' });

      // 非流式 runToolLoop 透传结构化拒绝原因（W5-⑦），LLM 能看到「为何阻止」
      const sent = mockProvider.generate.mock.calls[1][0];
      const toolMsg = sent.messages.find((m: any) => m.role === 'tool');
      expect(toolMsg).toBeDefined();
      const parsed = JSON.parse(toolMsg.content);
      expect(parsed.success).toBe(false);
      expect(parsed.error).toContain('admin-only');
      expect(parsed.reasons).toEqual(
        expect.arrayContaining([expect.objectContaining({ name: 'admin_only', ok: false })]),
      );
    });

    it('adminOnly 工具：系统账号（userId 0）放行', async () => {
      mockToolRegistry.getTool.mockReturnValue({
        name: 'navigate_admin_page',
        permissions: { adminOnly: true },
      } as any);
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { navigateTo: '/system' },
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'navigate_admin_page', arguments: '{"page":"system"}' },
        ],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'final' });

      const result = await aiService.chat('0', { message: '打开系统信息页' });

      expect(mockToolRegistry.execute).toHaveBeenCalledWith(
        'navigate_admin_page',
        { page: 'system' },
        '0',
      );
      expect(result.navigateTo).toBe('/system');
    });

    it('adminOnly 工具：真实管理员（role=admin）放行', async () => {
      (mockToolGate as any).usersService = {
        findOne: jest.fn().mockResolvedValue({ id: 5, role: 'admin' }),
      };
      mockToolRegistry.getTool.mockReturnValue({
        name: 'navigate_admin_page',
        permissions: { adminOnly: true },
      } as any);
      mockToolRegistry.execute.mockResolvedValue({
        success: true,
        data: { navigateTo: '/system' },
      });
      mockProvider.generate.mockResolvedValueOnce({
        content: '',
        toolCalls: [
          { id: 'call_1', name: 'navigate_admin_page', arguments: '{"page":"system"}' },
        ],
      });
      mockProvider.generate.mockResolvedValueOnce({ content: 'final' });

      const result = await aiService.chat('5', { message: '打开系统信息页' });

      expect(result.navigateTo).toBe('/system');
    });
  });

  describe('HS-10 Agent 对话集成（ExternalToolProvider）', () => {
    let provider: {
      listExternalTools: jest.Mock;
      isExternal: jest.Mock;
      requiresConfirmation: jest.Mock;
      callTool: jest.Mock;
    };

    beforeEach(() => {
      provider = {
        listExternalTools: jest.fn().mockResolvedValue([
          { name: 'mcp_wx_get_weather', description: '查天气', parameters: { type: 'object' } },
          { name: 'mcp_wx_send_email', description: '发邮件', parameters: { type: 'object' } },
        ]),
        isExternal: jest.fn().mockImplementation((name: string) => name.startsWith('mcp_')),
        requiresConfirmation: jest.fn(),
        callTool: jest.fn(),
      };
      toolExposure.registerExternalToolProvider(provider as any);
    });

    it('外部写工具 → 走到确认卡（不再以「执行失败」收尾）', async () => {
      provider.requiresConfirmation.mockResolvedValue(true);
      provider.callTool.mockResolvedValue({ executed: true, content: 'sent' });
      async function* mockStreamWithExternalWrite() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'mcp_wx_send_email', arguments: '{"to":"a@b.c"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '已提交外部写入' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithExternalWrite())
        .mockReturnValueOnce(mockStreamAfterTool());
      // 忠实模拟真实注册表：外部名不在本地注册表 → getTool / riskLevel 均抛（修前正是在此处打挂确认流）
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_send_email" not found');
      });
      mockToolRegistry.riskLevel.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_send_email" not found');
      });

      const originalCreate = confirmationStore.create.bind(confirmationStore);
      let pendingToken: string | undefined;
      jest.spyOn(confirmationStore, 'create').mockImplementation(async (userId, toolName, args) => {
        const r = await originalCreate(userId, toolName, args);
        pendingToken = r.token;
        return r;
      });

      const it = aiService.chatStream('1', { message: 'send an email through the mcp server' })[Symbol.asyncIterator]();
      const first = await it.next();
      expect(first.value.type).toBe('tool_start');
      expect(first.value.toolStart?.name).toBe('mcp_wx_send_email');
      expect(first.value.toolStart?.isWrite).toBe(true);
      // 核心断言：确认卡到达（修前此处是 tool_end「执行失败」）
      const second = await it.next();
      expect(second.value.type).toBe('confirmation_request');
      expect(second.value.confirmation?.toolName).toBe('mcp_wx_send_email');
      // 档位由外部判定派生：确认写 → R3（走即时确认，不是 R4 审批）
      expect(second.value.confirmation?.authorization?.riskLevel).toBe('R3');
      // P1 起外部 MCP 写**可解析**为 `external_call`（为幂等而登记锚行的同一判据）⇒ 影响面如实给出 1 个外部调用。
      // 原先断言这里是 undefined，其前提是「解析不到」（writeEffectTypeFor 对 mcp_* 返回 null）——前提已变；
      // 且代理写（proxy_call）本就出现在影响预览里，同类事物不应一个显示一个隐藏（docs/impact-preview.spec.md 单一真源）。
      expect(second.value.confirmation?.impact).toEqual({
        actions: 1,
        targets: [{ resultType: 'external_call', count: 1 }],
      });
      // 撤销档仍解析不到（工具未注册 → 不补默认）：外部 MCP **不可撤**，与「不制造可撤销假象」一致。
      expect('revokeClass' in (second.value.confirmation ?? {})).toBe(false);

      // 批准 → 经 provider 执行（外部写走 callTool，不落本地副作用）
      confirmationStore.resolve(pendingToken!, '1', 'approve');
      const third = await it.next();
      expect(third.value.type).toBe('confirmation_decision');
      const fourth = await it.next();
      expect(fourth.value.type).toBe('tool_end');
      expect(fourth.value.toolEnd?.success).toBe(true);
      expect(provider.callTool).toHaveBeenCalledWith('mcp_wx_send_email', { to: 'a@b.c' }, '1');
    });

    it('外部读工具在流式对话里正常完成（tool_start + 成功 tool_end）', async () => {
      provider.requiresConfirmation.mockResolvedValue(false);
      provider.callTool.mockResolvedValue({ executed: true, content: '晴 26°C' });
      async function* mockStreamWithExternalRead() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'mcp_wx_get_weather', arguments: '{"city":"sz"}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '查询完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithExternalRead())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_get_weather" not found');
      });
      mockToolRegistry.riskLevel.mockImplementation(() => {
        throw new Error('Tool "mcp_wx_get_weather" not found');
      });

      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'weather please' })) chunks.push(c);
      const types = chunks.map((c) => c.type);
      expect(types[0]).toBe('tool_start');
      expect(types).not.toContain('confirmation_request'); // 读工具无需确认
      const end = chunks.find((c) => c.type === 'tool_end');
      expect(end?.toolEnd?.success).toBe(true);
      expect(provider.callTool).toHaveBeenCalledWith('mcp_wx_get_weather', { city: 'sz' }, '1');
    });

    it('未注册且非外部的写工具仍失败——不给幻觉名发确认卡（边界不放宽）', async () => {
      provider.requiresConfirmation.mockResolvedValue(true);
      mockToolRegistry.requiresConfirmation.mockReturnValue(true);
      async function* mockStreamWithPhantomWrite() {
        yield {
          type: 'tool_call' as const,
          toolCall: { index: 0, id: 'c1', name: 'hallucinated_write', arguments: '{}' },
        };
      }
      async function* mockStreamAfterTool() {
        yield { type: 'text' as const, content: '完成' };
        yield { type: 'done' as const };
      }
      mockProvider.stream
        .mockReturnValueOnce(mockStreamWithPhantomWrite())
        .mockReturnValueOnce(mockStreamAfterTool());
      mockToolRegistry.getTool.mockImplementation(() => {
        throw new Error('Tool "hallucinated_write" not found');
      });
      mockToolRegistry.riskLevel.mockImplementation(() => {
        throw new Error('Tool "hallucinated_write" not found');
      });
      // isExternal → false（provider 只认 mcp_ 前缀）→ 容错不适用，仍抛
      const chunks: any[] = [];
      for await (const c of aiService.chatStream('1', { message: 'phantom' })) chunks.push(c);
      expect(chunks.map((c) => c.type)).not.toContain('confirmation_request');
      expect(chunks.find((c) => c.type === 'tool_end')?.toolEnd?.success).toBe(false);
    });

    it('外部读工具 → 经 provider 执行并返回文本', async () => {
      provider.callTool.mockResolvedValue({ executed: true, content: '晴 26°C' });
      const result = await toolExecution.executeRead('mcp_wx_get_weather', { city: 'sz' }, '1');
      expect(provider.callTool).toHaveBeenCalledWith('mcp_wx_get_weather', { city: 'sz' }, '1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('晴 26°C');
    });

    it('内置读工具仍走 toolRegistry', async () => {
      mockToolRegistry.execute.mockResolvedValue({ success: true, data: { total: 1 } });
      const result = await toolExecution.executeRead('query_events', {}, '1');
      expect(mockToolRegistry.execute).toHaveBeenCalledWith('query_events', {}, '1');
      expect(result.data).toEqual({ total: 1 });
    });

    it('外部写工具确认规则委托 provider', async () => {
      provider.requiresConfirmation.mockResolvedValue(true);
      await expect(mockToolGate.requiresConfirmation('mcp_wx_send_email')).resolves.toBe(true);
      expect(provider.requiresConfirmation).toHaveBeenCalledWith('mcp_wx_send_email');
    });

    it('外部写工具经 executeWrite 执行（跳过幂等/副作用）', async () => {
      provider.callTool.mockResolvedValue({ executed: true, content: 'sent' });
      const result = await toolExecution.executeWrite('mcp_wx_send_email', { to: 'a' }, '1');
      expect(result.success).toBe(true);
      expect(result.data).toBe('sent');
      expect(mockToolRegistry.execute).not.toHaveBeenCalled();
    });

    it('外部 provider 调用失败 → success false + error', async () => {
      provider.callTool.mockResolvedValue({ executed: false, error: 'remote down' });
      const result = await toolExecution.executeRead('mcp_wx_get_weather', {}, '1');
      expect(result.success).toBe(false);
      expect(result.error).toContain('remote down');
    });
  });

