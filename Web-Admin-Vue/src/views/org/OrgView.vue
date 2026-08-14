<template>
  <div>
    <PageHeader :title="t('navOrg')" :subtitle="t('orgSubtitle')">
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateOrg">
        {{ t('orgCreate') }}
      </v-btn>
    </PageHeader>

    <!-- 组织选择 -->
    <v-card class="mb-4">
      <v-card-text class="d-flex align-center ga-3">
        <v-select
          v-model="currentOrgId"
          :items="orgs"
          item-title="name"
          item-value="id"
          :label="t('selectOrg')"
          class="flex-grow-1"
          density="comfortable"
          clearable
          @update:model-value="onSelectOrg"
        />
        <v-btn
          v-if="currentOrgId"
          variant="tonal"
          color="error"
          prepend-icon="mdi-delete-outline"
          @click="confirmDeleteOrg"
        >
          {{ t('deleteOrg') }}
        </v-btn>
      </v-card-text>
    </v-card>

    <v-row v-if="currentOrgId" class="ma-0">
      <!-- 左：部门树 -->
      <v-col cols="12" md="4" class="ps-0">
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-sitemap" class="me-2" />
            {{ t('deptTitle') }}
            <v-spacer />
            <v-btn icon="mdi-plus" size="small" variant="text" :title="t('deptAdd')" @click="openAddDept(null)" />
          </v-card-title>
          <v-divider />
          <v-card-text class="pa-2">
            <v-list density="comfortable" nav>
              <v-list-item
                :active="selectedDeptId == null"
                prepend-icon="mdi-office-building-outline"
                :title="t('allDepartments')"
                @click="selectDept(null)"
              />
              <OrgDeptTree
                v-for="n in deptTree"
                :key="n.id"
                :node="n"
                :selected-id="selectedDeptId"
                @select="selectDept"
                @add="openAddDept"
                @rename="openEditDept"
                @remove="confirmDeleteDept"
              />
            </v-list>
            <div v-if="!departments.length" class="text-medium-emphasis pa-2 text-caption">
              {{ t('noDept') }}
            </div>
          </v-card-text>
        </v-card>
      </v-col>

      <!-- 右：成员 -->
      <v-col cols="12" md="8" class="pe-0">
        <v-card>
          <v-card-title class="d-flex align-center">
            <v-icon icon="mdi-account-group-outline" class="me-2" />
            {{ t('memberTitle') }}
            <v-spacer />
            <v-btn variant="tonal" prepend-icon="mdi-link-variant" class="me-2" @click="openInvite">
              {{ t('inviteCreate') }}
            </v-btn>
            <v-btn color="primary" prepend-icon="mdi-account-plus-outline" @click="openAddMember">
              {{ t('memberAdd') }}
            </v-btn>
          </v-card-title>
          <v-divider />
          <v-card-text>
            <div class="d-flex ga-3 mb-3">
              <DebouncedSearch v-model="memberKeyword" :placeholder="t('searchMember')" class="flex-grow-1" @search="loadMembers(1)" />
            </div>
            <AppTable :headers="memberHeaders" :items="members" :loading="memberLoading" :total="memberTotal" :items-per-page="memberLimit">
              <template #item.nickname="{ item }">{{ item.nickname || '-' }}</template>
              <template #item.role="{ item }">
                <v-select
                  :model-value="item.role"
                  :items="roleOptions"
                  item-title="label"
                  item-value="value"
                  density="compact"
                  hide-details
                  class="role-select"
                  @update:model-value="(v: string) => updateMemberRole(item, v as OrgMemberRole)"
                />
              </template>
              <template #item.deptName="{ item }">{{ item.deptName || '-' }}</template>
              <template #item.actions="{ item }">
                <v-btn icon="mdi-delete-outline" variant="text" size="small" color="error" :title="t('delete')" @click="confirmDeleteMember(item)" />
              </template>
              <template #pagination>
                <AppPagination :page="memberPage" :limit="memberLimit" :total="memberTotal" :loading="memberLoading" @update:page="loadMembers" />
              </template>
            </AppTable>

            <!-- 邀请列表 -->
            <v-divider class="my-4" />
            <div class="text-subtitle-2 mb-2">{{ t('inviteList') }}</div>
            <v-table v-if="invites.length" density="compact">
              <thead>
                <tr>
                  <th>{{ t('inviteCode') }}</th>
                  <th>{{ t('roleCol') }}</th>
                  <th>{{ t('statusCol') }}</th>
                  <th>{{ t('actionCol') }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="inv in invites" :key="inv.id">
                  <td><code>{{ inv.code }}</code></td>
                  <td>{{ t(`role${cap(inv.role)}`) }}</td>
                  <td>{{ inv.usedBy ? t('inviteUsed') : t('invitePending') }}</td>
                  <td>
                    <v-btn icon="mdi-content-copy" size="x-small" variant="text" :title="t('inviteCopy')" @click="copyInvite(inv.code)" />
                    <v-btn icon="mdi-delete-outline" size="x-small" variant="text" color="error" :title="t('inviteRevoke')" @click="revokeInvite(inv)" />
                  </td>
                </tr>
              </tbody>
            </v-table>
            <div v-else class="text-medium-emphasis text-caption">{{ t('noInvite') }}</div>
          </v-card-text>
        </v-card>
      </v-col>
    </v-row>

    <v-empty-state v-else icon="mdi-office-building-outline" :title="t('selectOrgFirst')" :text="t('selectOrgFirstHint')" />

    <!-- 新建/编辑组织 -->
    <FormDialog v-model="showOrgDialog" :title="orgForm.id ? t('editOrg') : t('orgCreate')" :loading="savingOrg" @save="onSaveOrg">
      <v-form @submit.prevent="onSaveOrg">
        <v-text-field v-model="orgForm.name" :label="t('orgName')" :rules="[required]" required />
        <v-text-field v-model="orgForm.description" :label="t('orgDescription')" />
      </v-form>
    </FormDialog>

    <!-- 新建/编辑部门 -->
    <FormDialog v-model="showDeptDialog" :title="deptForm.id ? t('editDept') : t('deptAdd')" :loading="savingDept" @save="onSaveDept">
      <v-form @submit.prevent="onSaveDept">
        <v-text-field v-model="deptForm.name" :label="t('deptName')" :rules="[required]" required />
        <v-select
          v-model="deptForm.parentId"
          :items="parentDeptOptions"
          item-title="label"
          item-value="value"
          :label="t('deptParent')"
          clearable
        />
      </v-form>
    </FormDialog>

    <!-- 添加成员 -->
    <FormDialog v-model="showMemberDialog" :title="t('memberAdd')" :loading="savingMember" @save="onSaveMember">
      <v-form @submit.prevent="onSaveMember">
        <v-select
          v-model="memberForm.userId"
          :items="memberUserOptions"
          item-title="label"
          item-value="value"
          :label="t('selectUser')"
          :rules="[required]"
          required
        />
        <v-select v-model="memberForm.role" :items="roleOptions" item-title="label" item-value="value" :label="t('roleCol')" />
        <v-select v-model="memberForm.deptId" :items="deptOptions" item-title="label" item-value="value" :label="t('deptOptional')" clearable />
      </v-form>
    </FormDialog>

    <!-- 邀请 -->
    <FormDialog v-model="showInviteDialog" :title="t('inviteCreate')" :loading="savingInvite" :save-label="t('generateInvite')" @save="onSaveInvite">
      <v-form @submit.prevent="onSaveInvite">
        <v-select v-model="inviteForm.role" :items="roleOptions" item-title="label" item-value="value" :label="t('roleCol')" />
        <v-select v-model="inviteForm.deptId" :items="deptOptions" item-title="label" item-value="value" :label="t('deptOptional')" clearable />
        <div v-if="inviteResult" class="d-flex align-center ga-2 mt-2">
          <code class="text-h6">{{ inviteResult }}</code>
          <v-btn icon="mdi-content-copy" size="small" variant="tonal" :title="t('inviteCopy')" @click="copyInvite(inviteResult)" />
        </div>
      </v-form>
    </FormDialog>

    <ConfirmDialog v-model="confirm.show" :title="confirm.title" :content="confirm.content" @confirm="runConfirm" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useSnackbarStore } from '@/stores/snackbar'
import { orgApi } from '@/api/org'
import { usersApi } from '@/api/users'
import type { Organization, Department, OrgMember, OrgMemberRole, OrgInvite } from '@/types/org'
import type { AdminUser } from '@/types/user'
import PageHeader from '@/components/PageHeader.vue'
import AppTable from '@/components/AppTable.vue'
import AppPagination from '@/components/AppPagination.vue'
import FormDialog from '@/components/FormDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import DebouncedSearch from '@/components/DebouncedSearch.vue'
import OrgDeptTree from './components/OrgDeptTree.vue'
import { buildDeptTree } from './orgTree'

const { t } = useI18n()
const snackbar = useSnackbarStore()

// ── 组织 ──
const orgs = ref<Organization[]>([])
const currentOrgId = ref<number | null>(null)
const savingOrg = ref(false)

async function loadOrgs() {
  const res = await orgApi.listOrganizations(1, 100)
  orgs.value = res.items
  if (!currentOrgId.value && res.items.length) currentOrgId.value = res.items[0].id
}

function onSelectOrg(id: number | null) {
  currentOrgId.value = id
  selectedDeptId.value = null
  memberPage.value = 1
  if (id) {
    loadDepartments()
    loadMembers(1)
    loadInvites()
  }
}

function openCreateOrg() {
  orgForm.id = 0
  orgForm.name = ''
  orgForm.description = ''
  showOrgDialog.value = true
}

async function onSaveOrg() {
  if (!orgForm.name.trim()) return
  savingOrg.value = true
  try {
    if (orgForm.id) {
      await orgApi.updateOrganization(orgForm.id, { name: orgForm.name, description: orgForm.description })
      snackbar.success(t('saved'))
    } else {
      const org = await orgApi.createOrganization({ name: orgForm.name, description: orgForm.description })
      snackbar.success(t('orgCreated'))
      await loadOrgs()
      currentOrgId.value = org.id
      onSelectOrg(org.id)
    }
    showOrgDialog.value = false
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    savingOrg.value = false
  }
}

function confirmDeleteOrg() {
  const orgId = currentOrgId.value
  if (!orgId) return
  confirm.show = true
  confirm.title = t('deleteOrgTitle')
  confirm.content = t('deleteOrgContent')
  confirm.action = async () => {
    await orgApi.removeOrganization(orgId)
    snackbar.success(t('deleted'))
    currentOrgId.value = null
    await loadOrgs()
  }
}

// ── 部门 ──
const departments = ref<Department[]>([])
const selectedDeptId = ref<number | null>(null)
const savingDept = ref(false)
const showDeptDialog = ref(false)
const deptForm = reactive({ id: 0, name: '', parentId: null as number | null })

const deptTree = computed(() => buildDeptTree(departments.value))

async function loadDepartments() {
  if (!currentOrgId.value) return
  departments.value = await orgApi.listDepartments(currentOrgId.value)
}

function selectDept(id: number | null) {
  selectedDeptId.value = id
  loadMembers(1)
}

function openAddDept(parentId: number | null) {
  deptForm.id = 0
  deptForm.name = ''
  deptForm.parentId = parentId
  showDeptDialog.value = true
}

function openEditDept(id: number) {
  const d = departments.value.find((x) => x.id === id)
  if (!d) return
  deptForm.id = d.id
  deptForm.name = d.name
  deptForm.parentId = d.parentId ?? null
  showDeptDialog.value = true
}

const parentDeptOptions = computed(() => {
  // 编辑时排除自身及其子孙（后端也会防环）
  const exclude = new Set<number>()
  if (deptForm.id) {
    const self = departments.value.find((d) => d.id === deptForm.id)
    if (self) {
      const root = buildDeptTree(departments.value).find((n) => n.id === self.id)
      if (root) collect(root, exclude)
    }
  }
  return departments.value
    .filter((d) => !exclude.has(d.id))
    .map((d) => ({ label: d.name, value: d.id }))
})

function collect(node: { id: number; children: unknown[] }, acc: Set<number>) {
  acc.add(node.id)
  for (const c of node.children as Array<{ id: number; children: unknown[] }>) collect(c, acc)
}

async function onSaveDept() {
  if (!deptForm.name.trim()) return
  savingDept.value = true
  try {
    if (deptForm.id) {
      await orgApi.updateDepartment(deptForm.id, { name: deptForm.name, parentId: deptForm.parentId })
    } else {
      if (!currentOrgId.value) return
      await orgApi.createDepartment(currentOrgId.value, { name: deptForm.name, parentId: deptForm.parentId ?? undefined })
    }
    snackbar.success(t('saved'))
    showDeptDialog.value = false
    await loadDepartments()
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    savingDept.value = false
  }
}

function confirmDeleteDept(id: number) {
  const d = departments.value.find((x) => x.id === id)
  confirm.show = true
  confirm.title = t('deleteDeptTitle')
  confirm.content = t('deleteDeptContent', { name: d?.name ?? '' })
  confirm.action = async () => {
    await orgApi.removeDepartment(id)
    snackbar.success(t('deleted'))
    if (selectedDeptId.value === id) selectedDeptId.value = null
    await loadDepartments()
    loadMembers(1)
  }
}

// ── 成员 ──
const members = ref<OrgMember[]>([])
const memberTotal = ref(0)
const memberPage = ref(1)
const memberLimit = ref(20)
const memberKeyword = ref('')
const memberLoading = ref(false)
const savingMember = ref(false)
const showMemberDialog = ref(false)
const memberForm = reactive({ userId: null as number | null, role: 'member' as OrgMemberRole, deptId: null as number | null })
const users = ref<AdminUser[]>([])

const memberHeaders = computed(() => [
  { key: 'nickname', title: t('nicknameCol') },
  { key: 'username', title: t('usernameCol') },
  { key: 'email', title: t('emailCol') },
  { key: 'role', title: t('roleCol') },
  { key: 'deptName', title: t('deptCol') },
  { key: 'actions', title: t('actionCol') },
])

const roleOptions = [
  { value: 'owner', label: t('roleOwner') },
  { value: 'admin', label: t('roleAdmin') },
  { value: 'member', label: t('roleMember') },
] as const

const deptOptions = computed(() =>
  departments.value.map((d) => ({ label: d.name, value: d.id })),
)

const memberUserOptions = computed(() =>
  users.value
    .filter((u) => !members.value.some((m) => m.userId === u.id))
    .map((u) => ({ label: `${u.nickname || u.username} (${u.username})`, value: u.id })),
)

async function loadMembers(page = memberPage.value) {
  if (!currentOrgId.value) return
  memberLoading.value = true
  try {
    const res = await orgApi.listMembers(
      currentOrgId.value,
      page,
      memberLimit.value,
      memberKeyword.value || undefined,
      selectedDeptId.value ?? undefined,
    )
    members.value = res.items
    memberTotal.value = res.total
    memberPage.value = page
  } catch {
    snackbar.error(t('loadFailed'))
  } finally {
    memberLoading.value = false
  }
}

async function openAddMember() {
  const res = await usersApi.list(1, 100)
  users.value = res.items
  memberForm.userId = null
  memberForm.role = 'member'
  memberForm.deptId = null
  showMemberDialog.value = true
}

async function onSaveMember() {
  if (!currentOrgId.value || !memberForm.userId) return
  savingMember.value = true
  try {
    await orgApi.addMember(currentOrgId.value, {
      userId: memberForm.userId,
      role: memberForm.role,
      ...(memberForm.deptId ? { deptId: memberForm.deptId } : {}),
    })
    snackbar.success(t('memberAdded'))
    showMemberDialog.value = false
    await loadMembers()
    await loadDepartments()
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    savingMember.value = false
  }
}

async function updateMemberRole(item: OrgMember, role: OrgMemberRole) {
  try {
    await orgApi.updateMember(item.id, { role })
    item.role = role
    snackbar.success(t('saved'))
  } catch {
    snackbar.error(t('saveFailed'))
    loadMembers()
  }
}

function confirmDeleteMember(item: OrgMember) {
  confirm.show = true
  confirm.title = t('memberRemove')
  confirm.content = t('memberRemoveContent', { name: item.nickname || item.username || '' })
  confirm.action = async () => {
    await orgApi.removeMember(item.id)
    snackbar.success(t('deleted'))
    await loadMembers()
  }
}

// ── 邀请 ──
const invites = ref<OrgInvite[]>([])
const showInviteDialog = ref(false)
const savingInvite = ref(false)
const inviteForm = reactive({ role: 'member' as OrgMemberRole, deptId: null as number | null })
const inviteResult = ref('')

async function loadInvites() {
  if (!currentOrgId.value) return
  invites.value = await orgApi.listInvites(currentOrgId.value)
}

function openInvite() {
  inviteForm.role = 'member'
  inviteForm.deptId = null
  inviteResult.value = ''
  showInviteDialog.value = true
}

async function onSaveInvite() {
  if (!currentOrgId.value) return
  savingInvite.value = true
  try {
    const inv = await orgApi.createInvite(currentOrgId.value, {
      role: inviteForm.role,
      ...(inviteForm.deptId ? { deptId: inviteForm.deptId } : {}),
    })
    inviteResult.value = inv.code
    await loadInvites()
  } catch {
    snackbar.error(t('saveFailed'))
  } finally {
    savingInvite.value = false
  }
}

async function copyInvite(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    snackbar.success(t('inviteCopied'))
  } catch {
    snackbar.error(t('saveFailed'))
  }
}

function revokeInvite(inv: OrgInvite) {
  confirm.show = true
  confirm.title = t('inviteRevoke')
  confirm.content = t('inviteRevokeContent', { code: inv.code })
  confirm.action = async () => {
    await orgApi.removeInvite(inv.id)
    snackbar.success(t('deleted'))
    await loadInvites()
  }
}

// ── 通用 ──
const showOrgDialog = ref(false)
const orgForm = reactive({ id: 0, name: '', description: '' })
const confirm = reactive({
  show: false,
  title: '',
  content: '',
  action: null as (() => Promise<void>) | null,
})

async function runConfirm() {
  confirm.show = false
  if (confirm.action) await confirm.action()
}

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function required(v: unknown): true | string {
  return !!v || t('requiredField')
}

onMounted(async () => {
  await loadOrgs()
  if (currentOrgId.value) onSelectOrg(currentOrgId.value)
})
</script>

<style scoped>
.role-select {
  max-width: 130px;
}
</style>
