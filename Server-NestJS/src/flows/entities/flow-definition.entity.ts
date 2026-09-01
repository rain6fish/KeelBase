// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryColumn, Column, CreateDateColumn } from 'typeorm';

/** 流程定义快照（nodes 存 JSON 文本，跨 sqlite/postgres）。 */
@Entity('flow_definitions')
export class FlowDefinition {
  @PrimaryColumn({ length: 64 })
  id!: string;

  @Column({ length: 100 })
  name!: string;

  @Column({ default: '1.0' })
  version!: string;

  /** 节点数组 JSON（见 flow-definition.types） */
  @Column({ type: 'text', name: 'nodes_json' })
  nodesJson!: string;

  @Column({ default: true })
  audit!: boolean;

  @Column({ default: false, name: 'confirmation_required' })
  confirmationRequired!: boolean;

  @CreateDateColumn()
  createdAt!: Date;
}
