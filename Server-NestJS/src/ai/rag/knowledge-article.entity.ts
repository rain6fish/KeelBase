// SPDX-License-Identifier: Apache-2.0

import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('ai_knowledge_articles')
export class KnowledgeArticle {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ length: 200 })
  title!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ length: 64, nullable: true })
  category?: string;

  /** 来源文件名（文档上传时） */
  @Column({ length: 255, nullable: true, name: 'sourceFile' })
  sourceFile?: string;

  /** 原文件存储 URL（文档上传时） */
  @Column({ length: 512, nullable: true, name: 'fileUrl' })
  fileUrl?: string;

  /** 文档类型：pdf | docx（纯文本文章为 null） */
  @Column({ length: 16, nullable: true, name: 'docType' })
  docType?: string;

  /** 切块数（文档上传时） */
  @Column({ nullable: true, name: 'chunkCount' })
  chunkCount?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
