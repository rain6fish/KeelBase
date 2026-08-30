import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SidecarController } from './sidecar.controller';
import { SidecarService } from './sidecar.service';

/**
 * 治理 sidecar（护城河 2.0 嵌入广度，S-1 MVP）：
 * 独立、语言无关的「AI 网关审计代理」——业务系统（LangChain/LangChain4j/任意 OpenAI 兼容 client）
 * 只把 LLM base URL 指向 sidecar，AI 调用即自动上报独立治理台审计（零代码接入）。
 * 转发真实 LLM（SIDECAR_UPSTREAM_URL）；工具调用门控/确认（S-2）后续复用 MCP 网关模式。
 */
@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [SidecarController],
  providers: [SidecarService],
})
export class SidecarModule {}
