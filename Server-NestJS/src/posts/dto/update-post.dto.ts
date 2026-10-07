// SPDX-License-Identifier: Apache-2.0

import { PartialType } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { CreatePostDto } from './create-post.dto';

export class UpdatePostDto extends PartialType(CreatePostDto) {
  /**
   * The version the caller read. Required, and that is the point: were it optional an update could
   * omit it, the check would run against the row the service just loaded, and it would pass every
   * time — protecting no one while looking like it protects.
   *
   * 调用方读到的版本号，**必填**；必填正是要点：若可选，调用方就能不传，校验会拿服务刚读到的
   * 那一行去比 —— 每次都通过，看着像在保护，其实谁也保护不了。
   */
  @IsInt()
  @Min(1)
  version!: number;
}
