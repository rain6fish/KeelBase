// SPDX-License-Identifier: Apache-2.0

import { ToolPresentationService } from '../tools/tool-presentation.service';
import { ToolExecutionService } from '../tools/tool-execution.service';
import { ToolRegistry } from '../tools/tool-registry';
import { ToolGateService } from '../tools/tool-gate.service';
import { ExternalToolRegistry } from '../tools/external-tool-registry';
import { PresentationText } from '../interfaces/tool.interface';
import {
  CONFIRMATION_RENDER_VERSION,
  buildConfirmationRenderProof,
  buildRunRenderProof,
} from './confirmation-render';

/**
 * CONF-3 acceptance: the row must be able to answer **what the user was shown**, and a rendering
 * that changed afterwards must be *visible* rather than silently equal.
 *
 * The two halves are asserted together:
 * - same args + same renderer ⇒ recomputed hash == the hash recorded on the row;
 * - renderer/translation changed ⇒ recomputed hash != recorded hash.
 *
 * CONF-3 验收：行必须答得出**用户当时看到的是什么**，且事后变过的渲染要**可见**，而不是静默相等。
 * 两半一起断言：同参数同渲染 ⇒ 重算 == 行上记录；渲染/翻译变了 ⇒ 重算 != 行上记录。
 */

function makeRegistry(): ToolRegistry {
  return {
    getToolDefinitions: jest.fn().mockReturnValue([]),
    execute: jest.fn(),
    register: jest.fn(),
    getTool: jest.fn(),
    getAllTools: jest.fn(),
    requiresConfirmation: jest.fn().mockReturnValue(false),
    riskLevel: jest.fn().mockReturnValue('R1'),
  } as unknown as ToolRegistry;
}

function makePresentation(): ToolPresentationService {
  const registry = makeRegistry();
  const external = new ExternalToolRegistry();
  const gate = new ToolGateService(registry, external);
  const execution = new ToolExecutionService(registry, gate, external);
  return new ToolPresentationService(registry, execution);
}

function makeChangedRenderer(): ChangedRenderer {
  const registry = makeRegistry();
  const external = new ExternalToolRegistry();
  const gate = new ToolGateService(registry, external);
  const execution = new ToolExecutionService(registry, gate, external);
  return new ChangedRenderer(registry, execution);
}

/** Simulates a changed rendering mapping: same args, different template/key. */
class ChangedRenderer extends ToolPresentationService {
  writeSummaryOrGeneric(toolName: string, args: Record<string, unknown>): PresentationText {
    const base = super.writeSummaryOrGeneric(toolName, args);
    return { ...base, key: `${base.key}.v2`, fallback: `[changed] ${base.fallback}` };
  }
}

const ARGS = { title: '评审', startTime: '10:00', endTime: '11:00' };
const TOOL = 'create_event';

describe('CONF-3 confirmation render proof', () => {
  const presentation = makePresentation();

  /** A row exactly as `ConfirmationStore.create` / `createR4ApprovalRequest` persists it. */
  function rowWithProof(): {
    toolName: string;
    args: string;
    kind: 'single';
    runItems: null;
    renderHash: string;
    renderVersion: string;
  } {
    const summary = presentation.writeSummaryOrGeneric(TOOL, ARGS);
    const proof = buildConfirmationRenderProof(TOOL, ARGS, summary);
    return {
      toolName: TOOL,
      args: JSON.stringify(ARGS),
      kind: 'single',
      runItems: null,
      renderHash: proof.renderHash,
      renderVersion: proof.renderVersion,
    };
  }

  it('same args + same renderer ⇒ recomputed hash equals the hash recorded on the row', () => {
    const row = rowWithProof();

    const recomputed = presentation.renderProofFor(TOOL, ARGS);
    expect(recomputed.renderVersion).toBe(CONFIRMATION_RENDER_VERSION);
    expect(recomputed.renderHash).toBe(row.renderHash);
    expect(presentation.verifyStoredRender(row)).toMatchObject({ matched: true });
  });

  it('a changed rendering mapping ⇒ recomputed hash differs (difference is visible)', () => {
    const row = rowWithProof();
    const changed = makeChangedRenderer();

    const recomputed = changed.renderProofFor(TOOL, ARGS);
    expect(recomputed.renderHash).not.toBe(row.renderHash);
    expect(changed.verifyStoredRender(row)).toMatchObject({ matched: false });
    // And the untouched renderer still reproduces the row — the mismatch is the renderer's doing,
    // not a tautology of the test fixture.
    expect(presentation.verifyStoredRender(row)).toMatchObject({ matched: true });
  });

  it('a changed translation/fallback ⇒ hash differs', () => {
    const summary = presentation.writeSummaryOrGeneric(TOOL, ARGS);
    const stored = buildConfirmationRenderProof(TOOL, ARGS, summary);

    const translatedDifferently: PresentationText = {
      ...summary,
      fallback: 'Create calendar event: 评审 (10:00 – 11:00)',
    };
    const changed = buildConfirmationRenderProof(TOOL, ARGS, translatedDifferently);

    expect(changed.renderHash).not.toBe(stored.renderHash);
    expect(changed.renderVersion).toBe(stored.renderVersion);
  });

  it('argument key order does not change the hash (canonical JSON)', () => {
    const summary = presentation.writeSummaryOrGeneric(TOOL, ARGS);
    const a = buildConfirmationRenderProof(TOOL, { title: 'x', startTime: '1', endTime: '2' }, summary);
    const b = buildConfirmationRenderProof(TOOL, { endTime: '2', title: 'x', startTime: '1' }, summary);
    expect(a.renderHash).toBe(b.renderHash);
  });

  it('a row written before the columns existed answers "unknown" rather than guessing', () => {
    expect(
      presentation.verifyStoredRender({
        toolName: TOOL,
        args: JSON.stringify(ARGS),
        kind: 'single',
        runItems: null,
        renderHash: null,
        renderVersion: null,
      }),
    ).toEqual({
      matched: null,
      stored: { renderHash: null, renderVersion: null },
      recomputed: null,
    });
  });

  it('run rows pin the batch rendering too, and a changed mapping is visible there as well', () => {
    const items = [
      { toolName: 'create_event', args: ARGS, summary: presentation.writeSummaryOrGeneric('create_event', ARGS) },
      { toolName: 'create_todo', args: { title: '周报' }, summary: presentation.writeSummaryOrGeneric('create_todo', { title: '周报' }) },
    ];
    const proof = buildRunRenderProof(items);
    const row = {
      toolName: 'run',
      args: '[]',
      kind: 'run' as const,
      runItems: JSON.stringify(items),
      renderHash: proof.renderHash,
      renderVersion: proof.renderVersion,
    };

    expect(presentation.verifyStoredRender(row)).toMatchObject({ matched: true });

    const changed = makeChangedRenderer();
    expect(changed.verifyStoredRender(row)).toMatchObject({ matched: false });
  });
});
