import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { CrmService } from './crm.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/create-customer.dto';
import { CreateOrderDto } from './dto/create-order.dto';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateTaskDto } from './dto/create-task.dto';
import { CreateRiskDto } from './dto/create-risk.dto';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { CurrentAbility } from '../common/casl/current-ability.decorator';
import { FeatureFlag } from '../feature-flags/feature-flag.decorator';
import type { JwtPayload } from '../auth/interfaces/jwt-payload.interface';
import type { AppAbility } from '../common/casl/casl-ability.factory';

/** AI CRM 旗舰应用：客户 / 订单 / 跟进 / 任务 / 风险 */
@ApiTags('AI CRM')
@ApiBearerAuth()
@FeatureFlag('crm')
@Controller({ path: 'crm', version: '1' })
export class CrmController {
  constructor(private readonly crmService: CrmService) {}

  // ── Customer ──────────────────────────────────────────────

  @Post('customers')
  @ApiOperation({ summary: '创建客户' })
  createCustomer(@Body() dto: CreateCustomerDto, @CurrentUser() user: JwtPayload) {
    return this.crmService.createCustomer(dto, user.sub);
  }

  @Get('customers')
  @ApiOperation({ summary: '客户列表（分页 + 状态/风险/关键词筛选）' })
  listCustomers(
    @CurrentUser() user: JwtPayload,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: string,
    @Query('riskLevel') riskLevel?: string,
    @Query('keyword') keyword?: string,
  ) {
    return this.crmService.listCustomers(user.sub, { page, limit, status, riskLevel, keyword });
  }

  @Get('customers/:id')
  @ApiOperation({ summary: '客户详情（含订单/跟进/任务/风险）' })
  getCustomerDetail(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.crmService.getCustomerDetail(id, ability);
  }

  @Patch('customers/:id')
  @ApiOperation({ summary: '更新客户' })
  updateCustomer(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCustomerDto,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    return this.crmService.updateCustomer(id, dto, ability);
  }

  @Delete('customers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '删除客户（软删）' })
  async removeCustomer(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() _user: JwtPayload,
    @CurrentAbility() ability: AppAbility,
  ) {
    await this.crmService.removeCustomer(id, ability);
    return null;
  }

  @Get('customers/:id/analyze')
  @ApiOperation({ summary: '客户风险分析（逾期订单/任务/未解决风险）' })
  analyze(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.analyzeRisk(id, user.sub);
  }

  // ── 子资源（订单 / 跟进 / 任务 / 风险）─────────────────────

  @Get('customers/:id/orders')
  @ApiOperation({ summary: '客户订单列表' })
  listOrders(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.crmService.listOrders(id, user.sub);
  }

  @Post('customers/:id/orders')
  @ApiOperation({ summary: '创建客户订单' })
  createOrder(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOrderDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.createOrder(id, dto, user.sub);
  }

  // ── Customer 360：销售机会（P0 §10）────────────────────

  @Get('customers/:id/opportunities')
  @ApiOperation({ summary: '客户销售机会列表（Customer 360）' })
  listOpportunities(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.crmService.listOpportunities(id, user.sub);
  }

  @Post('customers/:id/opportunities')
  @ApiOperation({ summary: '创建客户销售机会' })
  createOpportunity(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateOpportunityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.createOpportunity(id, dto, user.sub);
  }

  @Patch('customers/:id/opportunities/:oppId')
  @ApiOperation({ summary: '更新客户销售机会' })
  updateOpportunity(
    @Param('id', ParseIntPipe) id: number,
    @Param('oppId', ParseIntPipe) oppId: number,
    @Body() dto: UpdateOpportunityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.updateOpportunity(id, oppId, dto, user.sub);
  }

  @Delete('customers/:id/opportunities/:oppId')
  @ApiOperation({ summary: '删除客户销售机会' })
  removeOpportunity(
    @Param('id', ParseIntPipe) id: number,
    @Param('oppId', ParseIntPipe) oppId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.removeOpportunity(id, oppId, user.sub);
  }

  // ── Customer 360：联系人（P0 §10）────────────────────

  @Get('customers/:id/contacts')
  @ApiOperation({ summary: '客户联系人列表（Customer 360）' })
  listContacts(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.crmService.listContacts(id, user.sub);
  }

  @Post('customers/:id/contacts')
  @ApiOperation({ summary: '创建客户联系人' })
  createContact(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateContactDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.createContact(id, dto, user.sub);
  }

  @Patch('customers/:id/contacts/:contactId')
  @ApiOperation({ summary: '更新客户联系人' })
  updateContact(
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.updateContact(id, contactId, dto, user.sub);
  }

  @Delete('customers/:id/contacts/:contactId')
  @ApiOperation({ summary: '删除客户联系人' })
  removeContact(
    @Param('id', ParseIntPipe) id: number,
    @Param('contactId', ParseIntPipe) contactId: number,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.removeContact(id, contactId, user.sub);
  }

  @Get('customers/:id/activities')
  @ApiOperation({ summary: '客户跟进记录列表' })
  listActivities(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.crmService.listActivities(id, user.sub);
  }

  @Post('customers/:id/activities')
  @ApiOperation({ summary: '创建跟进记录' })
  createActivity(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateActivityDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.createActivity(id, dto, user.sub);
  }

  @Get('customers/:id/tasks')
  @ApiOperation({ summary: '客户任务列表' })
  listTasks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.crmService.listTasks(user.sub, id);
  }

  @Get('tasks')
  @ApiOperation({ summary: '我的跟进任务列表' })
  listMyTasks(@CurrentUser() user: JwtPayload) {
    return this.crmService.listTasks(user.sub);
  }

  @Post('tasks')
  @ApiOperation({ summary: '创建跟进任务' })
  createTask(@Body() dto: CreateTaskDto, @CurrentUser() user: JwtPayload) {
    return this.crmService.createTask(dto, user.sub);
  }

  @Post('tasks/:id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: '完成任务' })
  completeTask(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.crmService.completeTask(id, user.sub);
  }

  @Get('customers/:id/risks')
  @ApiOperation({ summary: '客户风险记录列表' })
  listRisks(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: JwtPayload) {
    return this.crmService.listRisks(id, user.sub);
  }

  @Post('customers/:id/risks')
  @ApiOperation({ summary: '创建风险记录' })
  createRisk(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRiskDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.crmService.createRisk(id, dto, user.sub);
  }
}
