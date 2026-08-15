import { Box, IconButton, List, ListItemButton, ListItemText } from '@mui/material'
import AddIcon from '@mui/icons-material/Add'
import EditOutlinedIcon from '@mui/icons-material/EditOutlined'
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline'
import { useTranslation } from 'react-i18next'
import type { DeptTreeNode } from '@/types/org'

interface OrgDeptTreeProps {
  node: DeptTreeNode
  selectedId: number | null
  /** 只读模式：隐藏增删改按钮（工作台通讯录用） */
  readonly?: boolean
  onSelect: (id: number) => void
  onAdd: (parentId: number) => void
  onRename: (id: number) => void
  onRemove: (id: number) => void
}

export function OrgDeptTree({ node, selectedId, readonly, onSelect, onAdd, onRename, onRemove }: OrgDeptTreeProps) {
  const { t } = useTranslation()
  return (
    <Box>
      <ListItemButton
        selected={selectedId === node.id}
        onClick={() => onSelect(node.id)}
        sx={{ py: 0.5, minHeight: 36 }}
      >
        <ListItemText primary={node.name} primaryTypographyProps={{ fontSize: 14 }} />
        {!readonly ? (
          <Box sx={{ display: 'flex', gap: 0 }}>
            <IconButton size="small" title={t('deptAdd')} onClick={(e) => { e.stopPropagation(); onAdd(node.id) }}>
              <AddIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" title={t('edit')} onClick={(e) => { e.stopPropagation(); onRename(node.id) }}>
              <EditOutlinedIcon fontSize="small" />
            </IconButton>
            <IconButton size="small" color="error" title={t('delete')} onClick={(e) => { e.stopPropagation(); onRemove(node.id) }}>
              <DeleteOutlineIcon fontSize="small" />
            </IconButton>
          </Box>
        ) : null}
      </ListItemButton>
      {node.children.length ? (
        <List dense sx={{ pl: 2, pt: 0 }}>
          {node.children.map((c) => (
            <OrgDeptTree key={c.id} node={c} selectedId={selectedId} readonly={readonly} onSelect={onSelect} onAdd={onAdd} onRename={onRename} onRemove={onRemove} />
          ))}
        </List>
      ) : null}
    </Box>
  )
}
