// SPDX-License-Identifier: Apache-2.0

import { IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import type { FlowDefinition } from '../flow-definition.types';

export class SaveFlowDefinitionDto {
  @ApiProperty({ description: '流程定义（经 POST /flows/ai/generate 生成并确认）' })
  @IsObject()
  definition!: FlowDefinition;
}
