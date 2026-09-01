// SPDX-License-Identifier: Apache-2.0

export interface TagItem {
  id: number
  name: string
  createdAt: string
}

export interface CreateTagRequest {
  name: string;
}
