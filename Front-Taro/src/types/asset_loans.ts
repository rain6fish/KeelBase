// SPDX-License-Identifier: Apache-2.0

export interface AssetLoanItem {
  id: number
  assetName: string
  assetTag: string
  purpose: string
  dueDate?: string
  status: string
  createdAt: string
}

export interface CreateAssetLoanRequest {
  assetName: string;
  assetTag: string;
  purpose: string;
  dueDate?: string;
  status: string;
}
