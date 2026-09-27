// SPDX-License-Identifier: Apache-2.0

export interface ReportItem {
  id: number
  title: string
  summary: string
  status: string
  amount?: number
  createdAt: string
}

export interface CreateReportRequest {
  title: string;
  summary: string;
  status: string;
  amount?: number;
}
