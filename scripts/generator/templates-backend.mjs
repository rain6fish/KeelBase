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
  searchableFieldNames,
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
  // 协议 scope 声明的列。列名固定（orgId / deptId）——与 userId 一样属固定安全接线，spec 只声明
  // 参与哪一级，不点名列。
  //
  // Protocol-declared scope columns. The names are fixed (orgId / deptId) exactly as userId is: the
  // spec declares which level the module takes part in, not what to call the column.
  const scoped = (ctx.scope ?? []).includes('org');
  const scopeCols = !scoped
    ? ''
    : `\n  /**
   * The organisation this row belongs to, stamped from the creator's membership at creation time.
   * \`null\` means the creator belonged to none — the row stays owner-only rather than becoming
   * visible to everyone.
   *
   * 本行所属组织，创建时按创建者的组织归属盖章。\`null\` = 创建者不属于任何组织 ⇒ 该行保持仅本人可见，
   * 而不是变成所有人可见。
   */
  @Column({ nullable: true, name: 'org_id' })
  orgId?: number;\n` +
      ((ctx.scope ?? []).includes('dept')
        ? `
  /** Same stamping, for the department column that role-configured levels read. */
  /* 同一处盖章，供按角色配置的部门级范围读取。 */
  @Column({ nullable: true, name: 'dept_id' })
  deptId?: number;\n`
        : '');
  const scopeIndex = scoped ? `\n@Index(['orgId'])` : '';
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
@Index(['userId'])${scopeIndex}
${refIndexes}
export class ${ctx.singlePascal} {
  @PrimaryGeneratedColumn()
  id!: number;

${fieldCols}

  @Column({ nullable: true, name: 'user_id' })
  userId?: number;
${scopeCols}
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
   *
   * 「default: 1」不是装饰：没有它，这一列就是「NOT NULL 且无默认」，而**往已有数据的表上加这样一列
   * 会失败**（sqlite 因 NOT NULL 约束拒绝回填，Postgres 同样）。加了它，既有库才升得上来——且 1 正是
   * TypeORM 为版本列取的起始值，语义不变。
   *
   * The default of 1 is load-bearing, not decoration: without it this column is NOT NULL with no default,
   * and **adding such a column to a table that already has rows fails** — sqlite refuses the backfill on
   * the NOT NULL constraint, and Postgres does too. With it, existing databases can be upgraded; and 1 is
   * the value TypeORM already starts a version column at, so the semantics are unchanged.
   */
  @VersionColumn({ default: 1 })
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
  // 协议 scope 声明 ⇒ 这个模块参与行级数据范围。用平台既有的构件，不另立一套：级别来源
  // （角色配置优先、内置默认兜底）与 where 构造都由 common/scope 提供，todos/events 走的正是同一条路。
  //
  // A protocol `scope` declaration ⇒ this module takes part in row-level data scope, using the
  // platform's existing pieces rather than a private copy: level resolution (role configuration first,
  // built-in default otherwise) and where construction both live in common/scope, which is the same
  // road todos and events travel.
  const scoped = (ctx.scope ?? []).includes('org');
  // `Optional` joins the existing @nestjs/common import rather than opening a second one for the
  // same module — an import line per injected dependency is how a file ends up with four of them.
  // `Optional` 并入既有的 @nestjs/common import，而不是为同一个模块再开一行 —— 一个依赖一行 import，
  // 是文件最后长出四行同类 import 的方式。
  const nestCommonImports = `Injectable, NotFoundException, ForbiddenException, ConflictException${
    scoped ? ', Optional' : ''
  }`;
  const scopeImports = scoped
    ? `\nimport { OrgService } from '../org/org.service';\n` +
      `import { DataScopeService } from '../authz/data-scope.service';\n` +
      `import { assertCallerIdentity, orgContextOf, resolveScopeDescriptor } from '../common/scope/scope-resolution';\n` +
      `import { buildScopeWhere, registerScopeColumns, rowInScope } from '../common/scope/scope-where';\n` +
      `import { registerOrgLevelSubject } from '../common/scope/scope-policy';\n`
    : '';
  // 自登记写在**服务**文件里，不是模块文件 —— 因为consume它的是服务，而单元测试只 import 服务。
  // 写在模块里时测试跑的是「未登记」的路（组织分支不触发），当真跑生成物自己的 spec 才暴露出来。
  //
  // The self-registration lives in the **service** file rather than the module file: the service is
  // what consumes it, and a unit test imports the service. With it in the module, the generated spec
  // exercised the *unregistered* path — the org branch never fired — which only surfaced by actually
  // running the generated spec.
  const scopeRegister = scoped
    ? `// 协议 scope 声明 → 本模块参与行级数据范围：登记自己的列，并按缺省走「本人或同组织」。\n` +
      `// 列名固定（与生成实体一致）；未声明 scope 的模块不登记，也就仍是仅本人 —— 绝不静默放宽。\n` +
      `// Protocol scope declaration → this module takes part in row-level data scope: it registers its\n` +
      `// own columns and defaults to "own or same organisation". Undeclared modules stay owner-only.\n` +
      `registerScopeColumns('${ctx.singlePascal}', { owner: 'userId', org: 'orgId'${
        (ctx.scope ?? []).includes('dept') ? `, dept: 'deptId'` : ''
      } });\n` +
      `registerOrgLevelSubject('${ctx.singlePascal}');\n\n`
    : '';
  const scopeParams = scoped
    ? `\n    @Optional() private readonly orgService?: OrgService,\n    @Optional() private readonly dataScope?: DataScopeService,`
    : '';
  const scopeHelpers = scoped
    ? `
  /**
   * The caller's data scope for this subject: role configuration when present, the built-in default
   * otherwise. Missing configuration only ever tightens — see \`common/scope\`.
   *
   * 调用方在本 subject 上的数据范围：有角色配置用它、否则用内置默认。配置缺失只会收紧 —— 见
   * \`common/scope\`。
   */
  private async _scopeFor(userId: number) {
    return resolveScopeDescriptor(userId, '${ctx.singlePascal}', this.orgService, this.dataScope);
  }

  /**
   * Whether this caller may read or manage this row: its own, or same-organisation. Kept in step with
   * the list query so a row that shows up in the list is never refused on the detail path.
   *
   * 该调用方能否读/管理这一行：本人的，或同组织的。与列表查询保持同一口径，故**列表里看得见的行，
   * 明细路径上不会反被拒**。
   */
  private async _canAccess(row: ${ctx.singlePascal}, ability: AppAbility, userId: number): Promise<boolean> {
    if (ability.can('manage', 'all')) return true;
    if (ability.can('read', subject('${ctx.singlePascal}', row))) return true;
    return rowInScope(row as unknown as Record<string, unknown>, await this._scopeFor(userId), '${ctx.singlePascal}');
  }
`
    : '';
  const scopeCreateStamp = scoped
    ? `    // Stamped from the creator's membership: a member's rows are visible to their organisation,\n` +
      `    // a non-member's stay owner-only. A missing org never widens anything.\n` +
      `    // 按创建者的组织归属盖章：成员的行对其组织可见，非成员的行保持仅本人。组织信息缺失绝不放宽。\n` +
      `    const orgContext = await orgContextOf(this.orgService, userId);\n`
    : '';
  const scopeCreateCols = scoped
    ? `      orgId: orgContext?.orgId ?? undefined,\n` +
      ((ctx.scope ?? []).includes('dept') ? `      deptId: orgContext?.deptId ?? undefined,\n` : '')
    : '';
  // The runtime identity guard, emitted first in every scoped read. The signature says `userId: number`,
  // but a plain-JS caller can still hand in `undefined`; the guard denies on absence *before* the row is
  // read, so a missing identity can never widen a scoped read — the rule `events` / `todos` follow.
  //
  // 运行时身份守卫，放在每次带范围读取的最前。签名写着 `userId: number`，但纯 JS 调用方仍可传
  // `undefined`；守卫在读行**之前**拒绝缺席的身份，故缺失的身份绝不可能放宽带范围的读取 ——
  // `events` / `todos` 走的就是这条。
  const scopeGuardList = scoped ? `    assertCallerIdentity(userId, '读取${ctx.label}列表');\n` : '';
  const scopeGuardOne = scoped ? `    assertCallerIdentity(userId, '读取${ctx.label}');\n` : '';
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
  // The columns the list's `?q=` may match — the same function the manifest uses, so a module cannot
  // advertise one set of searchable columns and search another.
  // 列表 `?q=` 可匹配的列 —— 与清单由**同一个函数**算出，故一个模块不会公布一组可搜列、却搜另一组。
  const searchColumns = searchableFieldNames(ctx.fields);
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
  // The list's declared search columns, emitted only when there are any: a module with nothing to
  // match gets no filter at all, rather than one that silently matches everything.
  // 列表的已声明可搜列；没有可匹配的列时不发射 —— 这样的模块宁可没有过滤，也不要一个静默匹配全部。
  const searchColumnList =
    searchColumns.length === 0
      ? ''
      : `/** 列表 \`?q=\` 匹配的列（spec 的 string / text 字段，按声明顺序）。 */\n` +
        `const ${ctx.singular.toUpperCase()}_SEARCH_COLUMNS = [${searchColumns.map((n) => `'${n}'`).join(', ')}];\n\n`;
  // The list read. With no declared text column it is character-for-character what it always was;
  // with one, an optional `q` narrows it — and it narrows *within* the row-level scope rather than
  // replacing it, which is the whole point: a filter that widened the query would be a leak.
  // 列表读取。没有声明文本列时与从前**一字不差**；有时多一个可选的 `q` —— 而它是在行级范围**之内**
  // 收窄，不是替换那个范围；这一点是全部要害：一个把查询放宽的过滤就是一个漏洞。
  const searchConst = `${ctx.singular.toUpperCase()}_SEARCH_COLUMNS`;
  const searchFind =
    `    const keyword = q?.trim();\n` +
    `    // Every arm carries the ownership condition, so a hit on any column still stays the caller's\n` +
    `    // own rows.\n` +
    `    // 每条分支各自带归属条件，故任何一列命中都仍限在调用方自己的行内。\n` +
    `    const where = keyword\n` +
    `      ? ${searchConst}.map((column) => ({ userId, [column]: Like(\`%\${keyword}%\`) }))\n` +
    `      : { userId };\n`;
  const searchFindScoped =
    `    const descriptor = await this._scopeFor(userId);\n` +
    `    const scoped = (buildScopeWhere<Record<string, unknown>>(descriptor, '${ctx.singlePascal}') ?? []) as any;\n` +
    `    const keyword = q?.trim();\n` +
    `    // Search arms are built *from* the scope arms, never instead of them: a hit on any column still\n` +
    `    // cannot escape the caller's scope. An empty list is the level-\`all\` shape (no row-level\n` +
    `    // constraint), and the filter applies there too.\n` +
    `    // 搜索分支是**从**范围分支长出来的，不是替换它：任何一列命中都逃不出调用方范围。列表为空即\n` +
    `    // level-\`all\` 的形状（无行级约束），在那里过滤同样生效。\n` +
    `    const where = keyword\n` +
    `      ? (scoped.length > 0 ? scoped : [{}]).flatMap((arm: Record<string, unknown>) =>\n` +
    `          ${searchConst}.map((column) => ({ ...arm, [column]: Like(\`%\${keyword}%\`) })),\n` +
    `        )\n` +
    `      : scoped;\n`;
  const listFind = `    return this.${ctx.plural}Repository.find({\n      where,\n      ${refRelations}order: { createdAt: 'DESC' },\n    });`;
  const findAllBody =
    searchColumns.length === 0
      ? scoped
        ? `${scopeGuardList}    const descriptor = await this._scopeFor(userId);\n    const where = (buildScopeWhere<Record<string, unknown>>(descriptor, '${ctx.singlePascal}') ?? []) as any;\n${listFind}`
        : `    return this.${ctx.plural}Repository.find({\n      where: { userId },\n      ${refRelations}order: { createdAt: 'DESC' },\n    });`
      : (scoped ? scopeGuardList + searchFindScoped : searchFind) + listFind;
  return `import { ${nestCommonImports}${refs.length > 0 || attachmentNames.length > 0 ? ', BadRequestException' : ''} } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ${searchColumns.length > 0 ? 'Like, ' : ''}Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';
${refRepoImports}${attRepoImport}import { Create${ctx.singlePascal}Dto } from './dto/create-${ctx.singular}.dto';
import { Update${ctx.singlePascal}Dto } from './dto/update-${ctx.singular}.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';${piiImport}${scopeImports}

${scopeRegister}${attFieldList}${searchColumnList}@Injectable()
export class ${ctx.pluralPascal}Service {
  constructor(
    @InjectRepository(${ctx.singlePascal})
    private readonly ${ctx.plural}Repository: Repository<${ctx.singlePascal}>,${refRepoParams}${attRepoParam}${scopeParams}
  ) {}
${refAssertMethod}${scopeHelpers}${attMethods}

  async create(dto: Create${ctx.singlePascal}Dto, userId: number): Promise<${ctx.singlePascal}> {
${refAssertCall}${scopeCreateStamp}    const entity = this.${ctx.plural}Repository.create({
      ...dto,
      userId,
${scopeCreateCols}    });
    return this.${ctx.plural}Repository.save(entity);
  }

  async findAll(userId: number${searchColumns.length > 0 ? ', q?: string' : ''}): Promise<${ctx.singlePascal}[]> {
${findAllBody}
  }

${adminList}

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.${ctx.plural}Repository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility${scoped ? ', userId: number' : ''}): Promise<${ctx.singlePascal}> {
${scopeGuardOne}    const entity = await this.${ctx.plural}Repository.findOne({ where: { id }, ${refRelations}});
    if (!entity) throw new NotFoundException('${ctx.singlePascal} not found');
${
  scoped
    ? `    if (!(await this._canAccess(entity, ability, userId))) {
      throw new ForbiddenException('无权访问此${ctx.label}');
    }`
    : `    if (ability.cannot('read', subject('${ctx.singlePascal}', entity))) {
      throw new ForbiddenException('无权访问此${ctx.label}');
    }`
}
    return entity;
  }

  async update(id: number, dto: Update${ctx.singlePascal}Dto, ability: AppAbility${scoped ? ', userId: number' : ''}): Promise<${ctx.singlePascal}> {
${refAssertCall}    const entity = await this.findOne(id, ability${scoped ? ', userId' : ''});
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
    return this.findOne(id, ability${scoped ? ', userId' : ''});
  }

  async remove(id: number, ability: AppAbility${scoped ? ', userId: number' : ''}): Promise<void> {
    const entity = await this.findOne(id, ability${scoped ? ', userId' : ''});
    // RG-3 软删除：置 deleted_at，管理台回收站可恢复
    await this.${ctx.plural}Repository.softDelete(entity.id);
  }
}
`;
}

export function controllerTemplate(ctx) {
  const scoped = (ctx.scope ?? []).includes('org');
  const flagImport = ctx.featureFlag
    ? `import { FeatureFlag } from '../feature-flags/feature-flag.decorator';\n`
    : '';
  const flagDecorator = ctx.featureFlag ? `@FeatureFlag('${ctx.plural}')\n` : '';
  const attachmentNames = attachmentFields(ctx.fields);
  const searchColumns = searchableFieldNames(ctx.fields);
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
  return `import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe${searchColumns.length > 0 ? ', Query' : ''} } from '@nestjs/common';
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
  async findAll(@CurrentUser() user: JwtPayload${searchColumns.length > 0 ? ", @Query('q') q?: string" : ''}) {
    return this.${ctx.plural}Service.findAll(user.sub${searchColumns.length > 0 ? ', q' : ''});
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新${ctx.label}' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: Update${ctx.singlePascal}Dto,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.${ctx.plural}Service.update(id, dto, ability${scoped ? ', user.sub' : ''});
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除${ctx.label}' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.${ctx.plural}Service.remove(id, ability${scoped ? ', user.sub' : ''});
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
  // 参与范围 ⇒ 需要 OrgService / DataScopeService（都在 OrgModule 里导出）。模块文件只负责接线，
  // 自登记在**服务**文件里（见 serviceTemplate）。
  //
  // Taking part in scope needs OrgService / DataScopeService (both exported by OrgModule). The module
  // file only wires them; the self-registration lives in the **service** file — see serviceTemplate.
  const scoped = (ctx.scope ?? []).includes('org');
  const scopeModuleImport = scoped ? `import { OrgModule } from '../org/org.module';\n` : '';
  const scopeModuleDep = scoped ? ', OrgModule' : '';
  return `${piiImport}import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${ctx.pluralPascal}Controller } from './${ctx.plural}.controller';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';
${refEntityImports}${attachImport}${scopeModuleImport}
${piiRegister}@Module({
  imports: [TypeOrmModule.forFeature([${ctx.singlePascal}${refForFeature}${attachForFeature}])${scopeModuleDep}],
  controllers: [${ctx.pluralPascal}Controller],
  providers: [${ctx.pluralPascal}Service],
  exports: [${ctx.pluralPascal}Service],
})
export class ${ctx.pluralPascal}Module {}
`;
}

export function controllerSpecTemplate(ctx) {
  const scoped = (ctx.scope ?? []).includes('org');
  const searchColumns = searchableFieldNames(ctx.fields);
  // With a `q` parameter the delegation carries one more argument and the assertion has to say so;
  // without one the case stays exactly as it was.
  // 带 `q` 形参时，这次委托多一个实参，断言必须如实跟上；不带时该用例与从前一字不差。
  const findAllCase =
    searchColumns.length === 0
      ? `  it('findAll 委托 service.findAll 并传入 userId', async () => {\n    service.findAll.mockResolvedValue([mockEntity] as never);\n    await expect(controller.findAll(mockUser as any)).resolves.toEqual([mockEntity]);\n    expect(service.findAll).toHaveBeenCalledWith(1);\n  });`
      : `  it('findAll 委托 service.findAll，并传入 userId 与 q', async () => {\n    service.findAll.mockResolvedValue([mockEntity] as never);\n    await expect(controller.findAll(mockUser as any)).resolves.toEqual([mockEntity]);\n    expect(service.findAll).toHaveBeenCalledWith(1, undefined);\n  });\n\n  it('findAll 把 q 原样交给 service —— 过滤由它施加', async () => {\n    service.findAll.mockResolvedValue([] as never);\n    await controller.findAll(mockUser as any, 'term');\n    expect(service.findAll).toHaveBeenCalledWith(1, 'term');\n  });`;
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

${findAllCase}

  it('findAllForAdmin 委托 service.findAllForAdmin（管理端全量）', async () => {
    service.findAllForAdmin.mockResolvedValue([mockEntity] as never);
    await expect(controller.findAllForAdmin()).resolves.toEqual([mockEntity]);
    expect(service.findAllForAdmin).toHaveBeenCalled();
  });

  it('update 委托 service.update 并传入 ability${scoped ? ' 与 userId' : ''}', async () => {
    service.update.mockResolvedValue(mockEntity as never);
    const dto = {};
    await expect(controller.update(1, dto as any, mockUser as any, mockAbility)).resolves.toBe(mockEntity);
    expect(service.update).toHaveBeenCalledWith(1, dto, mockAbility${scoped ? ', 1' : ''});
  });

  it('remove 委托 service.remove 并返回 null', async () => {
    service.remove.mockResolvedValue(undefined as never);
    await expect(controller.remove(1, mockUser as any, mockAbility)).resolves.toBeNull();
    expect(service.remove).toHaveBeenCalledWith(1, mockAbility${scoped ? ', 1' : ''});
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
  // 参与范围（协议 scope 声明）时，本 spec 多钉三条：创建盖章、成员看得到同组织、无组织退回本人。
  // 行级判定也换了口径（CASL 之外还要看数据范围），故「禁止访问」用的行必须是**范围外**的那一行。
  //
  // With a protocol `scope` declaration the spec pins three more things — the stamp on create, a
  // member seeing same-organisation rows, and a non-member falling back to their own — and the
  // "forbidden" cases must use a row that is genuinely out of scope, since row-level access is no
  // longer CASL's answer alone.
  const scoped = (ctx.scope ?? []).includes('org');
  const orgImport = scoped ? `import { OrgService } from '../org/org.service';\n` : '';
  const orgMock = scoped ? `  const mockOrg = { getUserOrgContext: jest.fn() };\n` : '';
  const orgProvider = scoped ? `,\n        { provide: OrgService, useValue: mockOrg }` : '';
  const abilityMock = scoped
    ? `  const mockAbility = (allowed: boolean) => ({ can: () => allowed, cannot: () => !allowed }) as any;`
    : `  const mockAbility = (allowed: boolean) => ({ cannot: () => !allowed }) as any;`;
  /** Row that must be refused for this caller: out of scope when scoped, plain owner-mismatch otherwise. */
  /* 必须被拒的那一行：参与范围时取范围外，否则即普通的归属不符。 */
  const foreignRow = scoped ? `{ id: 1, userId: 6 }` : `{ id: 1, userId: 5 }`;
  const uid = scoped ? ', 5' : '';
  const listWhere = scoped ? `[{ userId: 5 }]` : `{ userId: 5 }`;
  const scopeTests = scoped
    ? `
  it("stamps the creator's organisation and department", async () => {
    mockOrg.getUserOrgContext.mockResolvedValue({ orgId: 7, deptId: 9 });

    await service.create({} as any, 5);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 5, orgId: 7${
        (ctx.scope ?? []).includes('dept') ? ', deptId: 9' : ''
      } }),
    );${
      (ctx.scope ?? []).includes('dept')
        ? ''
        : `
    // 只声明 org ⇒ 实体没有 dept_id 列，就不该往 create 里塞这个键（TypeORM 会把它当成一个
    // 不存在的属性）。这条断言钉住的是「声明了什么才盖什么」，而不是「一律照盖」。
    //
    // Declaring only \`org\` means the entity has no dept_id column, so the key must not be handed to
    // create() — TypeORM would treat it as a property that does not exist. This pins "stamp what was
    // declared", not "stamp everything".
    expect(mockRepo.create.mock.calls[0][0]).not.toHaveProperty('deptId');`
    }
  });

  it("a member sees their own rows or their organisation's", async () => {
    mockOrg.getUserOrgContext.mockResolvedValue({ orgId: 7, deptId: null });
    mockRepo.find.mockResolvedValue([]);

    await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(
      expect.objectContaining({ where: [{ userId: 5 }, { orgId: 7 }] }),
    );
  });

  it('no organisation ⇒ own rows only, never wider', async () => {
    mockOrg.getUserOrgContext.mockResolvedValue(null);
    mockRepo.find.mockResolvedValue([]);

    await service.findAll(5);

    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: [{ userId: 5 }] }));
  });
`
    : '';
  return `import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException, ConflictException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';
import { Update${ctx.singlePascal}Dto } from './dto/update-${ctx.singular}.dto';
${orgImport}
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
${orgMock}
  ${abilityMock}

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ${ctx.pluralPascal}Service,
        { provide: getRepositoryToken(${ctx.singlePascal}), useValue: mockRepo }${orgProvider},
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

    expect(mockRepo.find).toHaveBeenCalledWith(expect.objectContaining({ where: ${listWhere} }));
    expect(result).toHaveLength(1);
  });${scopeTests}

  it('throws when CASL forbids access', async () => {
    mockRepo.findOne.mockResolvedValue(${foreignRow});

    await expect(service.findOne(1, mockAbility(false)${uid})).rejects.toThrow(ForbiddenException);
  });

  it('throws NotFound when missing', async () => {
    mockRepo.findOne.mockResolvedValue(null);

    await expect(service.findOne(1, mockAbility(true)${uid})).rejects.toThrow(NotFoundException);
  });
${
  scoped
    ? `
  it('无 userId 时拒绝（fail-closed，列表与明细同口径）', async () => {
    // 模拟 TS 看不见的调用方：身份缺席必须拒绝，且在触碰仓储之前
    await expect((service.findAll as any)(undefined)).rejects.toThrow(ForbiddenException);
    await expect((service.findOne as any)(1, mockAbility(true), undefined)).rejects.toThrow(
      ForbiddenException,
    );
    expect(mockRepo.find).not.toHaveBeenCalled();
    expect(mockRepo.findOne).not.toHaveBeenCalled();
  });
`
    : ''
}
  it('refuses a stale update with 409 instead of overwriting silently', async () => {
    // The caller read version 2 while the row has moved to 3, so the conditional update matches
    // nothing. Zero rows affected is the conflict — the update must have carried the version.
    //
    // 调用方读到版本 2，而行已走到 3，于是条件更新一条也没匹配上。「影响 0 行」即冲突 ——
    // 前提是那条更新确实把版本带进了条件。
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 3 });
    mockRepo.update.mockResolvedValue({ affected: 0 });

    await expect(
      service.update(1, { version: 2 } as Update${ctx.singlePascal}Dto, mockAbility(true)${uid}),
    ).rejects.toThrow(ConflictException);
    expect(mockRepo.update).toHaveBeenCalledWith(
      { id: 1, version: 2 },
      expect.objectContaining({ version: expect.any(Function) }),
    );
  });

  it('a matching version writes once and answers with the fresh row', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5, version: 2 });
    mockRepo.update.mockResolvedValue({ affected: 1 });

    await service.update(1, { version: 2 } as Update${ctx.singlePascal}Dto, mockAbility(true)${uid});

    expect(mockRepo.update).toHaveBeenCalledTimes(1);
  });

  it('soft-deletes', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true)${uid});

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });

  it('does not soft-delete when CASL forbids (remove)', async () => {
    mockRepo.findOne.mockResolvedValue(${foreignRow});

    await expect(service.remove(1, mockAbility(false)${uid})).rejects.toThrow(ForbiddenException);

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
