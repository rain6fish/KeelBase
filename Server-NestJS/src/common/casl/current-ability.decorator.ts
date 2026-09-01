// SPDX-License-Identifier: Apache-2.0

import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { AppAbility } from './casl-ability.factory';

export const CurrentAbility = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): AppAbility => {
    return ctx.switchToHttp().getRequest().ability;
  },
);
