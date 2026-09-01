<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <div>
    <PageHeader :title="t('navOrg')" :subtitle="t('orgSubtitle')">
      <el-button type="primary" @click="openCreateOrg">
        <template #icon><AppIcon icon="mdi-plus" /></template>
        {{ t('orgCreate') }}
      </el-button>
    </PageHeader>

    <!-- 组织选择 -->
    <el-card shadow="never" class="mb-4">
      <div class="d-flex align-center ga-3 pa-4">
        <el-select
          v-model="currentOrgId"
          :placeholder="t('selectOrg')"
          class="flex-grow-1"
          clearable
          @update:model-value="(v: string | number | boolean | undefined) => onSelectOrg(typeof v === 'number' ? v : null)"
        >
          <el-option v-for="o in orgs" :key="o.id" :label="o.name" :value="o.id" />
        </el-select>
        <el-button
          v-if="currentOrgId"
          type="danger"
          plain
          @click="confirmDeleteOrg"
        >
          <template #icon><AppIcon icon="mdi-delete-outline" /></template>
          {{ t('deleteOrg') }}
        </el-button>
      </div>
    </el-card>

    <el-row v-if="currentOrgId" :gutter="16">
      <!-- 左：部门树 -->
      <el-col :xs="24" :md="8">
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex align-center">
              <AppIcon icon="mdi-sitemap" class="me-2" />
              {{ t('deptTitle') }}
              <div class="flex-grow-1" />
              <el-button text size="small" :title="t('deptAdd')" @click="openAddDept(null)">
                <AppIcon icon="mdi-plus" />
              </el-button>
            </div>
          </template>
          <div class="pa-2">
            <div
              class="dept-tree-node"
              :class="{ 'is-active': selectedDeptId == null }"
              @click="selectDept(null)"
            >
              <AppIcon icon="mdi-office-building-outline" size="16" class="me-2 flex-shrink-0" />
              <span class="text-truncate">{{ t('allDepartments') }}</span>
            </div>
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
            <div v-if="!departments.length" class="text-medium-emphasis pa-2 text-caption">
              {{ t('noDept') }}
            </div>
          </div>
        </el-card>
      </el-col>

      <!-- 右：成员 -->
      <el-col :xs="24" :md="16">
        <el-card shadow="never" class="mb-4">
          <template #header>
            <div class="d-flex align-center">
              <AppIcon icon="mdi-account-group-outline" class="me-2" />
              {{ t('memberTitle') }}
              <div class="flex-grow-1" />
              <el-button @click="openInvite" class="me-2">
                <template #icon><AppIcon icon="mdi-link-variant" /></template>
                {{ t('inviteCreate') }}
              </el-button>
              <el-button type="primary" @click="openAddMember">
                <template #icon><AppIcon icon="mdi-account-plus-outline" /></template>
                {{ t('memberAdd') }}
              </el-button>
            </div>
          </template>
          <div class="d-flex ga-3 mb-3">
            <DebouncedSearch v-model="memberKeyword" :placeholder="t('searchMember')" class="flex-grow-1" @search="loadMembers(1)" />
          </div>
          <AppTable :headers="memberHeaders" :items="members" :loading="memberLoading" :total="memberTotal" :items-per-page="memberLimit">
            <template #item.nickname="{ item }">{{ item.nickname || '-' }}</template>
            <template #item.role="{ item }">
              <el-select
                :model-value="item.role"
                class="role-select"
                @update:model-value="(v: string | number | boolean | undefined) => updateMemberRole(item, String(v ?? '') as OrgMemberRole)"
              >
                <el-option v-for="opt in roleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
              </el-select>
            </template>
            <template #item.deptName="{ item }">{{ item.deptName || '-' }}</template>
            <template #item.actions="{ item }">
              <el-button text size="small" type="danger" :title="t('delete')" @click="confirmDeleteMember(item)">
                <AppIcon icon="mdi-delete-outline" />
              </el-button>
            </template>
            <template #pagination>
              <AppPagination :page="memberPage" :limit="memberLimit" :total="memberTotal" :loading="memberLoading" @update:page="loadMembers" />
            </template>
          </AppTable>

          <!-- 邀请列表 -->
          <el-divider class="my-4" />
          <div class="text-subtitle-2 mb-2">{{ t('inviteList') }}</div>
          <el-table v-if="invites.length" :data="invites" size="small" border>
            <el-table-column :label="t('inviteCode')">
              <template #default="{ row }"><code>{{ row.code }}</code></template>
            </el-table-column>
            <el-table-column :label="t('roleCol')">
              <template #default="{ row }">{{ t(`role${cap(row.role)}`) }}</template>
            </el-table-column>
            <el-table-column :label="t('statusCol')">
              <template #default="{ row }">{{ row.usedBy ? t('inviteUsed') : t('invitePending') }}</template>
            </el-table-column>
            <el-table-column :label="t('actionCol')">
              <template #default="{ row }">
                <el-button text size="small" :title="t('inviteCopy')" @click="copyInvite(row.code)">
                  <AppIcon icon="mdi-content-copy" />
                </el-button>
                <el-button text size="small" type="danger" :title="t('inviteRevoke')" @click="revokeInvite(row)">
                  <AppIcon icon="mdi-delete-outline" />
                </el-button>
              </template>
            </el-table-column>
          </el-table>
          <div v-else class="text-medium-emphasis text-caption">{{ t('noInvite') }}</div>
        </el-card>
      </el-col>
    </el-row>

    <el-empty v-else :description="t('selectOrgFirstHint')">
      <template #description>
        <div class="font-weight-medium">{{ t('selectOrgFirst') }}</div>
        <div class="text-caption text-medium-emphasis">{{ t('selectOrgFirstHint') }}</div>
      </template>
    </el-empty>

    <!-- 新建/编辑组织 -->
    <FormDialog v-model="showOrgDialog" :title="orgForm.id ? t('editOrg') : t('orgCreate')" :loading="savingOrg" @save="onSaveOrg">
      <el-form @submit.prevent="onSaveOrg">
        <el-form-item :label="t('orgName')" required>
          <el-input v-model="orgForm.name" required />
        </el-form-item>
        <el-form-item :label="t('orgDescription')">
          <el-input v-model="orgForm.description" />
        </el-form-item>
      </el-form>
    </FormDialog>

    <!-- 新建/编辑部门 -->
    <FormDialog v-model="showDeptDialog" :title="deptForm.id ? t('editDept') : t('deptAdd')" :loading="savingDept" @save="onSaveDept">
      <el-form @submit.prevent="onSaveDept">
        <el-form-item :label="t('deptName')" required>
          <el-input v-model="deptForm.name" required />
        </el-form-item>
        <el-form-item :label="t('deptParent')">
          <el-select v-model="deptForm.parentId" clearable style="width: 100%">
            <el-option v-for="opt in parentDeptOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
      </el-form>
    </FormDialog>

    <!-- 添加成员 -->
    <FormDialog v-model="showMemberDialog" :title="t('memberAdd')" :loading="savingMember" @save="onSaveMember">
      <el-form @submit.prevent="onSaveMember">
        <el-form-item :label="t('selectUser')" required>
          <el-select v-model="memberForm.userId" style="width: 100%">
            <el-option v-for="opt in memberUserOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('roleCol')">
          <el-select v-model="memberForm.role" style="width: 100%">
            <el-option v-for="opt in roleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('deptOptional')">
          <el-select v-model="memberForm.deptId" clearable style="width: 100%">
            <el-option v-for="opt in deptOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
      </el-form>
    </FormDialog>

    <!-- 邀请 -->
    <FormDialog v-model="showInviteDialog" :title="t('inviteCreate')" :loading="savingInvite" :save-label="t('generateInvite')" @save="onSaveInvite">
      <el-form @submit.prevent="onSaveInvite">
        <el-form-item :label="t('roleCol')">
          <el-select v-model="inviteForm.role" style="width: 100%">
            <el-option v-for="opt in roleOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('deptOptional')">
          <el-select v-model="inviteForm.deptId" clearable style="width: 100%">
            <el-option v-for="opt in deptOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <div v-if="inviteResult" class="d-flex align-center ga-2 mt-2">
          <code class="text-h6">{{ inviteResult }}</code>
          <el-button size="small" :title="t('inviteCopy')" @click="copyInvite(inviteResult)">
            <template #icon><AppIcon icon="mdi-content-copy" /></template>
          </el-button>
        </div>
      </el-form>
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
  // 编辑时排除自身及其子孙（全树 DFS 定位 self，避免嵌套部门下防环失效；后端也会防环）
  const exclude = new Set<number>()
  if (deptForm.id) {
    const node = findDept(buildDeptTree(departments.value), deptForm.id)
    if (node) collect(node, exclude)
  }
  return departments.value
    .filter((d) => !exclude.has(d.id))
    .map((d) => ({ label: d.name, value: d.id }))
})

function findDept(nodes: Array<{ id: number; children: unknown[] }>, id: number): { id: number; children: unknown[] } | null {
  for (const n of nodes) {
    if (n.id === id) return n
    const found = findDept(n.children as Array<{ id: number; children: unknown[] }>, id)
    if (found) return found
  }
  return null
}

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

onMounted(async () => {
  await loadOrgs()
  if (currentOrgId.value) onSelectOrg(currentOrgId.value)
})
</script>

<style scoped>
.role-select {
  max-width: 130px;
}
.dept-tree-node {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  cursor: pointer;
  min-height: 32px;
}
.dept-tree-node:hover {
  background: var(--el-fill-color-light);
}
.dept-tree-node.is-active {
  background: var(--el-color-primary-light-9);
  color: var(--el-color-primary);
}
</style>
