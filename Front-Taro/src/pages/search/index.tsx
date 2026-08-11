import { useEffect, useState } from 'react'
import { View, Text, Input, ScrollView } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { searchService } from '../../services/search-service'
import { EVENT_COLORS } from '../../utils/constants'
import type { EventItem } from '../../types/event'
import type { UserItem } from '../../types/user'
import './index.scss'

/** 全局搜索页（DX-3）：复用 /search 聚合本人事件 + 公开用户。 */
export default function SearchPage() {
  const [keyword, setKeyword] = useState('')
  const [events, setEvents] = useState<EventItem[]>([])
  const [users, setUsers] = useState<UserItem[]>([])
  const [loading, setLoading] = useState(false)
  const [searched, setSearched] = useState(false)

  useEffect(() => {
    const timer = setTimeout(run, 400)
    return () => clearTimeout(timer)
  }, [keyword])

  const run = async () => {
    const q = keyword.trim()
    if (!q) {
      setEvents([])
      setUsers([])
      setSearched(false)
      return
    }
    setLoading(true)
    try {
      const res = await searchService.search(q)
      setEvents(res.events.items)
      setUsers(res.users.items)
    } catch (err: any) {
      Taro.showToast({ title: err.message || '搜索失败', icon: 'none' })
    } finally {
      setLoading(false)
      setSearched(true)
    }
  }

  const goEvent = (id: number) => {
    Taro.navigateTo({ url: `/pages/event-form/index?id=${id}` })
  }

  const goUser = (id: number) => {
    Taro.navigateTo({ url: `/pages/user-detail/index?id=${id}` })
  }

  const fmt = (iso?: string) =>
    iso ? new Date(iso).toLocaleDateString() : ''

  return (
    <View className='search-page'>
      <View className='search-page__bar'>
        <Text className='search-page__icon'>🔍</Text>
        <Input
          className='search-page__input'
          value={keyword}
          placeholder='搜索事件、用户…'
          autoFocus
          onInput={(e) => setKeyword(e.detail.value)}
        />
        {keyword && (
          <Text className='search-page__clear' onClick={() => setKeyword('')}>
            ✕
          </Text>
        )}
      </View>

      <ScrollView className='search-page__body' scrollY>
        {loading && <Text className='search-page__hint'>搜索中…</Text>}

        {!loading && searched && events.length === 0 && users.length === 0 && (
          <View className='search-page__empty'>
            <Text>没有找到相关内容</Text>
          </View>
        )}

        {!loading && events.length > 0 && (
          <>
            <Text className='search-page__section'>事件（{events.length}）</Text>
            {events.map((e) => (
              <View
                key={e.id}
                className='search-page__card'
                onClick={() => goEvent(e.id)}
              >
                <View
                  className='search-page__color'
                  style={{ backgroundColor: EVENT_COLORS[e.colorRole] || EVENT_COLORS[0] }}
                />
                <View className='search-page__card-main'>
                  <Text className='search-page__card-title'>{e.title}</Text>
                  <Text className='search-page__card-sub'>
                    {fmt(e.startTime)} {e.location ? ` · ${e.location}` : ''}
                  </Text>
                </View>
              </View>
            ))}
          </>
        )}

        {!loading && users.length > 0 && (
          <>
            <Text className='search-page__section'>用户（{users.length}）</Text>
            {users.map((u) => (
              <View
                key={u.id}
                className='search-page__card'
                onClick={() => goUser(u.id)}
              >
                <Text className='search-page__avatar'>
                  {(u.nickname || u.username).charAt(0).toUpperCase()}
                </Text>
                <View className='search-page__card-main'>
                  <Text className='search-page__card-title'>
                    {u.nickname || u.username}
                  </Text>
                  <Text className='search-page__card-sub'>@{u.username}</Text>
                </View>
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  )
}
