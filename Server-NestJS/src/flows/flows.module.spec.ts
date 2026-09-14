// SPDX-License-Identifier: Apache-2.0

import { FlowsModule } from './flows.module';
import { DEFAULT_FLOW_DEFINITIONS } from './default-definitions';

/**
 * FlowsModule.onModuleInit：启动时把内建流程定义注册进运行时。
 * 关键行为：单个定义注册失败**不阻断启动**（仅开发环境告警）——防止一条坏定义让整个应用起不来。
 */
describe('FlowsModule.onModuleInit（内建流程注册）', () => {
  const makeModule = (env: string, upsert?: jest.Mock) => {
    const runtime = { upsertDefinition: upsert ?? jest.fn().mockResolvedValue(undefined) };
    const config = { get: jest.fn((k: string) => (k === 'NODE_ENV' ? env : undefined)) };
    return new FlowsModule(runtime as any, config as any);
  };

  afterEach(() => jest.restoreAllMocks());

  it('逐个注册全部内建流程定义', async () => {
    const upsert = jest.fn().mockResolvedValue(undefined);
    const mod = makeModule('production', upsert);

    await mod.onModuleInit();

    expect(upsert).toHaveBeenCalledTimes(DEFAULT_FLOW_DEFINITIONS.length);
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({ id: 'leave_approval' }));
  });

  it('单个定义失败不阻断启动：开发环境告警', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const upsert = jest
      .fn()
      .mockRejectedValueOnce(new Error('定义冲突'))
      .mockResolvedValue(undefined);
    const mod = makeModule('development', upsert);

    await expect(mod.onModuleInit()).resolves.toBeUndefined();

    expect(upsert).toHaveBeenCalledTimes(DEFAULT_FLOW_DEFINITIONS.length);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('注册流程定义'));
  });

  it('生产环境失败静默（不打 console.warn）', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const upsert = jest.fn().mockRejectedValue(new Error('boom'));
    const mod = makeModule('production', upsert);

    await mod.onModuleInit();

    expect(warn).not.toHaveBeenCalled();
  });
});
