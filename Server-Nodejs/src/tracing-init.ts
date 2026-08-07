/**
 * OpenTelemetry 初始化入口（副作用模块）。
 *
 * 必须作为 main.ts 的第一个 import（`import './tracing-init'`），
 * 让 auto-instrumentation 在 http/express 模块加载之前完成 patch。
 *
 * 注意：本模块在顶层立即调用 initTracing()，不能只 re-export ——
 * 否则副作用 import 不会触发初始化（早期 bug 的根因）。
 */
import { initTracing } from './tracing';

initTracing();
