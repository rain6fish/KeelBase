import { describe, expect, it } from 'vitest'
import { buildDeptTree, collectDescendantIds } from '../orgTree'
import type { Department } from '@/types/org'

const flat: Department[] = [
  { id: 1, orgId: 1, name: '总部' },
  { id: 2, orgId: 1, name: '研发部', parentId: 1 },
  { id: 3, orgId: 1, name: '前端组', parentId: 2 },
  { id: 4, orgId: 1, name: '销售部', parentId: 1 },
  { id: 5, orgId: 1, name: '独立组' }, // parentId 缺失 → 根
]

describe('buildDeptTree 部门树构建', () => {
  it('扁平列表 → 嵌套树（根 = parentId 空或父不在列表）', () => {
    const tree = buildDeptTree(flat)
    expect(tree.map((n) => n.id)).toEqual([1, 5])
    expect(tree[0].children.map((n) => n.id)).toEqual([2, 4])
    expect(tree[0].children[0].children.map((n) => n.id)).toEqual([3])
  })

  it('空列表 → 空树', () => {
    expect(buildDeptTree([])).toEqual([])
  })

  it('父 id 指向不存在的节点 → 视为根', () => {
    const tree = buildDeptTree([{ id: 1, orgId: 1, name: 'a', parentId: 999 }])
    expect(tree.map((n) => n.id)).toEqual([1])
  })
})

describe('collectDescendantIds 子孙收集', () => {
  it('收集节点自身 + 全部子孙', () => {
    const tree = buildDeptTree(flat)
    const ids = collectDescendantIds(tree[0])
    expect(ids).toEqual([1, 2, 3, 4])
  })
})
