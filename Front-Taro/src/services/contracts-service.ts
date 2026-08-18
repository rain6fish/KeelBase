import { api } from './api-client'
import type { ContractItem, CreateContractRequest } from '../types/contracts'

export const contractsService = {
  getContracts(): Promise<ContractItem[]> {
    return api.get<ContractItem[]>('/contracts').then((res) => res.data || [])
  },

  create(dto: CreateContractRequest): Promise<ContractItem> {
    return api.post<ContractItem>('/contracts', dto).then((res) => res.data!)
  },

  remove(id: number): Promise<void> {
    return api.delete(`/contracts/${id}`).then(() => {})
  },
}
