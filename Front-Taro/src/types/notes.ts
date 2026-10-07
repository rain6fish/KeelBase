// SPDX-License-Identifier: Apache-2.0

export interface NoteItem {
  id: number
  title: string
  content: string
  category: string
  createdAt: string
}

export interface CreateNoteRequest {
  title: string;
  content: string;
  category: string;
}
