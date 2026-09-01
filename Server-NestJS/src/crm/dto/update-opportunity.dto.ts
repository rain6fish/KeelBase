// SPDX-License-Identifier: Apache-2.0

import { PartialType } from '@nestjs/swagger';
import { CreateOpportunityDto } from './create-opportunity.dto';

/** Customer 360：更新销售机会（部分更新，PATCH 可只传改的字段） */
export class UpdateOpportunityDto extends PartialType(CreateOpportunityDto) {}
