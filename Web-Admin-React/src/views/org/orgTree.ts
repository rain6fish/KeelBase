// SPDX-License-Identifier: Apache-2.0

import type { Department, DeptTreeNode } from '@/types/org'

/** 扁平部门列表 → 嵌套树（根 = parentId 为 null 或父不在列表中） */
export function buildDeptTree(departments: Department[]): DeptTreeNode[] {
  const map = new Map<number, DeptTreeNode>()
  for (const d of departments) {
    map.set(d.id, { id: d.id, name: d.name, parentId: d.parentId ?? null, memberCount: 0, children: [] })
  }
  const roots: DeptTreeNode[] = []
  for (const d of departments) {
    const node = map.get(d.id)!
    const parent = d.parentId != null ? map.get(d.parentId) : undefined
    if (parent) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

/** 收集树中全部节点 id（含子孙），用于部门移动防环提示等 */
export function collectDescendantIds(node: DeptTreeNode, acc: number[] = []): number[] {
  acc.push(node.id)
  for (const c of node.children) collectDescendantIds(c, acc)
  return acc
}

/** 全树 DFS 查找指定 id 的节点（任意深度），用于防环：定位 self 后排除其子孙 */
export function findDeptNode(nodes: DeptTreeNode[], id: number): DeptTreeNode | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findDeptNode(n.children, id)
    if (found) return found
  }
  return null
}
