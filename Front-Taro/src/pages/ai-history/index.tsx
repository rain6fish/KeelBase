import { useEffect } from 'react'
import { View, Text } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAiStore } from '../../stores/ai-store'
import './index.scss'

/** AI 对话历史列表页（DX-3）：预览/打开/删除，复用 /ai/conversations。 */
export default function AiHistoryPage() {
  const { history, historyLoading, historyError, loadHistory, openConversation, deleteConversation } = useAiStore()

  useEffect(() => {
    loadHistory()
  }, [])

  const handleOpen = (id: string) => {
    openConversation(id)
    Taro.navigateBack()
  }

  const handleDelete = (item: { id: string; previewTitle: string }) => {
    Taro.showModal({
      title: '删除对话',
      content: `确定删除「${item.previewTitle}」？`,
      success: async (res) => {
        if (!res.confirm) return
        try {
          await deleteConversation(item.id)
        } catch (err: any) {
          Taro.showToast({ title: err.message || '删除失败', icon: 'none' })
        }
      },
    })
  }

  const fmt = (iso?: string) => {
    if (!iso) return ''
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <View className='ai-history-page'>
      <View className='ai-history-page__header'>
        <Text className='ai-history-page__title'>对话历史</Text>
        <Text
          className='ai-history-page__new'
          onClick={() => Taro.navigateBack()}
        >
          新对话
        </Text>
      </View>

      {historyLoading && <Text className='ai-history-page__hint'>加载中…</Text>}
      {historyError && <Text className='ai-history-page__error'>{historyError}</Text>}

      {!historyLoading && history.length === 0 && (
        <View className='ai-history-page__empty'>
          <Text>暂无历史对话</Text>
        </View>
      )}

      {history.map((c) => (
        <View key={c.id} className='ai-history-page__item' onClick={() => handleOpen(c.id)}>
          <View className='ai-history-page__content'>
            <Text className='ai-history-page__preview'>{c.previewTitle}</Text>
            <Text className='ai-history-page__meta'>
              {fmt(c.lastActivityAt)} {c.model ? ` · ${c.model}` : ''}
            </Text>
          </View>
          <Text
            className='ai-history-page__delete'
            onClick={(e) => {
              e.stopPropagation()
              handleDelete(c)
            }}
          >
            ✕
          </Text>
        </View>
      ))}
    </View>
  )
}
