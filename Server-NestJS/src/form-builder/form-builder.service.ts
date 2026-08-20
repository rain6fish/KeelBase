import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { FormSchema } from './form-schema.entity';
import { FormSubmission } from './form-submission.entity';

export interface FormFieldDef {
  key: string;
  label: string;
  type: 'text' | 'tel' | 'email' | 'number' | 'date' | 'textarea' | 'select' | 'boolean';
  required?: boolean;
  options?: string[];
  placeholder?: string;
}

export interface FormSchemaJson {
  title: string;
  fields: FormFieldDef[];
}

const FIELD_TYPES: FormFieldDef['type'][] = ['text', 'tel', 'email', 'number', 'date', 'textarea', 'select', 'boolean'];

/**
 * PL-10 低代码表单构建器：JSON Schema 驱动动态表单。
 * - 管理端：schema 的增删改查（CASL admin 保护，见 controller）
 * - 用户端：按 slug 读取 schema 渲染 + 提交数据（按 schema 校验）
 */
@Injectable()
export class FormBuilderService {
  private readonly logger = new Logger(FormBuilderService.name);

  constructor(
    @InjectRepository(FormSchema) private readonly schemaRepo: Repository<FormSchema>,
    @InjectRepository(FormSubmission) private readonly submissionRepo: Repository<FormSubmission>,
  ) {}

  // ── 管理端 schema CRUD ──

  async createSchema(dto: { title: string; slug: string; schema: FormSchemaJson; description?: string }) {
    this.validateSchema(dto.schema);
    const exists = await this.schemaRepo.findOne({ where: { slug: dto.slug } });
    if (exists) throw new BadRequestException('slug 已存在');
    const row = this.schemaRepo.create({
      title: dto.title,
      slug: dto.slug,
      schemaJson: JSON.stringify(dto.schema),
      description: dto.description,
    });
    return this.schemaRepo.save(row);
  }

  async listSchemas(options: { page?: number; limit?: number } = {}) {
    // CR-19 同款钳制：防 page=0 负 skip（500）与 limit 巨大全表拉取
    const page = Math.max(options.page ?? 1, 1);
    const limit = Math.min(Math.max(options.limit ?? 20, 1), 100);
    const [items, total] = await this.schemaRepo.findAndCount({
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async updateSchema(id: number, dto: { title?: string; schema?: FormSchemaJson; description?: string; enabled?: boolean }) {
    const row = await this.schemaRepo.findOneBy({ id });
    if (!row) throw new NotFoundException('表单不存在');
    if (dto.schema) {
      this.validateSchema(dto.schema);
      row.schemaJson = JSON.stringify(dto.schema);
    }
    if (dto.title) row.title = dto.title;
    if (dto.description !== undefined) row.description = dto.description;
    if (dto.enabled !== undefined) row.enabled = dto.enabled;
    return this.schemaRepo.save(row);
  }

  async removeSchema(id: number) {
    await this.schemaRepo.delete(id);
    await this.submissionRepo.delete({ schemaId: id });
    return { deleted: true };
  }

  // ── 用户端：读取 + 提交 ──

  async getSchemaBySlug(slug: string) {
    const row = await this.schemaRepo.findOne({ where: { slug } });
    if (!row || !row.enabled) throw new NotFoundException('表单不存在');
    let schema: FormSchemaJson;
    try {
      schema = JSON.parse(row.schemaJson) as FormSchemaJson;
    } catch {
      throw new BadRequestException('表单定义损坏');
    }
    return { id: row.id, title: row.title, description: row.description, schema };
  }

  async submit(slug: string, userId: number, data: Record<string, unknown>) {
    const form = await this.getSchemaBySlug(slug);
    const errors = this.validateData(form.schema, data);
    if (errors.length) {
      throw new BadRequestException({ message: '表单校验失败', errors });
    }
    const row = await this.submissionRepo.save(
      this.submissionRepo.create({
        schemaId: form.id,
        userId,
        data: JSON.stringify(data),
      }),
    );
    return { id: row.id, submittedAt: row.createdAt };
  }

  async listSubmissions(schemaId: number, page = 1, limit = 20) {
    // CR-19 同款钳制：防负 skip 与全表拉取
    page = Math.max(page, 1);
    limit = Math.min(Math.max(limit, 1), 100);
    const [items, total] = await this.submissionRepo.findAndCount({
      where: { schemaId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((s) => ({ id: s.id, userId: s.userId, data: JSON.parse(s.data), createdAt: s.createdAt })),
      total,
      page,
      limit,
    };
  }

  /** 本人对某表单的提交记录（按 slug 解析 schema id） */
  async mySubmissions(slug: string, userId: number, page = 1, limit = 20) {
    const form = await this.getSchemaBySlug(slug);
    const [items, total] = await this.submissionRepo.findAndCount({
      where: { schemaId: form.id, userId },
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });
    return {
      items: items.map((s) => ({ id: s.id, data: JSON.parse(s.data), createdAt: s.createdAt })),
      total,
      page,
      limit,
    };
  }

  // ── 校验 ──

  private validateSchema(schema: FormSchemaJson) {
    if (!schema || !Array.isArray(schema.fields) || schema.fields.length === 0) {
      throw new BadRequestException('表单至少需要一个字段');
    }
    const keys = new Set<string>();
    for (const f of schema.fields) {
      if (!f.key || !f.label) throw new BadRequestException('字段缺少 key 或 label');
      if (!FIELD_TYPES.includes(f.type)) throw new BadRequestException(`不支持的字段类型: ${f.type}`);
      if (keys.has(f.key)) throw new BadRequestException(`字段 key 重复: ${f.key}`);
      keys.add(f.key);
    }
  }

  private validateData(schema: FormSchemaJson, data: Record<string, unknown>): string[] {
    const errors: string[] = [];
    for (const f of schema.fields) {
      const value = data[f.key];
      if (f.required && (value === undefined || value === null || value === '')) {
        errors.push(`字段「${f.label}」为必填`);
        continue;
      }
      if (value === undefined || value === null || value === '') continue;
      switch (f.type) {
        case 'email':
          if (typeof value !== 'string' || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) errors.push(`字段「${f.label}」邮箱格式不正确`);
          break;
        case 'number':
          if (typeof value !== 'number' && Number.isNaN(Number(value))) errors.push(`字段「${f.label}」须为数字`);
          break;
        case 'select':
          if (f.options && !f.options.includes(String(value))) errors.push(`字段「${f.label}」选项无效`);
          break;
        case 'boolean':
          if (typeof value !== 'boolean') errors.push(`字段「${f.label}」须为布尔`);
          break;
        default:
          if (typeof value !== 'string') errors.push(`字段「${f.label}」格式不正确`);
      }
    }
    return errors;
  }
}
