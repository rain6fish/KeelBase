// SPDX-License-Identifier: Apache-2.0

import type { EventItem } from './event'
import type { UserItem } from './user'

export interface SearchResult {
  events: { items: EventItem[]; total: number }
  users: { items: UserItem[]; total: number }
}
