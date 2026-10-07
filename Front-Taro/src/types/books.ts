// SPDX-License-Identifier: Apache-2.0

export interface BookItem {
  id: number
  title: string
  author: string
  status: string
  rating?: number
  createdAt: string
}

export interface CreateBookRequest {
  title: string;
  author: string;
  status: string;
  rating?: number;
}
