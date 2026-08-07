import { useEffect, useState } from 'react'
import { View, Text, Input, Textarea, Button, Switch } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminService } from '../../services/admin-service'
import { useLocaleStore, t } from '../../i18n'
import type { AdminUser } from '../../types/user'
import './index.scss'

function NotificationsPage() {
  const { locale } = useLocaleStore()
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [type, setType] = useState('system')
  const [sendAll, setSendAll] = useState(true)
  const [users, setUsers] = useState<AdminUser[]>([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [sending, setSending] = useState(false)

  const loadUsers = async () => {
    try {
      const res = await adminService.getUsers(1, 100)
      setUsers(res.items)
    } catch {
      // 加载用户失败不阻塞，可手动切换为全体
    }
  }

  useEffect(() => {
    if (!sendAll) loadUsers()
  }, [sendAll, locale])

  const toggleUser = (id: number) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSend = async () => {
    if (!title.trim()) {
      Taro.showToast({ title: t('titleRequired'), icon: 'none' })
      return
    }
    if (!sendAll && selected.size === 0) {
      Taro.showToast({ title: t('selectRequired'), icon: 'none' })
      return
    }
    setSending(true)
    try {
      const res = await adminService.broadcastNotification({
        title: title.trim(),
        body: body.trim() || undefined,
        type: type.trim() || undefined,
        userIds: sendAll ? undefined : Array.from(selected),
      })
      Taro.showToast({ title: t('broadcastSent', { n: res.sent }), icon: 'success' })
      setTitle('')
      setBody('')
      setSelected(new Set())
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('sendFailed'), icon: 'none' })
    } finally {
      setSending(false)
    }
  }

  return (
    <View className='page'>
      <Text className='page__title'>{t('navNotifications')}</Text>

      <View className='card'>
        <Text className='nb__label'>{t('broadcastTitle')}</Text>
        <Input
          className='nb__input'
          placeholder={t('broadcastTitle')}
          value={title}
          onInput={(e) => setTitle(e.detail.value)}
        />

        <Text className='nb__label'>{t('contentLabel')}</Text>
        <Textarea
          className='nb__textarea'
          placeholder={t('contentLabel')}
          value={body}
          onInput={(e) => setBody(e.detail.value)}
          autoHeight
        />

        <Text className='nb__label'>{t('typeLabel')}</Text>
        <Input
          className='nb__input'
          placeholder={t('typePlaceholder')}
          value={type}
          onInput={(e) => setType(e.detail.value)}
        />

        <View className='nb__all-toggle'>
          <Text>{t('sendToAll')}</Text>
          <Switch checked={sendAll} onChange={(e) => setSendAll(e.detail.value)} />
        </View>

        {!sendAll && (
          <View className='nb__users'>
            <Text className='nb__users-title'>{t('selectRecipients', { n: selected.size })}</Text>
            {users.map((u) => (
              <View
                key={u.id}
                className={`nb__user ${selected.has(u.id) ? 'selected' : ''}`}
                onClick={() => toggleUser(u.id)}
              >
                <Text className='nb__user-name'>{u.username}</Text>
                <Text className='nb__user-email'>{u.email}</Text>
                {selected.has(u.id) && <Text className='nb__user-check'>✓</Text>}
              </View>
            ))}
            {users.length === 0 && <Text className='nb__users-empty'>{t('noUsers')}</Text>}
          </View>
        )}

        <Button className='nb__send' type='primary' loading={sending} onClick={handleSend}>
          {t('send')}
        </Button>
      </View>
    </View>
  )
}

export default NotificationsPage
