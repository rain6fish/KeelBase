// SPDX-License-Identifier: Apache-2.0

import { api } from './client'
import type { Paginated } from '@/types/api'
import type {
  Organization,
  Department,
  OrgMember,
  OrgMemberRole,
  OrgInvite,
  DeptTreeNode,
  MyOrgInfo,
  MyMember,
} from '@/types/org'

export const orgApi = {
  // 组织
  listOrganizations(page = 1, limit = 100, keyword?: string): Promise<Paginated<Organization>> {
    return api.get<Paginated<Organization>>('/org/organizations', {
      page,
      limit,
      ...(keyword ? { keyword } : {}),
    })
  },
  createOrganization(data: { name: string; description?: string }): Promise<Organization> {
    return api.post<Organization>('/org/organizations', data)
  },
  updateOrganization(id: number, data: { name?: string; description?: string }): Promise<Organization> {
    return api.put<Organization>(`/org/organizations/${id}`, data)
  },
  removeOrganization(id: number): Promise<null> {
    return api.delete<null>(`/org/organizations/${id}`)
  },
  // 部门
  listDepartments(orgId: number): Promise<Department[]> {
    return api.get<Department[]>(`/org/organizations/${orgId}/departments`)
  },
  createDepartment(orgId: number, data: { name: string; parentId?: number; sortOrder?: number }): Promise<Department> {
    return api.post<Department>(`/org/organizations/${orgId}/departments`, data)
  },
  updateDepartment(id: number, data: { name?: string; parentId?: number | null; sortOrder?: number }): Promise<Department> {
    return api.put<Department>(`/org/departments/${id}`, data)
  },
  removeDepartment(id: number): Promise<null> {
    return api.delete<null>(`/org/departments/${id}`)
  },
  // 成员
  listMembers(orgId: number, page = 1, limit = 20, keyword?: string, deptId?: number): Promise<Paginated<OrgMember>> {
    return api.get<Paginated<OrgMember>>(`/org/organizations/${orgId}/members`, {
      page,
      limit,
      ...(keyword ? { keyword } : {}),
      ...(deptId ? { deptId } : {}),
    })
  },
  addMember(orgId: number, data: { userId: number; role?: OrgMemberRole; deptId?: number }): Promise<OrgMember> {
    return api.post<OrgMember>(`/org/organizations/${orgId}/members`, data)
  },
  updateMember(id: number, data: { role?: OrgMemberRole; deptId?: number | null }): Promise<OrgMember> {
    return api.put<OrgMember>(`/org/members/${id}`, data)
  },
  removeMember(id: number): Promise<null> {
    return api.delete<null>(`/org/members/${id}`)
  },
  // 邀请
  listInvites(orgId: number): Promise<OrgInvite[]> {
    return api.get<OrgInvite[]>(`/org/organizations/${orgId}/invites`)
  },
  createInvite(orgId: number, data: { role?: OrgMemberRole; deptId?: number; expiresAt?: string }): Promise<OrgInvite> {
    return api.post<OrgInvite>(`/org/organizations/${orgId}/invites`, data)
  },
  removeInvite(id: number): Promise<null> {
    return api.delete<null>(`/org/invites/${id}`)
  },
  // 我的（工作台通讯录，只读）
  getMyOrg(): Promise<MyOrgInfo> {
    return api.get<MyOrgInfo>('/org/my')
  },
  getMyTree(): Promise<DeptTreeNode[]> {
    return api.get<DeptTreeNode[]>('/org/my/tree')
  },
  listMyMembers(): Promise<MyMember[]> {
    return api.get<MyMember[]>('/org/my/members')
  },
}
