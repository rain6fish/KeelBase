export interface SupplierItem {
  id: number
  name: string
  contact: string
  status: string
  riskLevel: string
  annualSpend?: number
  createdAt: string
}

export interface CreateSupplierRequest {
  name: string;
  contact: string;
  status: string;
  riskLevel: string;
  annualSpend?: number;
}
