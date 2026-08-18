export interface ContractItem {
  id: number
  name: string
  counterparty: string
  status: string
  amount?: number
  createdAt: string
}

export interface CreateContractRequest {
  name: string;
  counterparty: string;
  status: string;
  amount?: number;
}
