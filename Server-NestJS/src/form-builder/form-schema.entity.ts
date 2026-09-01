// SPDX-License-Identifier: Apache-2.0

import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * PL-10 低代码表单定义：JSON Schema 驱动动态表单。
 * schema 结构（简化 JSON Schema）：
 * {
 *   "title": "活动报名",
 *   "fields": [
 *     { "key": "name", "label": "姓名", "type": "text", "required": true },
 *     { "key": "city", "label": "城市", "type": "select", "options": ["北京","上海"], "required": false }
 *   ]
 * }
 * 字段 type: text | tel | email | number | date | textarea | select | boolean
 */
@Entity('form_schemas')
export class FormSchema {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 100 })
  title!: string;

  @Index()
  @Column({ length: 64, unique: true })
  slug!: string;

  @Column({ type: 'text' })
  schemaJson!: string;

  @Column({ length: 255, nullable: true })
  description?: string;

  @Column({ default: true })
  enabled!: boolean;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
