import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EvalCase } from './eval-case.entity';
import { AiService } from '../ai.service';

export interface EvalRunReport {
  ranAt: string;
  total: number;
  passed: number;
  failed: number;
  timedOut: number;
  cases: Array<{
    id: number;
    category: string;
    prompt: string;
    ok: boolean;
    durationMs: number;
    error?: string;
  }>;
}

/**
 * AI-20 AI 质量评估体系：评测集跑批 + 报告。
 * 每个用例调 AiService.chat（真实 LLM），按「是否异常/超时」判定 ok，
 * 聚合工具命中/失败/超时统计。报告存内存（重启清空），管理端查询。
 */
@Injectable()
export class AiEvalService {
  private readonly logger = new Logger(AiEvalService.name);
  private lastReport: EvalRunReport | null = null;
  private running = false;

  constructor(
    @InjectRepository(EvalCase) private readonly evalRepo: Repository<EvalCase>,
    private readonly aiService: AiService,
  ) {}

  async createCase(dto: { category: string; prompt: string; expected?: string }) {
    const c = this.evalRepo.create({ ...dto, category: dto.category || 'general' });
    return this.evalRepo.save(c);
  }

  async listCases() {
    return this.evalRepo.find({ order: { category: 'ASC', id: 'ASC' } });
  }

  async deleteCase(id: number) {
    await this.evalRepo.delete(id);
    return { deleted: true };
  }

  /** 跑一次评测批（并发受控）；单用例超时 30s 判失败。 */
  async runEval(): Promise<EvalRunReport> {
    if (this.running) throw new Error('评测已在运行中');
    this.running = true;
    try {
      return await this.runImpl();
    } finally {
      this.running = false;
    }
  }

  private async runImpl(): Promise<EvalRunReport> {
    const cases = await this.evalRepo.find({ where: { enabled: true } });
    const started = Date.now();
    const results: EvalRunReport['cases'] = [];

    // 顺序执行（避免打爆外部 LLM 限流）；控制并发 3
    const concurrency = 3;
    let idx = 0;
    const workers = Array.from({ length: Math.min(concurrency, cases.length || 1) }, async () => {
      while (idx < cases.length) {
        const c = cases[idx++];
        const t0 = Date.now();
        let ok = false;
        let error: string | undefined;
        try {
          const res = await this.withTimeout(
            this.aiService.chat('0', { message: c.prompt }),
            30_000,
          );
          ok = !!res.reply && res.reply.length > 0;
        } catch (e) {
          error = (e as Error).message;
        }
        results.push({
          id: c.id,
          category: c.category,
          prompt: c.prompt.slice(0, 80),
          ok,
          durationMs: Date.now() - t0,
          error,
        });
      }
    });
    await Promise.all(workers);

    const timedOut = results.filter((r) => r.durationMs >= 30_000).length;
    const passed = results.filter((r) => r.ok).length;
    const report: EvalRunReport = {
      ranAt: new Date(started).toISOString(),
      total: results.length,
      passed,
      failed: results.length - passed,
      timedOut,
      cases: results,
    };
    this.lastReport = report;
    this.logger.log(`[AiEval] run done: ${passed}/${results.length} passed`);
    return report;
  }

  getLastReport(): EvalRunReport | null {
    return this.lastReport;
  }

  private async withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('timeout')), ms);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer!));
  }
}
