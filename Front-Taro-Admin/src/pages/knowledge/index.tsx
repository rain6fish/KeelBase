import { useEffect, useState } from 'react'
import { View, Text, Input, Button, Textarea } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminService } from '../../services/admin-service'
import { API_BASE_URL } from '../../utils/constants'
import { useLocaleStore, t } from '../../i18n'
import type { KnowledgeArticle } from '../../types/admin'
import './index.scss'

const emptyForm = { title: '', content: '', category: '' }

function KnowledgePage() {
  const { locale } = useLocaleStore()
  const [items, setItems] = useState<KnowledgeArticle[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [q, setQ] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [editing, setEditing] = useState<KnowledgeArticle | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [uploading, setUploading] = useState(false)
  const limit = 20

  const fetch = async (nextPage = 1) => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const res = await adminService.getKnowledge(nextPage, limit, searchInput.trim() || undefined)
      setItems(res.items)
      setTotal(res.total)
      setPage(nextPage)
      setQ(searchInput)
    } catch (err: any) {
      setErrorMessage(err?.message || t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetch(1)
  }, [locale])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const openCreate = () => {
    setEditing(null)
    setForm(emptyForm)
  }

  const openEdit = (item: KnowledgeArticle) => {
    setEditing(item)
    setForm({ title: item.title, content: item.content, category: item.category || '' })
  }

  const handleSave = async () => {
    if (!form.title.trim() || !form.content.trim()) {
      Taro.showToast({ title: t('titleContentRequired'), icon: 'none' })
      return
    }
    try {
      if (editing) {
        await adminService.updateKnowledge(editing.id, {
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category.trim() || undefined,
        })
      } else {
        await adminService.createKnowledge({
          title: form.title.trim(),
          content: form.content.trim(),
          category: form.category.trim() || undefined,
        })
      }
      Taro.showToast({ title: t('saved'), icon: 'success' })
      setEditing(null)
      setForm(emptyForm)
      fetch(page)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('saveFailed'), icon: 'none' })
    }
  }

  const handleDelete = (item: KnowledgeArticle) => {
    Taro.showModal({
      title: t('deleteArticleTitle'),
      content: t('deleteArticleContent', { title: item.title }),
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await adminService.deleteKnowledge(item.id)
          Taro.showToast({ title: t('deleted'), icon: 'success' })
          fetch(page)
        } catch (err: any) {
          Taro.showToast({ title: err?.message || t('deleteFailed'), icon: 'none' })
        }
      },
    })
  }

  const handleUpload = () => {
    if (uploading) return
    Taro.chooseFile({
      count: 1,
      extension: ['.pdf', '.docx'],
      success: async (res) => {
        const file = res.tempFiles?.[0]
        if (!file) return
        setUploading(true)
        try {
          await adminService.uploadKnowledge(file.path, file.name || file.path)
          Taro.showToast({ title: t('uploadSuccess'), icon: 'success' })
          fetch(1)
        } catch (err: any) {
          Taro.showToast({ title: err?.message || t('uploadFailed'), icon: 'none' })
        } finally {
          setUploading(false)
        }
      },
    })
  }

  const copyFileUrl = (item: KnowledgeArticle) => {
    if (!item.fileUrl) return
    const origin = API_BASE_URL.replace(/\/api\/v1$/, '')
    const url = item.fileUrl.startsWith('http') ? item.fileUrl : `${origin}${item.fileUrl}`
    Taro.setClipboardData({ data: url })
  }

  return (
    <View className='page'>
      <View className='flex-between'>
        <Text className='page__title'>{t('navKnowledge')}</Text>
        <View className='kn__header-actions'>
          <Button
            size='mini'
            onClick={handleUpload}
            loading={uploading}
            disabled={uploading}
          >
            {t('uploadDocument')}
          </Button>
          <Button size='mini' type='primary' onClick={openCreate}>{t('newArticle')}</Button>
        </View>
      </View>

      <View className='kn__toolbar'>
        <Input
          className='kn__search'
          placeholder={t('searchKnowledge')}
          value={searchInput}
          onInput={(e) => setSearchInput(e.detail.value)}
          onConfirm={() => fetch(1)}
        />
        <Button className='kn__search-btn' size='mini' onClick={() => fetch(1)}>{t('search')}</Button>
        <Button size='mini' onClick={() => { setSearchInput(''); setQ(''); fetch(1) }}>{t('reset')}</Button>
      </View>

      {errorMessage && <View className='kn__error'><Text>{errorMessage}</Text></View>}

      {(editing || form.title || form.content || form.category) && (
        <View className='card kn__editor'>
          <Text className='kn__editor-title'>{editing ? t('editArticle') : t('createArticle')}</Text>
          <Input
            className='kn__editor-input'
            placeholder={t('titleLabel')}
            value={form.title}
            onInput={(e) => setForm({ ...form, title: e.detail.value })}
          />
          <Input
            className='kn__editor-input'
            placeholder={t('categoryOptional')}
            value={form.category}
            onInput={(e) => setForm({ ...form, category: e.detail.value })}
          />
          <Textarea
            className='kn__editor-textarea'
            placeholder={t('contentMarkdown')}
            value={form.content}
            onInput={(e) => setForm({ ...form, content: e.detail.value })}
            autoHeight
          />
          <View className='kn__editor-actions'>
            <Button size='mini' type='primary' onClick={handleSave}>{t('save')}</Button>
            <Button size='mini' onClick={() => { setEditing(null); setForm(emptyForm) }}>{t('cancel')}</Button>
          </View>
        </View>
      )}

      <View className='card kn__table'>
        {items.map((item) => (
          <View key={item.id} className='kn__row'>
            <View className='kn__row-main'>
              <View className='flex-between'>
                <Text className='kn__row-title'>{item.title}</Text>
                {item.category && <Text className='kn__row-category'>{item.category}</Text>}
              </View>
              {item.docType && (
                <Text className='kn__row-doc' onClick={() => copyFileUrl(item)}>
                  {item.docType.toUpperCase()} · {item.sourceFile || t('sourceFile')}
                </Text>
              )}
              <Text className='kn__row-content' numberOfLines={2}>{item.content}</Text>
            </View>
            <View className='kn__row-actions'>
              <Text className='kn__edit' onClick={() => openEdit(item)}>{t('edit')}</Text>
              <Text className='kn__delete' onClick={() => handleDelete(item)}>{t('delete')}</Text>
            </View>
          </View>
        ))}

        {!loading && items.length === 0 && (
          <View className='kn__empty'><Text>{t('noKnowledge')}</Text></View>
        )}
      </View>

      <View className='kn__pagination'>
        <Button size='mini' disabled={page <= 1} onClick={() => fetch(page - 1)}>{t('prevPage')}</Button>
        <Text className='kn__page-info'>{t('pageInfo', { page, pages: totalPages })}（{t('total', { n: total })}）</Text>
        <Button size='mini' disabled={page >= totalPages} onClick={() => fetch(page + 1)}>{t('nextPage')}</Button>
      </View>
    </View>
  )
}

export default KnowledgePage
