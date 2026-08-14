import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  HttpCode,
  HttpStatus,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { OrgService } from './org.service';
import { CreateOrganizationDto } from './dto/create-organization.dto';
import { UpdateOrganizationDto } from './dto/update-organization.dto';
import { CreateDepartmentDto } from './dto/create-department.dto';
import { UpdateDepartmentDto } from './dto/update-department.dto';
import { AddMemberDto } from './dto/add-member.dto';
import { UpdateMemberDto } from './dto/update-member.dto';
import { CheckPolicies } from '../common/casl/check-policies.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';

@ApiTags('组织架构')
@ApiBearerAuth()
@FeatureFlag('org')
@Controller({ path: 'org', version: '1' })
export class OrgController {
  constructor(private orgService: OrgService) {}

  // ── 组织（管理端） ──

  @Post('organizations')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '创建组织' })
  createOrganization(@Body() dto: CreateOrganizationDto, @CurrentUser() user: JwtPayload) {
    return this.orgService.createOrganization(dto, user.sub);
  }

  @Get('organizations')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '组织列表（含成员/部门数）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'keyword', required: false })
  listOrganizations(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
  ) {
    return this.orgService.findAllOrganizations(page, limit, keyword);
  }

  @Get('organizations/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '组织详情' })
  getOrganization(@Param('id', ParseIntPipe) id: number) {
    return this.orgService.findOrganization(id);
  }

  @Put('organizations/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '更新组织' })
  updateOrganization(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateOrganizationDto) {
    return this.orgService.updateOrganization(id, dto);
  }

  @Delete('organizations/:id')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '删除组织（有成员时拒绝）' })
  async removeOrganization(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.removeOrganization(id);
    return null;
  }

  // ── 部门（管理端） ──

  @Post('organizations/:orgId/departments')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '创建部门' })
  createDepartment(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Body() dto: CreateDepartmentDto,
  ) {
    return this.orgService.createDepartment(orgId, dto);
  }

  @Get('organizations/:orgId/departments')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '部门扁平列表（含 parentId，前端组树）' })
  listDepartments(@Param('orgId', ParseIntPipe) orgId: number) {
    return this.orgService.listDepartments(orgId);
  }

  @Put('departments/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '更新部门（改名/移动上级，防环）' })
  updateDepartment(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateDepartmentDto) {
    return this.orgService.updateDepartment(id, dto);
  }

  @Delete('departments/:id')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '删除部门（子孙挂父级，成员脱离）' })
  async removeDepartment(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.removeDepartment(id);
    return null;
  }

  // ── 成员（管理端） ──

  @Get('organizations/:orgId/members')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '成员列表（脱敏）' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'keyword', required: false })
  @ApiQuery({ name: 'deptId', required: false })
  listMembers(
    @Param('orgId', ParseIntPipe) orgId: number,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('keyword') keyword?: string,
    @Query('deptId') deptIdRaw?: string,
  ) {
    return this.orgService.listMembers(
      orgId,
      page,
      limit,
      keyword,
      deptIdRaw ? Number(deptIdRaw) : undefined,
    );
  }

  @Post('organizations/:orgId/members')
  @HttpCode(HttpStatus.CREATED)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '添加成员' })
  addMember(@Param('orgId', ParseIntPipe) orgId: number, @Body() dto: AddMemberDto) {
    return this.orgService.addMember(orgId, dto);
  }

  @Put('members/:id')
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '更新成员（改角色/移部门，最后 owner 保护）' })
  updateMember(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateMemberDto) {
    return this.orgService.updateMember(id, dto);
  }

  @Delete('members/:id')
  @HttpCode(HttpStatus.OK)
  @CheckPolicies((ability) => ability.can('manage', 'all'))
  @ApiOperation({ summary: '移除成员（最后 owner 拒绝）' })
  async removeMember(@Param('id', ParseIntPipe) id: number) {
    await this.orgService.removeMember(id);
    return null;
  }
}
