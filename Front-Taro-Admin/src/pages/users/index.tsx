import { useEffect, useState } from 'react'
import { View, Text, Input, Button, Picker } from '@tarojs/components'
import Taro from '@tarojs/taro'
import { useUsersStore } from '../../stores/users-store'
import { adminService } from '../../services/admin-service'
import { useLocaleStore, t } from '../../i18n'
import UserDetailPage from '../user-detail/index'
import type { UserRole } from '../../types/user'
import './index.scss'

const ROLE_OPTIONS = ['user', 'admin']
const emptyCreate = { username: '', email: '', password: '', nickname: '', firstName: '', lastName: '' }

function formatTime(iso?: string): string {
  if (!iso) return '-'
  const d = new Date(iso)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function UsersPage() {
  const { items, total, page, limit, keyword, loading, errorMessage, fetch, updateRole, remove, setKeyword } =
    useUsersStore()
  const { locale } = useLocaleStore()
  const [searchInput, setSearchInput] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createForm, setCreateForm] = useState(emptyCreate)
  const [creating, setCreating] = useState(false)
  const [detailId, setDetailId] = useState<number | null>(null)

  useEffect(() => {
    fetch(1, '')
  }, [fetch])

  const totalPages = Math.max(1, Math.ceil(total / limit))

  const handleSearch = () => {
    fetch(1, searchInput)
  }

  const handleCreate = async () => {
    if (!createForm.username.trim() || !createForm.email.trim() || !createForm.password.trim() || !createForm.nickname.trim()) {
      Taro.showToast({ title: t('fillCreateForm'), icon: 'none' })
      return
    }
    setCreating(true)
    try {
      await adminService.createUser({
        username: createForm.username.trim(),
        email: createForm.email.trim(),
        password: createForm.password,
        nickname: createForm.nickname.trim(),
        firstName: createForm.firstName.trim() || undefined,
        lastName: createForm.lastName.trim() || undefined,
      })
      Taro.showToast({ title: t('userCreated'), icon: 'success' })
      setCreateForm(emptyCreate)
      setShowCreate(false)
      fetch(1)
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('createFailed'), icon: 'none' })
    } finally {
      setCreating(false)
    }
  }

  const handleRoleChange = async (id: number, value: string) => {
    const role = value as UserRole
    if (!role) return
    try {
      await updateRole(id, role)
      Taro.showToast({ title: t('roleUpdated'), icon: 'success' })
    } catch (err: any) {
      Taro.showToast({ title: err?.message || t('updateFailed'), icon: 'none' })
    }
  }

  const handleDelete = (id: number, username: string) => {
    Taro.showModal({
      title: t('deleteUserTitle'),
      content: t('deleteUserContent', { name: username }),
      confirmColor: '#dc2626',
      success: async (res) => {
        if (res.confirm) {
          try {
            await remove(id)
            Taro.showToast({ title: t('deleted'), icon: 'success' })
          } catch (err: any) {
            Taro.showToast({ title: err?.message || t('deleteFailed'), icon: 'none' })
          }
        }
      },
    })
  }

  if (detailId != null) {
    return <UserDetailPage userId={detailId} onBack={() => setDetailId(null)} />
  }

  return (
      <View className='page'>
        <View className='flex-between'>
          <Text className='page__title'>{t('navUsers')}</Text>
          <View className='users__header-actions'>
            <Text className='page__total'>{t('userTotal', { n: total })}</Text>
            <Button size='mini' type='primary' onClick={() => setShowCreate(!showCreate)}>
              {showCreate ? t('collapse') : t('newUser')}
            </Button>
          </View>
        </View>

        {showCreate && (
          <View className='card users__create'>
            <Text className='users__create-title'>{t('newUser')}</Text>
            <View className='users__create-grid'>
              <Input
                className='users__create-input'
                placeholder={t('username')}
                value={createForm.username}
                onInput={(e) => setCreateForm({ ...createForm, username: e.detail.value })}
              />
              <Input
                className='users__create-input'
                placeholder='Email'
                value={createForm.email}
                onInput={(e) => setCreateForm({ ...createForm, email: e.detail.value })}
              />
              <Input
                className='users__create-input'
                placeholder={t('password')}
                password
                value={createForm.password}
                onInput={(e) => setCreateForm({ ...createForm, password: e.detail.value })}
              />
              <Input
                className='users__create-input'
                placeholder='Nickname'
                value={createForm.nickname}
                onInput={(e) => setCreateForm({ ...createForm, nickname: e.detail.value })}
              />
              <Input
                className='users__create-input'
                placeholder='First name'
                value={createForm.firstName}
                onInput={(e) => setCreateForm({ ...createForm, firstName: e.detail.value })}
              />
              <Input
                className='users__create-input'
                placeholder='Last name'
                value={createForm.lastName}
                onInput={(e) => setCreateForm({ ...createForm, lastName: e.detail.value })}
              />
            </View>
            <View className='users__create-actions'>
              <Button size='mini' type='primary' loading={creating} onClick={handleCreate}>{t('createUser')}</Button>
            </View>
          </View>
        )}

        <View className='users__toolbar'>
          <Input
            className='users__search'
            placeholder={t('searchUserPlaceholder')}
            value={searchInput}
            onInput={(e) => setSearchInput(e.detail.value)}
            onConfirm={handleSearch}
          />
          <Button className='users__search-btn' size='mini' onClick={handleSearch}>
            {t('search')}
          </Button>
          <Button
            className='users__reset-btn'
            size='mini'
            onClick={() => {
              setSearchInput('')
              setKeyword('')
              fetch(1, '')
            }}
          >
            {t('reset')}
          </Button>
        </View>

        {errorMessage && (
          <View className='users__error'>
            <Text>{errorMessage}</Text>
          </View>
        )}

        <View className='card users__table'>
          <View className='users__row users__row--header'>
            <Text className='users__col-id'>{t('idCol')}</Text>
            <Text className='users__col-username'>{t('usernameCol')}</Text>
            <Text className='users__col-email'>{t('emailCol')}</Text>
            <Text className='users__col-role'>{t('roleCol')}</Text>
            <Text className='users__col-created'>Created</Text>
            <Text className='users__col-action'>{t('actionCol')}</Text>
          </View>

          {items.map((u) => (
            <View key={u.id} className='users__row'>
              <Text className='users__col-id'>{u.id}</Text>
              <Text className='users__col-username users__username-link' onClick={() => setDetailId(u.id)}>{u.username}</Text>
              <Text className='users__col-email'>{u.email || '-'}</Text>
              <View className='users__col-role'>
                <Picker
                  mode='selector'
                  range={ROLE_OPTIONS}
                  value={ROLE_OPTIONS.indexOf(u.role)}
                  onChange={(e) => handleRoleChange(u.id, ROLE_OPTIONS[Number(e.detail.value)])}
                >
                  <View className={`users__role-tag ${u.role === 'admin' ? 'admin' : ''}`}>
                    <Text>{u.role}</Text>
                  </View>
                </Picker>
              </View>
              <Text className='users__col-created'>{formatTime(u.createdAt)}</Text>
              <View className='users__col-action'>
                <Text className='users__delete' onClick={() => handleDelete(u.id, u.username)}>
                  {t('delete')}
                </Text>
              </View>
            </View>
          ))}

          {!loading && items.length === 0 && (
            <View className='users__empty'>
              <Text>{t('noUsers')}</Text>
            </View>
          )}
        </View>

        <View className='users__pagination'>
          <Button size='mini' disabled={page <= 1} onClick={() => fetch(page - 1)}>
            {t('prevPage')}
          </Button>
          <Text className='users__page-info'>
            {t('pageInfo', { page, pages: totalPages })}
          </Text>
          <Button size='mini' disabled={page >= totalPages} onClick={() => fetch(page + 1)}>
            {t('nextPage')}
          </Button>
        </View>
      </View>
  )
}

export default UsersPage
