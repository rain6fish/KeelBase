import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { FeatureFlagsService } from '../feature-flags/feature-flags.service';
import { MODULES_MANIFEST } from '../common/modules/modules-manifest';

/** AI provider → 对应 API Key 环境变量（对齐 .env.example）。 */
const PROVIDER_API_KEY: Record<string, string> = {
  deepseek: 'DEEPSEEK_API_KEY',
  qwen: 'QWEN_API_KEY',
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  gemini: 'GEMINI_API_KEY',
};

/**
 * 能力清单单一事实源：前端导航（/app/capabilities）与 System AI Assistant
 * 系统上下文共用同一份模块过滤逻辑，保证 AI 看到的模块集 = 前端真实可用模块集。
 */
@Injectable()
export class CapabilitiesService {
  constructor(
    private readonly featureFlagsService: FeatureFlagsService,
    private readonly configService: ConfigService,
  ) {}

  /** LLM provider 是否真的可用：AI_PROVIDER + 对应 Key；ollama 显式选择即视为可用。 */
  private isAiProviderConfigured(): boolean {
    const provider = this.configService.get<string>('AI_PROVIDER', 'deepseek');
    if (provider === 'ollama') return true;
    const key = PROVIDER_API_KEY[provider];
    return !!key && !!this.configService.get<string>(key);
  }

  getCapabilities() {
    const flags = this.featureFlagsService.getFlags();
    // 业务模块：从 manifest 过滤，feature key 对应模块 id
    const businessModules = MODULES_MANIFEST.filter(
      (m) => m.category === 'business',
    )
      .filter((m) => flags[m.id as keyof typeof flags] !== false)
      .map((m) => ({ id: m.id, label: m.label, description: m.description }));

    return {
      preset: this.featureFlagsService.getPreset(),
      features: flags,
      // 供前端判断「AI 开了但没配模型」：enabled（feature flag）+ providerConfigured（运行时）
      ai: {
        enabled: flags.ai !== false,
        providerConfigured: this.isAiProviderConfigured(),
        provider: this.configService.get<string>('AI_PROVIDER', 'deepseek'),
      },
      businessModules,
    };
  }
}
