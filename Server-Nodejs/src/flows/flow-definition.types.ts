/**
 * FLOW 流程定义类型（护栏优先混合编排 v1）。
 * 显式节点只锁死合规步骤，其余路由交给 AI 动态决策（v1.5 扩展）。
 */

export type FlowNodeType = 'human_task' | 'ai_task' | 'condition';

export interface FlowNodeBase {
  id: string;
  type: FlowNodeType;
  name: string;
}

/** 人工审批/确认节点：指派审批人，等待 approve/reject 后推进。 */
export interface HumanTaskNode extends FlowNodeBase {
  type: 'human_task';
  assigneeUserId?: number;
  assigneeRole?: string;
  /** 下一节点；空 = 流程完成 */
  next?: string;
}

/** AI 自动处理节点：复用 LLM 编排。 */
export interface AiTaskNode extends FlowNodeBase {
  type: 'ai_task';
  prompt: string;
  outputKey?: string;
  next?: string;
}

/** 条件分支节点：表达式求值决定 then/else。 */
export interface ConditionNode extends FlowNodeBase {
  type: 'condition';
  expr: string;
  then: string;
  else: string;
}

export type FlowNode = HumanTaskNode | AiTaskNode | ConditionNode;

export interface FlowDefinition {
  id: string;
  name: string;
  version: string;
  trigger?: string;
  nodes: FlowNode[];
  security?: { audit?: boolean; confirmationRequired?: boolean };
}

export type FlowInstanceState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'rolled_back';

export type FlowTaskStatus = 'pending' | 'approved' | 'rejected';
