// SPDX-License-Identifier: Apache-2.0

 import { api } from './api-client'
 import type { UserItem } from '../types/user'
 
 export const usersService = {
   getUsers(page: number = 1, limit: number = 20): Promise<{ items: UserItem[]; total: number }> {
     return api
       .get<{ items: UserItem[]; total: number }>('/users', { page, limit })
       .then((res) => res.data!)
   },
 
   getUser(id: number): Promise<UserItem> {
     return api.get<UserItem>(`/users/${id}`).then((res) => res.data!)
   },
 }
