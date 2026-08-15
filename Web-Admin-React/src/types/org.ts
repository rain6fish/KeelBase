export type OrgMemberRole = 'owner' | 'admin' | 'member'

export interface Organization {
  id: number
  name: string
  description?: string
  createdAt: string
  memberCount?: number
  deptCount?: number
}

export interface Department {
  id: number
  orgId: number
  name: string
  parentId?: number | null
  sortOrder?: number
}

export interface OrgMember {
  id: number
  orgId: number
  userId: number
  deptId?: number | null
  deptName?: string | null
  role: OrgMemberRole
  username?: string | null
  nickname?: string | null
  avatarUrl?: string | null
  email?: string | null
}

export interface OrgInvite {
  id: number
  code: string
  orgId: number
  inviterId: number
  role: OrgMemberRole
  deptId?: number | null
  expiresAt?: string | null
  usedBy?: number | null
  usedAt?: string | null
  createdAt: string
}

export interface DeptTreeNode {
  id: number
  name: string
  parentId?: number | null
  memberCount?: number
  children: DeptTreeNode[]
}

export interface MyOrgInfo {
  org: { id: number; name: string; description?: string }
  role: OrgMemberRole
  deptId?: number | null
  deptPath: string[]
}

export interface MyMember {
  id: number
  nickname?: string | null
  avatarUrl?: string | null
  role: OrgMemberRole
  deptName?: string | null
}
