import * as Joi from 'joi';
import { FlowDefinition } from './flow-definition.types';

const nodeSchema = Joi.alternatives().try(
  Joi.object({
    id: Joi.string().required(),
    type: Joi.valid('human_task').required(),
    name: Joi.string().required(),
    assigneeUserId: Joi.number().optional(),
    assigneeRole: Joi.string().optional(),
    next: Joi.string().optional(),
  }),
  Joi.object({
    id: Joi.string().required(),
    type: Joi.valid('ai_task').required(),
    name: Joi.string().required(),
    prompt: Joi.string().required(),
    outputKey: Joi.string().optional(),
    next: Joi.string().optional(),
  }),
  Joi.object({
    id: Joi.string().required(),
    type: Joi.valid('condition').required(),
    name: Joi.string().required(),
    expr: Joi.string().required(),
    then: Joi.string().required(),
    else: Joi.string().required(),
  }),
);

export const flowDefinitionSchema = Joi.object({
  id: Joi.string().pattern(/^[a-z][a-z0-9_]*$/).required(),
  name: Joi.string().required(),
  version: Joi.string().default('1.0'),
  trigger: Joi.string().optional(),
  nodes: Joi.array().items(nodeSchema).min(1).required(),
  security: Joi.object({
    audit: Joi.boolean().default(true),
    confirmationRequired: Joi.boolean().default(false),
  }).optional(),
});

/**
 * 校验流程定义：Joi 结构 + 图一致性（id 唯一、next/then/else 引用存在）。
 */
export function validateFlowDefinition(def: unknown): { ok: boolean; error?: string } {
  const { error } = flowDefinitionSchema.validate(def, { abortEarly: false });
  if (error) return { ok: false, error: error.message };

  const d = def as FlowDefinition;
  const ids = new Set(d.nodes.map((n) => n.id));
  if (ids.size !== d.nodes.length) return { ok: false, error: '节点 id 重复' };

  for (const n of d.nodes) {
    if (n.type === 'condition') {
      if (!ids.has(n.then)) return { ok: false, error: `condition "${n.id}" then 引用不存在: ${n.then}` };
      if (!ids.has(n.else)) return { ok: false, error: `condition "${n.id}" else 引用不存在: ${n.else}` };
    } else if (n.next && !ids.has(n.next)) {
      return { ok: false, error: `节点 "${n.id}" next 引用不存在: ${n.next}` };
    }
  }
  return { ok: true };
}
