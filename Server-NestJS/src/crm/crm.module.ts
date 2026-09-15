// SPDX-License-Identifier: Apache-2.0

import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';
import { CrmCustomer } from './crm-customer.entity';
import { CrmOrder } from './crm-order.entity';
import { CrmActivity } from './crm-activity.entity';
import { CrmTask } from './crm-task.entity';
import { CrmRisk } from './crm-risk.entity';
import { CrmOpportunity } from './crm-opportunity.entity';
import { CrmContact } from './crm-contact.entity';
import { OrgModule } from '../org/org.module';

/** AI CRM 旗舰应用模块（业务样例，capabilities 可开关） */
@Module({
  imports: [
    TypeOrmModule.forFeature([CrmCustomer, CrmOrder, CrmActivity, CrmTask, CrmRisk, CrmOpportunity, CrmContact]),
    forwardRef(() => OrgModule), // org→flows→ai→auth 间接环：须 forwardRef
  ],
  controllers: [CrmController],
  providers: [CrmService],
  exports: [CrmService],
})
export class CrmModule {}
