import { PartialType } from '@nestjs/swagger';
import { CreateContactDto } from './create-contact.dto';

/** Customer 360：更新联系人（部分更新，PATCH 可只传改的字段） */
export class UpdateContactDto extends PartialType(CreateContactDto) {}
