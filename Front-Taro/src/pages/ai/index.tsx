import { useState } from 'react'
import { View, Text, ScrollView, Input, Button } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useAiStore } from '../../stores/ai-store'
import './index.scss'

/** AI 对话页（MINI-1）：复用 /ai/chat 非流式，工具/记忆/审计后端已含。 */
export default function AiPage() {
  const { messages, isLoading, error, send, clear } = useAiStore()
  const [input, setInput] = useState('')

  const handleSend = () => {
    const text = input.trim()
    if (!text || isLoading) return
    setInput('')
    send(text)
  }

  const handleClear = () => {
    Taro.showModal({
      title: '清空对话',
      content: '确定清空当前对话？',
      success: (res) => {
        if (res.confirm) clear()
      },
    })
  }

  return (
    <View className='ai-page'>
      <View className='ai-page__header'>
        <Text className='ai-page__title'>AI 助手</Text>
        {messages.length > 0 && (
          <Text className='ai-page__clear' onClick={handleClear}>
            清空
          </Text>
        )}
      </View>

      <ScrollView
        className='ai-page__messages'
        scrollY
        scrollIntoView={messages.length ? `msg-${messages.length - 1}` : undefined}
      >
        {messages.length === 0 && (
          <View className='ai-page__empty'>
            <Text>有什么可以帮你？试试「查一下我今天的事件」</Text>
          </View>
        )}
        {messages.map((m, i) => (
          <View
            key={i}
            id={`msg-${i}`}
            className={`ai-page__bubble ai-page__bubble--${m.role}`}
          >
            <Text className='ai-page__bubble-text' userSelect>
              {m.content}
            </Text>
          </View>
        ))}
        {isLoading && (
          <View className='ai-page__bubble ai-page__bubble--assistant'>
            <Text>思考中…</Text>
          </View>
        )}
        {error && !isLoading && (
          <View className='ai-page__error'>
            <Text>{error}</Text>
          </View>
        )}
      </ScrollView>

      <View className='ai-page__input-bar'>
        <Input
          className='ai-page__input'
          value={input}
          placeholder='输入消息…'
          confirmType='send'
          onInput={(e) => setInput(e.detail.value)}
          onConfirm={handleSend}
        />
        <Button className='ai-page__send' size='mini' onClick={handleSend} disabled={isLoading}>
          发送
        </Button>
      </View>
    </View>
  )
}
