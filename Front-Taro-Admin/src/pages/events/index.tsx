import { useEffect, useState } from 'react'
import { View, Text, Input, Button, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { adminService } from '../../services/admin-service'
import { useLocaleStore, t } from '../../i18n'
import RangeFilter from '../../components/range-filter/index'
import { downloadCsv } from '../../utils/csv'
import type { AdminEvent } from '../../types/event'
import './index.scss'

const STATUS_OPTIONS = ['all', 'active', 'cancelled']
const LIMIT = 20

function formatTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function EventsPage() {
  const { locale } = useLocaleStore()
  const [items, setItems] = useState<AdminEvent[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  const [keyword, setKeyword] = useState('')
  const [status, setStatus] = useState('all')
  const [userFilter, setUserFilter] = useState('')
  const [range, setRange] = useState('all')
  const [start, setStart] = useState<string | undefined>(undefined)
  const [end, setEnd] = useState<string | undefined>(undefined)

  const filters = () => ({
    keyword: keyword.trim() || undefined,
    isCancelled: status === 'all' ? undefined : status === 'cancelled',
    start,
    end,
    userId: userFilter.trim() ? Number(userFilter.trim()) : undefined,
  })

  const load = async (nextPage = 1) => {
    setLoading(true)
    setErrorMessage(null)
    try {
      const res = await adminService.getAllEvents(nextPage, LIMIT, filters())
      setItems(res.items)
      setTotal(res.total)
      setPage(res.page)
    } catch (err: any) {
      setErrorMessage(err?.message || t('loadFailed'))
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load(1)
  }, [locale])

  const totalPages = Math.max(1, Math.ceil(total / LIMIT))

  const statusLabel = (key: string): string => {
    const map: Record<string, string> = { all: t('allStatus'), active: t('active'), cancelled: t('cancelled') }
    return map[key] || key
  }

  const handleDelete = (id: number, title: string) => {
    Taro.showModal({
      title: t('deleteEventTitle'),
      content: t('deleteEventContent', { title }),
      confirmColor: '#dc2626',
      success: async (res) => {
        if (!res.confirm) return
        try {
          await adminService.deleteEvent(id)
          Taro.showToast({ title: t('deleted'), icon: 'success' })
          load(page)
        } catch (err: any) {
          Taro.showToast({ title: err?.message || t('deleteFailed'), icon: 'none' })
        }
      },
    })
  }

  const handleExport = () => {
    downloadCsv(
      t('navEvents'),
      [t('idCol'), t('eventTitle'), t('eventStart'), t('eventEnd'), t('eventUser'), t('eventStatus')],
      items.map((e) => [e.id, e.title, formatTime(e.startTime), formatTime(e.endTime), e.user?.username ?? '', e.isCancelled ? t('cancelled') : t('active')]),
    )
    Taro.showToast({ title: t('exportDone'), icon: 'success' })
  }

  const handleRangeChange = (key: string, since?: string) => {
    setRange(key)
    setStart(since)
    setEnd(undefined)
    load(1)
  }

  const reset = () => {
    setKeyword('')
    setStatus('all')
    setUserFilter('')
    setRange('all')
    setStart(undefined)
    setEnd(undefined)
    load(1)
  }

  return (
      <View className='page'>
        <View className='flex-between'>
          <Text className='page__title'>{t('navEvents')}</Text>
          <View className='events__header-actions'>
            <Text className='page__total'>{t('eventTotal', { n: total })}</Text>
            <Button size='mini' onClick={handleExport}>{t('export')}</Button>
          </View>
        </View>

        <View className='events__toolbar'>
          <Input
            className='events__search'
            placeholder={t('searchTitle')}
            value={keyword}
            onInput={(e) => setKeyword(e.detail.value)}
            onConfirm={() => load(1)}
          />
          <Picker mode='selector' range={STATUS_OPTIONS.map(statusLabel)} value={STATUS_OPTIONS.indexOf(status)} onChange={(e) => { setStatus(STATUS_OPTIONS[Number(e.detail.value)]); load(1) }}>
            <View className='events__picker'><Text>{statusLabel(status)}</Text></View>
          </Picker>
          <Input
            className='events__search'
            placeholder={t('filterByUserId')}
            value={userFilter}
            onInput={(e) => setUserFilter(e.detail.value)}
            onConfirm={() => load(1)}
          />
          <RangeFilter value={range} onChange={handleRangeChange} />
          <Button className='events__search-btn' size='mini' onClick={() => load(1)}>{t('filter')}</Button>
          <Button size='mini' onClick={reset}>{t('reset')}</Button>
        </View>

        {errorMessage && (
          <View className='events__error'>
            <Text>{errorMessage}</Text>
          </View>
        )}

        <View className='card events__table'>
          <View className='events__row events__row--header'>
            <Text className='events__col-id'>{t('idCol')}</Text>
            <Text className='events__col-title'>{t('eventTitle')}</Text>
            <Text className='events__col-date'>{t('eventStart')}</Text>
            <Text className='events__col-date'>{t('eventEnd')}</Text>
            <Text className='events__col-user'>{t('eventUser')}</Text>
            <Text className='events__col-cancel'>{t('eventStatus')}</Text>
            <Text className='events__col-action'>{t('actionCol')}</Text>
          </View>

          {items.map((e) => (
            <View key={e.id} className='events__row'>
              <Text className='events__col-id'>{e.id}</Text>
              <Text className='events__col-title'>{e.title}</Text>
              <Text className='events__col-date'>{formatTime(e.startTime)}</Text>
              <Text className='events__col-date'>{formatTime(e.endTime)}</Text>
              <Text className='events__col-user'>{e.user?.username ?? `#${e.userId ?? '-'}`}</Text>
              <View className='events__col-cancel'>
                <Text className={`events__status ${e.isCancelled ? 'cancelled' : 'active'}`}>
                  {e.isCancelled ? t('cancelled') : t('active')}
                </Text>
              </View>
              <View className='events__col-action'>
                <Text className='events__delete' onClick={() => handleDelete(e.id, e.title)}>
                  {t('delete')}
                </Text>
              </View>
            </View>
          ))}

          {!loading && items.length === 0 && (
            <View className='events__empty'>
              <Text>{t('noEvents')}</Text>
            </View>
          )}
        </View>

        <View className='events__pagination'>
          <Button size='mini' disabled={page <= 1} onClick={() => load(page - 1)}>{t('prevPage')}</Button>
          <Text className='events__page-info'>{t('pageInfo', { page, pages: totalPages })}（{t('total', { n: total })}）</Text>
          <Button size='mini' disabled={page >= totalPages} onClick={() => load(page + 1)}>{t('nextPage')}</Button>
        </View>
      </View>
  )
}

export default EventsPage
