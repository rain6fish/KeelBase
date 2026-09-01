// SPDX-License-Identifier: Apache-2.0

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { FormSchema } from './form-schema.entity';
import { FormSubmission } from './form-submission.entity';
import { FormBuilderService } from './form-builder.service';
import { FormBuilderController } from './form-builder.controller';
import { FormBuilderAdminController } from './form-builder-admin.controller';

@Module({
  imports: [TypeOrmModule.forFeature([FormSchema, FormSubmission])],
  controllers: [FormBuilderController, FormBuilderAdminController],
  providers: [FormBuilderService],
  exports: [FormBuilderService],
})
export class FormBuilderModule {}
