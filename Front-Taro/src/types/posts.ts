// SPDX-License-Identifier: Apache-2.0

export interface PostItem {
  id: number
  title: string
  content: string
  createdAt: string
}

export interface CreatePostRequest {
  title: string;
  content: string;
}
