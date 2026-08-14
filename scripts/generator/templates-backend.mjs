/**
 * EASY-2 后端模板：按 todos 模块约定生成 7 个文件。
 * 每个函数接收 buildContext 的 ctx，返回文件内容字符串。
 */

const FIELD_COLUMNS = {
  string: (c) => `  @Column({ length: 200 })\n  ${c}!: string;`,
  text: (c) => `  @Column({ type: 'text', nullable: true })\n  ${c}?: string | null;`,
  int: (c) => `  @Column({ nullable: true })\n  ${c}?: number;`,
  bool: (c) => `  @Column({ default: false })\n  ${c}!: boolean;`,
  date: (c) => `  @Column({ type: Date, nullable: true })\n  ${c}?: Date | null;`,
};

const FIELD_DTO_PROPS = {
  string: (c) =>
    `  @ApiProperty({ description: '${c}' })\n  @IsString()\n  @MinLength(1)\n  @MaxLength(200)\n  ${c}!: string;`,
  text: (c) =>
    `  @ApiPropertyOptional({ description: '${c}' })\n  @IsString()\n  @IsOptional()\n  ${c}?: string;`,
  int: (c) =>
    `  @ApiPropertyOptional({ description: '${c}' })\n  @IsInt()\n  @IsOptional()\n  ${c}?: number;`,
  bool: (c) =>
    `  @ApiPropertyOptional({ description: '${c}' })\n  @IsBoolean()\n  @IsOptional()\n  ${c}?: boolean;`,
  date: (c) =>
    `  @ApiPropertyOptional({ description: '${c}' })\n  @IsDateString()\n  @IsOptional()\n  ${c}?: string;`,
};

export function entityTemplate(ctx) {
  const fieldCols = ctx.fields.map((f) => FIELD_COLUMNS[f.type](f.name)).join('\n\n');
  return `import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  Index,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
} from 'typeorm';

@Entity('${ctx.plural}')
@Index(['userId'])
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

  /** RG-3 软删除：删除后仍保留行，管理台回收站可恢复 */
  @DeleteDateColumn({ type: Date, name: 'deleted_at' })
  deletedAt?: Date | null;
}
`;
}

export function createDtoTemplate(ctx) {
  const props = ctx.fields.map((f) => FIELD_DTO_PROPS[f.type](f.name)).join('\n\n');
  return `import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, MinLength, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class Create${ctx.singlePascal}Dto {
${props}
}
`;
}

export function updateDtoTemplate(ctx) {
  return `import { PartialType } from '@nestjs/swagger';
import { Create${ctx.singlePascal}Dto } from './create-${ctx.singular}.dto';

export class Update${ctx.singlePascal}Dto extends PartialType(Create${ctx.singlePascal}Dto) {}
`;
}

export function serviceTemplate(ctx) {
  return `import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { subject } from '@casl/ability';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';
import { Create${ctx.singlePascal}Dto } from './dto/create-${ctx.singular}.dto';
import { Update${ctx.singlePascal}Dto } from './dto/update-${ctx.singular}.dto';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@Injectable()
export class ${ctx.pluralPascal}Service {
  constructor(
    @InjectRepository(${ctx.singlePascal})
    private readonly ${ctx.plural}Repository: Repository<${ctx.singlePascal}>,
  ) {}

  async create(dto: Create${ctx.singlePascal}Dto, userId: number): Promise<${ctx.singlePascal}> {
    const entity = this.${ctx.plural}Repository.create({
      ...dto,
      userId,
    });
    return this.${ctx.plural}Repository.save(entity);
  }

  async findAll(userId: number): Promise<${ctx.singlePascal}[]> {
    return this.${ctx.plural}Repository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /** 管理端：全量列表（无 userId 过滤，admin） */
  async findAllForAdmin(): Promise<${ctx.singlePascal}[]> {
    return this.${ctx.plural}Repository.find({ order: { createdAt: 'DESC' } });
  }

  /** 管理端：删除任意（软删进回收站，admin） */
  async removeAsAdmin(id: number): Promise<void> {
    await this.${ctx.plural}Repository.softDelete(id);
  }

  async findOne(id: number, ability: AppAbility): Promise<${ctx.singlePascal}> {
    const entity = await this.${ctx.plural}Repository.findOne({ where: { id } });
    if (!entity) throw new NotFoundException('${ctx.singlePascal} not found');
    if (ability.cannot('read', subject('${ctx.singlePascal}', entity))) {
      throw new ForbiddenException('无权访问此${ctx.label}');
    }
    return entity;
  }

  async update(id: number, dto: Update${ctx.singlePascal}Dto, ability: AppAbility): Promise<${ctx.singlePascal}> {
    const entity = await this.findOne(id, ability);
    Object.assign(entity, dto);
    return this.${ctx.plural}Repository.save(entity);
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
  return `import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { Create${ctx.singlePascal}Dto } from './dto/create-${ctx.singular}.dto';
import { Update${ctx.singlePascal}Dto } from './dto/update-${ctx.singular}.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
${flagImport}import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('${ctx.label}')
@ApiBearerAuth()
${flagDecorator}@Controller({ path: '${ctx.plural}', version: '1' })
export class ${ctx.pluralPascal}Controller {
  constructor(private readonly ${ctx.plural}Service: ${ctx.pluralPascal}Service) {}

  // 管理端：全量列表（admin，供 Web-Admin 管理页）
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

  @Post()
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
  return `import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ${ctx.pluralPascal}Controller } from './${ctx.plural}.controller';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';

@Module({
  imports: [TypeOrmModule.forFeature([${ctx.singlePascal}])],
  controllers: [${ctx.pluralPascal}Controller],
  providers: [${ctx.pluralPascal}Service],
  exports: [${ctx.pluralPascal}Service],
})
export class ${ctx.pluralPascal}Module {}
`;
}

export function serviceSpecTemplate(ctx) {
  return `import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, ForbiddenException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ${ctx.pluralPascal}Service } from './${ctx.plural}.service';
import { ${ctx.singlePascal} } from './${ctx.singular}.entity';

describe('${ctx.pluralPascal}Service', () => {
  let service: ${ctx.pluralPascal}Service;
  const mockRepo = {
    create: jest.fn((d: any) => d),
    save: jest.fn((d: any) => Promise.resolve(d)),
    find: jest.fn(),
    findOne: jest.fn(),
    softDelete: jest.fn(),
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

  it('soft-deletes', async () => {
    mockRepo.findOne.mockResolvedValue({ id: 1, userId: 5 });
    mockRepo.softDelete.mockResolvedValue({ affected: 1 });

    await service.remove(1, mockAbility(true));

    expect(mockRepo.softDelete).toHaveBeenCalledWith(1);
  });
});
`;
}

/** 全部后端文件：{ relativePath, content }。 */
export function backendFiles(ctx) {
  return [
    { path: `${ctx.plural}/${ctx.singular}.entity.ts`, content: entityTemplate(ctx) },
    { path: `${ctx.plural}/dto/create-${ctx.singular}.dto.ts`, content: createDtoTemplate(ctx) },
    { path: `${ctx.plural}/dto/update-${ctx.singular}.dto.ts`, content: updateDtoTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.service.ts`, content: serviceTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.controller.ts`, content: controllerTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.module.ts`, content: moduleTemplate(ctx) },
    { path: `${ctx.plural}/${ctx.plural}.service.spec.ts`, content: serviceSpecTemplate(ctx) },
  ];
}
