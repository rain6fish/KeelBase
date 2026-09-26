// SPDX-License-Identifier: Apache-2.0

/**
 * EASY-2 后端模板：按 todos 模块约定生成 7 个文件。
 * 每个函数接收 buildContext 的 ctx，返回文件内容字符串。
 */

import {
  DECIMAL_PRECISION,
  attachmentArtifacts,
  attachmentFields,
  decimalScale,
  piiFieldNames,
  refColumnName,
  refFields,
  refOnDelete,
  refTarget,
  toSnake,
} from './validate.mjs';

/** Protocol cascade semantics → SQL ON DELETE action (mirrors the flagship idiom). */
const REF_ON_DELETE_SQL = { restrict: 'RESTRICT', setNull: 'SET NULL', cascade: 'CASCADE' };

/**
 * Inline transformer emitted into any entity that carries a decimal field.
 * Postgres already returns a string for `decimal` (deliberately, to avoid float
 * rounding); SQLite returns a number. Without normalising, the same generated
 * field would have two different JS types depending on the database — and the
 * protocol promises a string.
 *
 * 内联转换器：凡含 decimal 字段的实体都会带上它。Postgres 对 `decimal` 本就返回
 * 字符串（刻意如此，避免浮点舍入），SQLite 返回数字。不做归一，同一个生成字段在
 * 不同数据库下会有两种 JS 类型 —— 而协议承诺的是字符串。
 */
const DECIMAL_TRANSFORMER = `const decimalStringTransformer = {
  to: (value: string | null | undefined): string | null | undefined => value,
  from: (value: unknown): string | null => (value === null || value === undefined ? null : String(value)),
};`;

// required 语义（#3 修复）：按类型默认 + 显式可覆盖。
// - string/enum 默认必填（业务标题/状态类）；显式 required:false → 可选。
// - text/int/bool/date 默认可选；显式 required:true → 必填。
// 此前 spec 路径丢弃 required 且 string/enum 无视 required:false，生成物与协议语义不符（陌生人实测卡点）。
// 必填 = 列 NOT NULL + DTO @IsNotEmpty；可选 = 列 nullable + DTO @IsOptional。
const REQUIRED_BY_DEFAULT = new Set(['string', 'enum']);
const isRequired = (f) =>
  REQUIRED_BY_DEFAULT.has(f.type) ? f.required !== false : f.required === true;

const FIELD_COLUMNS = {
  string: (c, f) =>
    isRequired(f)
      ? `  @Column({ length: 200 })\n  ${c}!: string;`
      // 可选 string 是 `?: string | null`（design:type 记 Object），必须显式 type，否则 TypeORM 报 "Data type Object not supported"
      : `  @Column({ type: 'varchar', length: 200, nullable: true })\n  ${c}?: string | null;`,
  text: (c, f) =>
    isRequired(f)
      ? `  @Column({ type: 'text' })\n  ${c}!: string;`
      : `  @Column({ type: 'text', nullable: true })\n  ${c}?: string | null;`,
  int: (c, f) =>
    isRequired(f)
      ? `  @Column()\n  ${c}!: number;`
      : `  @Column({ nullable: true })\n  ${c}?: number;`,
  // 显式 type: 'decimal' 必给：可选字段是 `?: string | null`（design:type 记 Object），
  // 与 varchar 同理，不给显式 type 时 TypeORM 报 "Data type Object not supported"。
  decimal: (c, f) =>
    isRequired(f)
      ? `  @Column({ type: 'decimal', precision: ${DECIMAL_PRECISION}, scale: ${decimalScale(f)}, transformer: decimalStringTransformer })\n  ${c}!: string;`
      : `  @Column({ type: 'decimal', precision: ${DECIMAL_PRECISION}, scale: ${decimalScale(f)}, nullable: true, transformer: decimalStringTransformer })\n  ${c}?: string | null;`,
  // 附件字段在**本实体上不落列** —— 关联落在同模块的侧表里（真外键，见 attachmentEntityTemplate）。
  // An attachment field adds no column here: the association lives in the module's
  // own side table with a real foreign key.
  attachment: () => '',
  // 关联：外键列 + 关系属性两件（与旗舰 crm-activity 的既有写法同形）。外键列名显式给出，
  // 不依赖 TypeORM 的命名策略 —— 与 userId/deletedAt 的既有做法一致。
  ref: (c, f) => {
    const col = refColumnName(c);
    const name = toSnake(col);
    const target = refTarget(f.target);
    const action = REF_ON_DELETE_SQL[refOnDelete(f)];
    return (
      `  @Column({ type: 'int', nullable: true, name: '${name}' })\n  ${col}?: number | null;\n\n` +
      `  @ManyToOne(() => ${target.pascal}, { onDelete: '${action}', nullable: true })\n` +
      `  @JoinColumn({ name: '${name}' })\n` +
      `  ${c}?: ${target.pascal} | null;`
    );
  },
  bool: (c, f) =>
    isRequired(f)
      ? `  @Column({ default: false })\n  ${c}!: boolean;`
      : `  @Column({ type: 'boolean', nullable: true })\n  ${c}?: boolean;`,
  date: (c, f) =>
    isRequired(f)
      ? `  @Column({ type: Date })\n  ${c}!: Date;`
      : `  @Column({ type: Date, nullable: true })\n  ${c}?: Date | null;`,
  enum: (c, f) =>
    isRequired(f)
      ? `  @Column({ length: 32, default: '${f.enum[0]}' })\n  ${c}!: string;`
      // 可选 enum 同理需显式 type（`?: string | null` → Object）
      : `  @Column({ type: 'varchar', length: 32, default: '${f.enum[0]}', nullable: true })\n  ${c}?: string | null;`,
};

const FIELD_DTO_PROPS = {
  string: (c, f) =>
    isRequired(f)
      ? `  @ApiProperty({ description: '${c}' })\n  @IsString()\n  @IsNotEmpty()\n  @MinLength(1)\n  @MaxLength(200)\n  ${c}!: string;`
      : `  @ApiPropertyOptional({ description: '${c}' })\n  @IsString()\n  @IsOptional()\n  @MaxLength(200)\n  ${c}?: string;`,
  text: (c, f) =>
    isRequired(f)
      ? `  @ApiProperty({ description: '${c}' })\n  @IsString()\n  @IsNotEmpty()\n  ${c}!: string;`
      : `  @ApiPropertyOptional({ description: '${c}' })\n  @IsString()\n  @IsOptional()\n  ${c}?: string;`,
  int: (c, f) =>
    isRequired(f)
      ? `  @ApiProperty({ description: '${c}' })\n  @IsInt()\n  @IsNotEmpty()\n  ${c}!: number;`
      : `  @ApiPropertyOptional({ description: '${c}' })\n  @IsInt()\n  @IsOptional()\n  ${c}?: number;`,
  decimal: (c, f) =>
    isRequired(f)
      ? `  @ApiProperty({ description: '${c}', type: 'string' })\n  @IsNumberString()\n  @Matches(/^-?\\d+(\\.\\d{1,${decimalScale(f)}})?$/, { message: '需为最多 ${decimalScale(f)} 位小数的十进制字符串' })\n  @IsNotEmpty()\n  ${c}!: string;`
      : `  @ApiPropertyOptional({ description: '${c}', type: 'string' })\n  @IsNumberString()\n  @Matches(/^-?\\d+(\\.\\d{1,${decimalScale(f)}})?$/, { message: '需为最多 ${decimalScale(f)} 位小数的十进制字符串' })\n  @IsOptional()\n  ${c}?: string;`,
  // 附件不经 create/update DTO 提交 —— 它有自己的两个端点（上传关联 / 撤销关联），
  // 见 controllerTemplate。故此处不产出属性。
  attachment: () => '',
  // 关联在 DTO 里只暴露外键 id；关系对象由服务端填充，不接受客户端提交。
  ref: (c, f) => {
    const col = refColumnName(c);
    return isRequired(f)
      ? `  @ApiProperty({ description: '${c}' })\n  @IsInt()\n  @IsNotEmpty()\n  ${col}!: number;`
      : `  @ApiPropertyOptional({ description: '${c}' })\n  @IsInt()\n  @IsOptional()\n  ${col}?: number;`;
  },
  bool: (c, f) =>
    isRequired(f)
      ? `  @ApiProperty({ description: '${c}' })\n  @IsBoolean()\n  @IsNotEmpty()\n  ${c}!: boolean;`
      : `  @ApiPropertyOptional({ description: '${c}' })\n  @IsBoolean()\n  @IsOptional()\n  ${c}?: boolean;`,
  date: (c, f) =>
    isRequired(f)
      ? `  @ApiProperty({ description: '${c}' })\n  @IsDateString()\n  @IsNotEmpty()\n  ${c}!: string;`
      : `  @ApiPropertyOptional({ description: '${c}' })\n  @IsDateString()\n  @IsOptional()\n  ${c}?: string;`,
  enum: (c, f) =>
    isRequired(f)
      ? `  @ApiProperty({ description: '${c}', enum: [${f.enum.map((o) => `'${o}'`).join(', ')}] })\n  @IsString()\n  @IsNotEmpty()\n  @IsIn([${f.enum.map((o) => `'${o}'`).join(', ')}])\n  ${c}!: string;`
      : `  @ApiPropertyOptional({ description: '${c}', enum: [${f.enum.map((o) => `'${o}'`).join(', ')}] })\n  @IsString()\n  @IsOptional()\n  @IsIn([${f.enum.map((o) => `'${o}'`).join(', ')}])\n  ${c}?: string;`,
};

/** class-validator import 名集合：按实际用到的装饰器最小化，避免 noUnusedLocals/lint 报未用导入。 */
function dtoValidatorImports(fields) {
  const names = new Set();
  for (const f of fields) {
    const req = isRequired(f);
    if (!req) names.add('IsOptional');
    if (req) names.add('IsNotEmpty');
    if (f.type === 'string' || f.type === 'text' || f.type === 'enum') names.add('IsString');
    if (f.type === 'string') names.add('MaxLength');
    if (f.type === 'string' && req) names.add('MinLength');
    if (f.type === 'int') names.add('IsInt');
    if (f.type === 'bool') names.add('IsBoolean');
    if (f.type === 'date') names.add('IsDateString');
    if (f.type === 'enum') names.add('IsIn');
    if (f.type === 'decimal') {
      names.add('IsNumberString');
      names.add('Matches');
    }
    if (f.type === 'ref') names.add('IsInt');
  }
  return names;
}

export function entityTemplate(ctx) {
  const fieldCols = ctx.fields.map((f) => FIELD_COLUMNS[f.type](f.name, f)).join('\n\n');
  // 只有真的带 decimal 字段的实体才带上转换器 —— 不产死代码（Code Economy §15.3）
  const decimalHelper = ctx.fields.some((f) => f.type === 'decimal') ? `\n${DECIMAL_TRANSFORMER}\n` : '';
  const refs = refFields(ctx.fields);
  // 自引用（target 就是本模块）暂不支持：生成物会在本模块内 import 自己的实体文件，
  // 要么循环导入、要么路径根本不存在。宁可在此明确报错，也不要静默产出一个坏模块。
  const selfRef = refs.find((r) => refTarget(r.target).plural === ctx.plural);
  if (selfRef) {
    throw new Error(`自引用关联暂不支持：字段 ${selfRef.name} 的 target 就是本模块（${ctx.plural}）`);
  }
  const refTypeormImports = refs.length > 0 ? ',\n  ManyToOne,\n  JoinColumn' : '';
  const refIndexes = refs.map((r) => `@Index(['${r.column}'])`).join('\n');
  // 实体里 @ManyToOne(() => X) 引用了目标类，故实体自身也必须导入它 —— 漏了就是编译错误。
  const refEntityImports = refs
    .map((r) => refTarget(r.target))
    .filter((t, i, arr) => arr.findIndex((x) => x.plural === t.plural) === i)
    .map((t) => `import { ${t.pascal} } from '../${t.plural}/${t.singular}.entity';\n`)
    .join('');
  const attachments = attachmentFields(ctx.fields);
  const att = attachmentArtifacts(ctx);
  // 每个模块**只发一次**附件关系（一个模块可有多个附件字段，但它们共用一张侧表）。
  const attachImport =
    attachments.length > 0 ? `import { ${att.className} } from './${att.fileName.replace(/\.ts$/, '')}';\n` : '';
  const attachTypeormImport = attachments.length > 0 ? ',\n  OneToMany' : '';
  const attachRelation =
    attachments.length === 0
      ? ''
      : `\n  /**\n` +
        `   * Attachments owned by this row. Visibility follows the row: the read paths that\n` +
        `   * load it load these too, so a revoked or soft-deleted owner hides its files as well.\n` +
        `   *\n` +
        `   * 本行拥有的附件。可见性随本行：加载本行的读路径一并加载它们，故 owner 被撤销或\n` +
        `   * 软删时其文件一并不可见。\n` +
        `   */\n` +
        `  @OneToMany(() => ${att.className}, (attachment) => attachment.owner)\n` +
        `  ${att.relation}?: ${att.className}[];\n`;
  return `import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  VersionColumn,
  DeleteDateColumn${refTypeormImports}${attachTypeormImport},
} from 'typeorm';
${refEntityImports}${attachImport}${decimalHelper}
@Entity('${ctx.plural}')
@Index(['userId'])
${refIndexes}
export class ${ctx.singlePascal} {
  @PrimaryGeneratedColumn()
  id!: number;

${fieldCols}

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;

  /**
   * Bumped on every write. An update that carries a stale value is refused instead of silently
   * overwriting whoever wrote in between — the API answers that with 409. The optimistic lock is
   * the default here, not an opt-in: a generated module should not lose writes without saying so.
   *
   * 每次写入自增。携带陈旧值的更新会被拒绝，而不是**无声覆盖**中间写过的人 —— 接口以 409 作答。
   * 乐观锁在这里是**缺省**而非可选：生成的模块不该在丢写入时一声不吭。
   */
  @VersionColumn()
  version!: number;
${attachRelation}

  /**
   * Trust-ready（生成模块默认可撤销）：RG-3 软删除——删除仅置 deleted_at 保留行，管理台回收站可恢复；
   * AI 写工具 create_${ctx.singular} 副作用 resultType=${ctx.singular} 可按本实体元数据软删撤销
   * （SideEffectRevoker.resolveLocalEntity 匹配本实体 + DeleteDateColumn → revokeClass=local_compensate）。
   */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
`;
}

/**
 * The module's own attachment side table. One table per module with a real foreign
 * key to the owning row — so "only whoever can see the owner can see the files" and
 * "a revoked or soft-deleted owner hides its files" hold by construction instead of
 * by remembering to code them on every read path.
 *
 * 模块自己的附件侧表。每个模块一张，带指向 owner 行的**真外键** —— 于是「只看得到 owner
 * 的人看得到文件」与「owner 被撤销或软删则文件不可见」由约束保证，而不是靠每条读路径
 * 都记得在代码里做。
 */
export function attachmentEntityTemplate(ctx) {
  const att = attachmentArtifacts(ctx);
  return `import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  DeleteDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';

@Entity('${att.table}')
@Index(['${att.ownerColumn}'])
@Index(['userId'])
export class ${att.className} {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: 'int', name: '${att.ownerColumnDb}' })
  ${att.ownerColumn}!: number;

  @ManyToOne(() => ${ctx.singlePascal}, { onDelete: 'CASCADE' })
  @JoinColumn({ name: '${att.ownerColumnDb}' })
  owner?: ${ctx.singlePascal};

  /** 属于哪个已声明的附件字段（一个模块可有多个附件字段）。 */
  @Column({ length: 32 })
  field!: string;

  /** 存储键 —— storage 驱动的 key，不是裸 URL。 */
  @Column({ length: 255, name: 'storage_key' })
  storageKey!: string;

  @Column({ length: 255, name: 'original_name' })
  originalName!: string;

  @Column({ length: 128, name: 'mime_type' })
  mimeType!: string;

  @Column({ type: 'int' })
  size!: number;

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;

  @CreateDateColumn()
  createdAt!: Date;

  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
`;
}

/**
 * DTO for associating an uploaded file. `field` is constrained to the declared
 * attachment fields so a caller cannot invent a group name and park rows in the table.
 *
 * 关联已上传文件的 DTO。`field` 被限制在**已声明**的附件字段内，调用者无法自造分组名
 * 往表里塞行。
 */
export function attachmentDtoTemplate(ctx) {
  const names = attachmentFields(ctx.fields);
  const list = names.map((n) => `'${n}'`).join(', ');
  return `import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsInt, IsNotEmpty, IsString, MaxLength, Min } from 'class-validator';

export class Add${ctx.singlePascal}AttachmentDto {
  @ApiProperty({ description: '附件字段名', enum: [${list}] })
  @IsString()
  @IsIn([${list}])
  field!: string;

  @ApiProperty({ description: '存储键（/upload 的返回）' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  storageKey!: string;

  @ApiProperty({ description: '原始文件名' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  originalName!: string;

  @ApiProperty({ description: 'MIME 类型' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(128)
  mimeType!: string;

  @ApiProperty({ description: '字节数' })
  @IsInt()
  @Min(0)
  size!: number;
}
`;
}

export function createDtoTemplate(ctx) {
  const props = ctx.fields.map((f) => FIELD_DTO_PROPS[f.type](f.name, f)).join('\n\n');
  const imports = [...dtoValidatorImports(ctx.fields)].sort().join(', ');
  const swaggerImport = ctx.fields.some((f) => !isRequired(f))
    ? 'ApiProperty, ApiPropertyOptional'
    : 'ApiProperty';
  return `import { ${imports} } from 'class-validator';
import { ${swaggerImport} } from '@nestjs/swagger';

export class Create${ctx.singlePascal}Dto {
${props}
}
`;
}

export function updateDtoTemplate(ctx) {
  return `import { PartialType } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { Create${ctx.singlePascal}Dto } from './create-${ctx.singular}.dto';

export class Update${ctx.singlePascal}Dto extends PartialType(Create${ctx.singlePascal}Dto) {
  /**
   * The version the caller read. Required, and that is the point: were it optional an update could
   * omit it, the check would run against the row the service just loaded, and it would pass every
   * time — protecting no one while looking like it protects.
   *
   * 调用方读到的版本号，**必填**；必填正是要点：若可选，调用方就能不传，校验会拿服务刚读到的
   * 那一行去比 —— 每次都通过，看着像在保护，其实谁也保护不了。
   */
  @IsInt()
  @Min(1)
  version!: number;
}
`;
}

export function serviceTemplate(ctx) {
  const pii = piiFieldNames(ctx.fields);
  const piiImport = pii.length > 0 ? `\nimport { maskText } from '../common/utils/mask';` : '';
  const refs = refFields(ctx.fields);
  const refTargets = refs
    .map((r) => refTarget(r.target))
    .filter((t, i, arr) => arr.findIndex((x) => x.plural === t.plural) === i);
  const refRepoImports = refTargets
    .map((t) => `import { ${t.pascal} } from '../${t.plural}/${t.singular}.entity';\n`)
    .join('');
  const attachmentNames = attachmentFields(ctx.fields);
  const att = attachmentArtifacts(ctx);
  const hasAttachments = attachmentNames.length > 0;
  const attRepoImport = hasAttachments
    ? `import { ${att.className} } from './${att.fileName.replace(/\.ts$/, '')}';\n` +
      `import { Add${ctx.singlePascal}AttachmentDto } from './dto/add-${ctx.singular}-attachment.dto';\n`
    : '';
  const attRepoParam = hasAttachments
    ? `\n    @InjectRepository(${att.className})\n    private readonly attachmentsRepository: Repository<${att.className}>,`
    : '';
  // 已声明的附件字段清单：拒绝未声明的关联，避免往表里塞任意分组名。
  const attFieldList = hasAttachments
    ? `/** 已声明的附件字段（协议）——未声明的会被拒绝。 */\nconst ${ctx.singular.toUpperCase()}_ATTACHMENT_FIELDS = [${attachmentNames
        .map((n) => `'${n}'`)
        .join(', ')}];\n\n`
    : '';
  const attMethods = hasAttachments
    ? `\n  /**\n` +
      `   * Lists a row's attachments. Ownership is checked through the owner row first, so\n` +
      `   * permissions are inherited rather than re-declared.\n` +
      `   *\n` +
      `   * 列出某行的附件。先经 owner 行做所有权检查 —— 权限是**继承**来的，不另立一套。\n` +
      `   */\n` +
      `  async listAttachments(id: number, ability: AppAbility): Promise<${att.className}[]> {\n` +
      `    const owner = await this.findOne(id, ability);\n` +
      `    return this.attachmentsRepository.find({\n` +
      `      where: { ${att.ownerColumn}: owner.id },\n` +
      `      order: { createdAt: 'DESC' },\n` +
      `    });\n` +
      `  }\n\n` +
      `  /**\n` +
      `   * Associates an already-uploaded file with a row. The upload itself goes through the\n` +
      `   * platform's existing /upload pipeline (magic bytes, image processing); this only\n` +
      `   * records the association — and it checks the owner first, so a caller cannot attach\n` +
      `   * files to somebody else's row.\n` +
      `   *\n` +
      `   * 把一个**已经上传**的文件关联到某行。上传本身走平台既有的 /upload 管线（魔数校验、\n` +
      `   * 图片处理）；这里只登记关联 —— 且先检查 owner，调用者无法往别人的行上挂文件。\n` +
      `   */\n` +
      `  async addAttachment(\n` +
      `    id: number,\n` +
      `    dto: Add${ctx.singlePascal}AttachmentDto,\n` +
      `    userId: number,\n` +
      `    ability: AppAbility,\n` +
      `  ): Promise<${att.className}> {\n` +
      `    const owner = await this.findOne(id, ability);\n` +
      `    if (!${ctx.singular.toUpperCase()}_ATTACHMENT_FIELDS.includes(dto.field)) {\n` +
      `      throw new BadRequestException('未知的附件字段');\n` +
      `    }\n` +
      `    const row = this.attachmentsRepository.create({\n` +
      `      ${att.ownerColumn}: owner.id,\n` +
      `      field: dto.field,\n` +
      `      storageKey: dto.storageKey,\n` +
      `      originalName: dto.originalName,\n` +
      `      mimeType: dto.mimeType,\n` +
      `      size: dto.size,\n` +
      `      userId,\n` +
      `    });\n` +
      `    return this.attachmentsRepository.save(row);\n` +
      `  }\n\n` +
      `  /** 撤销关联（软删，可经回收站恢复）。同样先校验 owner。 */\n` +
      `  async removeAttachment(id: number, attachmentId: number, ability: AppAbility): Promise<void> {\n` +
      `    const owner = await this.findOne(id, ability);\n` +
      `    const row = await this.attachmentsRepository.findOne({\n` +
      `      where: { id: attachmentId, ${att.ownerColumn}: owner.id },\n` +
      `    });\n` +
      `    if (!row) throw new NotFoundException('附件不存在');\n` +
      `    await this.attachmentsRepository.softDelete(attachmentId);\n` +
      `  }\n`
    : '';
  const refRepoParams = refTargets
    .map(
      (t) =>
        `\n    @InjectRepository(${t.pascal})\n    private readonly ${t.plural}Repository: Repository<${t.pascal}>,`,
    )
    .join('');
  const refAssertCall = refs.length > 0 ? `    await this._assertRefs(dto);\n` : '';
  const relEntries = [
    ...refs.map((r) => `${r.name}: true`),
    ...(hasAttachments ? [`${att.relation}: true`] : []),
  ];
  const refRelations = relEntries.length > 0 ? `relations: { ${relEntries.join(', ')} }, ` : '';
  const refAssertMethod =
    refs.length === 0
      ? ''
      : `\n  /**\n` +
        `   * Ref validation: every foreign key must point at a row that exists.\n` +
        `   * A soft-deleted target counts as missing — TypeORM's find excludes those by default.\n` +
        `   *\n` +
        `   * 关联校验：每个外键都必须指向确实存在的行。软删的目标视为不存在 —— TypeORM 的\n` +
        `   * find 默认就把它们排除在外。\n` +
        `   */\n` +
        `  private async _assertRefs(dto: {\n` +
        refs.map((r) => `    ${r.column}?: number | null;`).join('\n') +
        `\n  }): Promise<void> {\n` +
        refs
          .map(
            (r) =>
              `    if (dto.${r.column} != null) {\n` +
              `      const found = await this.${refTarget(r.target).plural}Repository.findOne({ where: { id: dto.${r.column} } });\n` +
              `      if (!found) throw new BadRequestException('${r.column} 指向的记录不存在');\n` +
              `    }`,
          )
          .join('\n') +
        `\n  }\n`;
  // 只有声明了 pii 的模块才产出掩码路径 —— 不产死代码（Code Economy §15.3）
  const adminList =
    pii.length === 0
      ? `  /** 管理端：全量列表（无 userId 过滤，admin） */\n  async findAllForAdmin(): Promise<${ctx.singlePascal}[]> {\n    return this.${ctx.plural}Repository.find({ ${refRelations}order: { createdAt: 'DESC' } });\n  }`
      : `  /** 管理端：全量列表（无 userId 过滤，admin）。协议声明的 pii 字段在此掩码 */\n` +
        `  async findAllForAdmin(): Promise<${ctx.singlePascal}[]> {\n` +
        `    const rows = await this.${ctx.plural}Repository.find({ ${refRelations}order: { createdAt: 'DESC' } });\n` +
        `    return rows.map((row) => this._maskPii(row));\n` +
        `  }\n\n` +
        `  /**\n` +
        `   * Masks the fields the protocol declared as personal data. Masking happens\n` +
        `   * server-side, so neither the admin UI nor any API client receives plaintext.\n` +
        `   *\n` +
        `   * 对协议声明为个人数据的字段掩码。掩码在服务端完成 —— 管理台与任何 API 调用方\n` +
        `   * 都拿不到明文。\n` +
        `   */\n` +
        `  private _maskPii(row: ${ctx.singlePascal}): ${ctx.singlePascal} {\n` +
        `    return {\n` +
        `      ...row,\n` +
        pii.map((c) => `      ${c}: row.${c} == null ? row.${c} : maskText(String(row.${c})),`).join('\n') +
        `\n    };\n` +
        `  }`;
  // `BadRequestException` 有两处用它的地方：ref 目标不存在、以及附件字段名不在声明内。
  // 原先只看 `refs` ⇒ 只声明附件字段的模块生成出来编译不过（2026-09-25 编译门实测抓到）。
  return `import { Injectable, NotFoundException, ForbiddenException, ConflictException${refs.length > 0 || attachmentNames.length > 0 ? ', BadRequestException' : ''} } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';
${refRepoImports}${attRepoImport}import { Create${ctx.singlePascal}Dto } from './dto/create-${ctx.singular}.dto';
import { Update${ctx.singlePascal}Dto } from './dto/update-${ctx.singular}.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';${piiImport}

${attFieldList}@Injectable()
export class ${ctx.pluralPascal}Service {
  constructor(
    @InjectRepository(${ctx.singlePascal})
    private readonly ${ctx.plural}Repository: Repository<${ctx.singlePascal}>,${refRepoParams}${attRepoParam}
  ) {}
${refAssertMethod}${attMethods}

  async create(dto: Create${ctx.singlePascal}Dto, userId: number): Promise<${ctx.singlePascal}> {
${refAssertCall}    const entity = this.${ctx.plural}Repository.create({
      ...dto,
      userId,
    });
    return this.${ctx.plural}Repository.save(entity);
  }

  async findAll(userId: number): Promise<${ctx.singlePascal}[]> {
    return this.${ctx.plural}Repository.find({
      where: { userId },
      ${refRelations}order: { createdAt: 'DESC' },
    });
  }

${adminList}

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.${ctx.plural}Repository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<${ctx.singlePascal}> {
    const entity = await this.${ctx.plural}Repository.findOne({ where: { id }, ${refRelations}});
    if (!entity) throw new NotFoundException('${ctx.singlePascal} not found');
    if (ability.cannot('read', subject('${ctx.singlePascal}', entity))) {
      throw new ForbiddenException('无权访问此${ctx.label}');
    }
    return entity;
  }

  async update(id: number, dto: Update${ctx.singlePascal}Dto, ability: AppAbility): Promise<${ctx.singlePascal}> {
${refAssertCall}    const entity = await this.findOne(id, ability);
    const { version, ...fields } = dto;
    // The conditional update is the **only** arbiter: the row is written only while it is still at
    // the version the caller read, so two writers cannot both succeed.
    //
    // Note what is deliberately *not* used: save(). A version column bumps on write but does not
    // guard the write — checked against the SQL the driver actually emits, the UPDATE carries no
    // version predicate — so a stale save silently overwrites. Zero rows affected is the conflict.
    //
    // 条件更新是**唯一**仲裁点：只有当行仍停在调用方读到的那个版本时才写入，故两个写入者不可能都成功。
    //
    // 这里刻意**不用** save()：版本列会在写入时自增，却不为写入设防 —— 按驱动实发的 SQL 核过，
    // 那条 UPDATE 里没有版本判据 —— 于是一次陈旧的保存就是无声覆盖。「影响 0 行」即冲突。
    const result = await this.${ctx.plural}Repository.update(
      { id: entity.id, version },
      { ...fields, version: () => 'version + 1' },
    );
    if (!result.affected) {
      throw new ConflictException('该记录已被他人修改，请刷新后重试');
    }
    return this.findOne(id, ability);
  }

  async remove(id: number, ability: AppAbility): Promise<void> {
    const entity = await this.findOne(id, ability);
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.${ctx.plural}Repository.softDelete(entity.id);
  }
}
`;
}

export function controllerTemplate(ctx) {
  const flagImport = ctx.featureFlag
    ? `import { FeatureFlag } from '../feature-flags/feature-flag.decorator';\n`
    : '';
  const flagDecorator = ctx.featureFlag ? `@FeatureFlag('${ctx.plural}')\n` : '';
  const attachmentNames = attachmentFields(ctx.fields);
  const attDtoImport =
    attachmentNames.length > 0
      ? `import { Add${ctx.singlePascal}AttachmentDto } from './dto/add-${ctx.singular}-attachment.dto';\n`
      : '';
  const attRoutes =
    attachmentNames.length === 0
      ? ''
      : `  @Get(':id/attachments')\n` +
        `  @ApiOperation({ summary: '${ctx.label}附件列表' })\n` +
        `  async listAttachments(@Param('id', ParseIntPipe) id: number, @CurrentAbility() ability: AppAbility) {\n` +
        `    return this.${ctx.plural}Service.listAttachments(id, ability);\n` +
        `  }\n\n` +
        `  @Post(':id/attachments')\n` +
        `  @ApiOperation({ summary: '关联一个已上传的文件' })\n` +
        `  async addAttachment(\n` +
        `    @Param('id', ParseIntPipe) id: number,\n` +
        `    @Body() dto: Add${ctx.singlePascal}AttachmentDto,\n` +
        `    @CurrentUser() user: JwtPayload,\n` +
        `    @CurrentAbility() ability: AppAbility,\n` +
        `  ) {\n` +
        `    return this.${ctx.plural}Service.addAttachment(id, dto, user.sub, ability);\n` +
        `  }\n\n` +
        `  @Delete(':id/attachments/:attachmentId')\n` +
        `  @HttpCode(HttpStatus.OK)\n` +
        `  @ApiOperation({ summary: '撤销关联（软删）' })\n` +
        `  async removeAttachment(\n` +
        `    @Param('id', ParseIntPipe) id: number,\n` +
        `    @Param('attachmentId', ParseIntPipe) attachmentId: number,\n` +
        `    @CurrentAbility() ability: AppAbility,\n` +
        `  ) {\n` +
        `    await this.${ctx.plural}Service.removeAttachment(id, attachmentId, ability);\n` +
        `    return null;\n` +
        `  }\n\n`;
  return `import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { Create${ctx.singlePascal}Dto } from './dto/create-${ctx.singular}.dto';
import { Update${ctx.singlePascal}Dto } from './dto/update-${ctx.singular}.dto';
${attDtoImport}import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
${flagImport}import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('${ctx.label}')
@ApiBearerAuth()
${flagDecorator}@Controller({ path: '${ctx.plural}', version: '1' })
export class ${ctx.pluralPascal}Controller {
  constructor(private readonly ${ctx.plural}Service: ${ctx.pluralPascal}Service) {}

  // 管理端：全量列表（admin，供 Web-Admin-Vue 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量${ctx.label}列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.${ctx.plural}Service.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意${ctx.label}' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.${ctx.plural}Service.removeAsAdmin(id);
    return null;
  }

${attRoutes}  @Post()
  @ApiOperation({ summary: '创建${ctx.label}' })
  async create(@Body() dto: Create${ctx.singlePascal}Dto, @CurrentUser() user: JwtPayload) {
    return this.${ctx.plural}Service.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的${ctx.label}列表' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.${ctx.plural}Service.findAll(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新${ctx.label}' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Update${ctx.singlePascal}Dto,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.${ctx.plural}Service.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除${ctx.label}' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.${ctx.plural}Service.remove(id, ability);
    return null;
  }
}
`;
}

export function moduleTemplate(ctx) {
  const pii = piiFieldNames(ctx.fields);
  const piiImport =
    pii.length > 0 ? `import { registerSensitiveKeys } from '../common/utils/mask';\n\n` : '';
  const refs = refFields(ctx.fields);
  const refTargets = refs
    .map((r) => refTarget(r.target))
    .filter((t, i, arr) => arr.findIndex((x) => x.plural === t.plural) === i);
  const refEntityImports = refTargets
    .map((t) => `import { ${t.pascal} } from '../${t.plural}/${t.singular}.entity';\n`)
    .join('');
  const refForFeature = refTargets.map((t) => `, ${t.pascal}`).join('');
  const attachments = attachmentFields(ctx.fields);
  const att = attachmentArtifacts(ctx);
  const attachImport =
    attachments.length > 0
      ? `import { ${att.className} } from './${att.fileName.replace(/\.ts$/, '')}';\n`
      : '';
  const attachForFeature = attachments.length > 0 ? `, ${att.className}` : '';
  const piiRegister =
    pii.length > 0
      ? `// 协议 pii 声明 → 让审计 requestBody 打码覆盖这些键名（平台内建清单不认识它们）。\n` +
        `// Protocol pii declarations → let audit requestBody redaction cover these names,\n` +
        `// which the platform's built-in list cannot know.\n` +
        `registerSensitiveKeys([${pii.map((c) => `'${c}'`).join(', ')}]);\n\n`
      : '';
  return `${piiImport}import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${ctx.pluralPascal}Controller } from './${ctx.plural}.controller';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';
${refEntityImports}${attachImport}
${piiRegister}@Module({
  imports: [TypeOrmModule.forFeature([${ctx.singlePascal}${refForFeature}${attachForFeature}])],
  controllers: [${ctx.pluralPascal}Controller],
  providers: [${ctx.pluralPascal}Service],
  exports: [${ctx.pluralPascal}Service],
})
export class ${ctx.pluralPascal}Module {}
`;
}

export function controllerSpecTemplate(ctx) {
  return `import { ${ctx.pluralPascal}Controller } from './${ctx.plural}.controller';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';

describe('${ctx.pluralPascal}Controller', () => {
  let controller: ${ctx.pluralPascal}Controller;
  let service: jest.Mocked<
    Pick<${ctx.pluralPascal}Service, 'create' | 'findAll' | 'findAllForAdmin' | 'update' | 'remove' | 'removeAsAdmin'>
  >;

  const mockUser = { sub: 1, username: 'alex' };
  const mockAbility = { cannot: () => false } as any;
  const mockEntity = { id: 1 } as any;

  beforeEach(() => {
    service = {
      create: jest.fn(),
      findAll: jest.fn(),
      findAllForAdmin: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
      removeAsAdmin: jest.fn(),
    };
    controller = new ${ctx.pluralPascal}Controller(service as unknown as ${ctx.pluralPascal}Service);
  });

  it('create 委托 service.create 并传入 userId', async () => {
    service.create.mockResolvedValue(mockEntity as never);
    const dto = {};
    await expect(controller.create(dto as any, mockUser as any)).resolves.toBe(mockEntity);
    expect(service.create).toHaveBeenCalledWith(dto, 1);
  });

  it('findAll 委托 service.findAll 并传入 userId', async () => {
    service.findAll.mockResolvedValue([mockEntity] as never);
    await expect(controller.findAll(mockUser as any)).resolves.toEqual([mockEntity]);
    expect(service.findAll).toHaveBeenCalledWith(1);
  });

  it('findAllForAdmin 委托 service.findAllForAdmin（管理端全量）', async () => {
    service.findAllForAdmin.mockResolvedValue([mockEntity] as never);
    await expect(controller.findAllForAdmin()).resolves.toEqual([mockEntity]);
    expect(service.findAllForAdmin).toHaveBeenCalled();
  });

  it('update 委托 service.update 并传入 ability', async () => {
    service.update.mockResolvedValue(mockEntity as never);
    const dto = {};
    await expect(controller.update(1, dto as any, mockUser as any, mockAbility)).resolves.toBe(mockEntity);
    expect(service.update).toHaveBeenCalledWith(1, dto, mockAbility);
  });

  it('remove 委托 service.remove 并返回 null', async () => {
    service.remove.mockResolvedValue(undefined as never);
    await expect(controller.remove(1, mockUser as any, mockAbility)).resolves.toBeNull();
    expect(service.remove).toHaveBeenCalledWith(1, mockAbility);
  });

  it('removeAsAdmin 委托 service.removeAsAdmin 并返回 null', async () => {
    service.removeAsAdmin.mockResolvedValue(undefined as never);
    await expect(controller.removeAsAdmin(1)).resolves.toBeNull();
    expect(service.removeAsAdmin).toHaveBeenCalledWith(1);
  });
});
`;
}

export function serviceSpecTemplate(ctx) {
  return `import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';
import { Update${ctx.singlePascal}Dto } from './dto/update-${ctx.singular}.dto';

describe('${ctx.pluralPascal}Service', () => {
  let service: ${ctx.pluralPascal}Service;
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
    update: jest.fn(),
  };

  const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ${ctx.pluralPascal}Service,
        { provide: getRepositoryToken(${ctx.singlePascal}), useValue: mockRepo },
      ],
    }).compile();
    service = module.get<${ctx.pluralPascal}Service>(${ctx.pluralPascal}Service);
  });

  it('creates a ${ctx.singular} bound to user', async () => {
    mockRepo.create.mockReturnValue({ id: 1, userId: 5 });

    const result = await service.create({} as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(expect.objectContaining({ userId: 5 }));
    expect(result.userId).toBe(5);
  });

  it('returns only user ${ctx.plural}', async () => {
    mockRepo.find.mockResolvedValue([{ id: 1 }]);

    const result = await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: 5 } }));
    expect(result).toHaveLength(1);
  });

  it('throws when CASL forbids access', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.findOne(1, mockAbility(false))).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFound when missing', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(1, mockAbility(true))).rejects.toThrow(NotFoundException);
  });

  it('refuses a stale update with 409 instead of overwriting silently', async () => {
    // The caller read version 2 while the row has moved to 3, so the conditional update matches
    // nothing. Zero rows affected is the conflict — the update must have carried the version.
    //
    // 调用方读到版本 2，而行已走到 3，于是条件更新一条也没匹配上。「影响 0 行」即冲突 ——
    // 前提是那条更新确实把版本带进了条件。
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 3 });
    mockRepo.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.update(1, { version: 2 } as Update${ctx.singlePascal}Dto, mockAbility(true)),
    ).rejects.toThrow(ConflictException);
    expect(mockRepo.update).toHaveBeenCalledWith(
      { id: 1, version: 2 },
      expect.objectContaining({ version: expect.any(Function) }),
    );
  });

  it('a matching version writes once and answers with the fresh row', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 2 });
    mockRepo.update.mockResolvedValue({ affected: 1 });

    await service.update(1, { version: 2 } as Update${ctx.singlePascal}Dto, mockAbility(true));

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true));

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('does not soft-delete when CASL forbids (remove)', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });

    await expect(service.remove(1, mockAbility(false))).rejects.toThrow(ForbiddenException);

    expect(mockRepo.softDelete).not.toHaveBeenCalled();
  });

  it('removeAsAdmin soft-deletes without ownership (RG-3 recovery)', async () => {
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.removeAsAdmin(1);

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });
});
`;
}

/** 全部后端文件：{ relativePath, content }。 */
export function backendFiles(ctx) {
  const att = attachmentArtifacts(ctx);
  const files = [
    { path: `${ctx.plural}/${ctx.singular}.entity.ts`, content: entityTemplate(ctx) },
    { path: `${ctx.plural}/dto/create-${ctx.singular}.dto.ts`, content: createDtoTemplate(ctx) },
    { path: `${ctx.plural}/dto/update-${ctx.singular}.dto.ts`, content: updateDtoTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.service.ts`, content: serviceTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.controller.ts`, content: controllerTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.module.ts`, content: moduleTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.service.spec.ts`, content: serviceSpecTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.controller.spec.ts`, content: controllerSpecTemplate(ctx) },
  ];
  if (attachmentFields(ctx.fields).length > 0) {
    files.push({
      path: `${ctx.plural}/${att.fileName}`,
      content: attachmentEntityTemplate(ctx),
    });
    files.push({
      path: `${ctx.plural}/dto/add-${ctx.singular}-attachment.dto.ts`,
      content: attachmentDtoTemplate(ctx),
    });
  }
  return files;
}
