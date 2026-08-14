import { Controller, Get, Post, Patch, Delete, Body, Param, HttpCode, HttpStatus, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './dto/create-note.dto';
import { UpdateNoteDto } from './dto/update-note.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

@ApiTags('笔记')
@ApiBearerAuth()
@FeatureFlag('notes')
@Controller({ path: 'notes', version: '1' })
export class NotesController {
  constructor(private readonly notesService: NotesService) {}

  // 管理端：全量列表（admin，供 Web-Admin 管理页）
  @Get('admin/all')
  @ApiOperation({ summary: '管理端：全量笔记列表' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async findAllForAdmin() {
    return this.notesService.findAllForAdmin();
  }

  // 管理端：删除任意（admin，软删进回收站）
  @Delete('admin/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '管理端：删除任意笔记' })
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  async removeAsAdmin(@Param('id', ParseIntPipe) id: number) {
    await this.notesService.removeAsAdmin(id);
    return null;
  }

  @Post()
  @ApiOperation({ summary: '创建笔记' })
  async create(@Body() dto: CreateNoteDto, @CurrentUser() user: JwtPayload) {
    return this.notesService.create(dto, user.sub);
  }

  @Get()
  @ApiOperation({ summary: '获取我的笔记列表' })
  async findAll(@CurrentUser() user: JwtPayload) {
    return this.notesService.findAll(user.sub);
  }

  @Patch(':id')
  @ApiOperation({ summary: '更新笔记' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateNoteDto,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.notesService.update(id, dto, ability);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除笔记' })
  async remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.notesService.remove(id, ability);
    return null;
  }
}
