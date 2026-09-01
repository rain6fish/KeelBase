// SPDX-License-Identifier: Apache-2.0

import { PartialType } from '@nestjs/swagger';
import { CreateNoteDto } from './create-note.dto';

export class UpdateNoteDto extends PartialType(CreateNoteDto) {}
