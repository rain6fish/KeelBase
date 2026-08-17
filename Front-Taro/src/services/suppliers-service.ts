import { api } from './api-client'
import type { SupplierItem, CreateSupplierRequest } from '../types/suppliers'

export const suppliersService = {
  getSuppliers(): Promise<SupplierItem[]> {
    return api.get<SupplierItem[]>('/suppliers').then((res) => res.data || [])
  },

  create(dto: CreateSupplierRequest): Promise<SupplierItem> {
    return api.post<SupplierItem>('/suppliers', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/suppliers/${id}`).then(() => {})
  },
}
