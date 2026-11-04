// SPDX-License-Identifier: Apache-2.0

import { SetMetadata } from '@nestjs/common';
import type { OrderingDeclaration } from '../../governance-shared/services/ordering';

/**
 * Attaches the ordering declaration to the **response** rather than to a document elsewhere: the
 * interceptor emits it in the envelope, so whoever receives a page also receives the statement of what
 * order produced it. A reader holding rows cannot otherwise tell a timeline from an arbitrary page.
 *
 * 把排序声明挂到**响应**上，而不是写在别处的文档里：拦截器会把它放进信封，于是拿到某一页的人也拿到
 * 「这一页是按什么顺序产生的」。否则拿着行的读者分不出这是时间线还是一页任意结果。
 */
export const RESPONSE_ORDERING_KEY = 'keelbase:response-ordering';

export const ResponseOrdering = (declaration: OrderingDeclaration) =>
  SetMetadata(RESPONSE_ORDERING_KEY, declaration);
