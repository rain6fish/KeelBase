<template>
  <div>
    <PageHeader :title="t('workbenchOrgDir')" :subtitle="t('orgDirSubtitle')" />

    <el-empty v-if="!loading && !myOrg" :description="t('notInOrg')">
      <p class="text-medium-emphasis">{{ t('notInOrgHint') }}</p>
    </el-empty>

    <template v-else>
      <el-card shadow="never" class="mb-4">
        <div class="text-h6">{{ myOrg?.org.name }}</div>
        <div class="text-body-2 text-medium-emphasis mt-1 d-flex align-center">
          <AppIcon icon="mdi-badge-account-outline" :size="16" class="me-1" />
          {{ t(`role${cap(myOrg?.role ?? '')}`) }}
          <template v-if="myOrg?.deptPath.length">
            <AppIcon icon="mdi-chevron-right" :size="16" class="mx-1" />
            {{ myOrg.deptPath.join(' / ') }}
          </template>
        </div>
      </el-card>

      <el-row :gutter="16">
        <!-- 部门树 -->
        <el-col :xs="24" :md="10">
          <el-card shadow="never">
            <template #header>
              <div class="d-flex align-center">
                <AppIcon icon="mdi-sitemap" class="me-2" />
                {{ t('deptTitle') }}
              </div>
            </template>
            <div v-if="tree.length" class="pa-2">
              <OrgDeptTree v-for="n in tree" :key="n.id" :node="n" :selected-id="null" readonly />
            </div>
            <div v-else class="text-medium-emphasis pa-2 text-caption">{{ t('noDept') }}</div>
          </el-card>
        </el-col>

        <!-- 成员 -->
        <el-col :xs="24" :md="14">
          <el-card shadow="never">
            <template #header>
              <div class="d-flex align-center">
                <AppIcon icon="mdi-account-group-outline" class="me-2" />
                {{ t('memberTitle') }}
                <div class="flex-grow-1" />
                <el-tag size="small" effect="light">{{ t('memberTotal', { n: members.length }) }}</el-tag>
              </div>
            </template>
            <div v-if="!members.length" class="text-medium-emphasis text-caption">{{ t('noMember') }}</div>
            <el-row v-else :gutter="12">
              <el-col v-for="m in members" :key="m.id" :xs="24" :sm="12">
                <el-card shadow="never" class="member-card mb-2">
                  <div class="d-flex align-center ga-3">
                    <el-avatar :size="40" :src="m.avatarUrl || undefined">{{ (m.nickname || '?').charAt(0) }}</el-avatar>
                    <div class="flex-grow-1">
                      <div class="text-subtitle-2">{{ m.nickname || '-' }}</div>
                      <div class="text-caption text-medium-emphasis">{{ m.deptName || '-' }}</div>
                    </div>
                    <el-tag size="small" :type="{ warning: 'warning', primary: 'primary', default: 'info' }[roleColor(m.role)] ?? 'info'" effect="light">
                      {{ t(`role${cap(m.role)}`) }}
                    </el-tag>
                  </div>
                </el-card>
              </el-col>
            </el-row>
          </el-card>
        </el-col>
      </el-row>
    </template>
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { orgApi } from '@/api/org'
import type { DeptTreeNode, MyMember, MyOrgInfo, OrgMemberRole } from '@/types/org'
import PageHeader from '@/components/PageHeader.vue'
import OrgDeptTree from '@/views/org/components/OrgDeptTree.vue'

const { t } = useI18n()

const loading = ref(true)
const myOrg = ref<MyOrgInfo | null>(null)
const tree = ref<DeptTreeNode[]>([])
const members = ref<MyMember[]>([])

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s
}

function roleColor(role: OrgMemberRole): string {
  return role === 'owner' ? 'warning' : role === 'admin' ? 'primary' : 'default'
}

onMounted(async () => {
  try {
    const [org, treeRes, memberRes] = await Promise.all([
      orgApi.getMyOrg(),
      orgApi.getMyTree(),
      orgApi.listMyMembers(),
    ])
    myOrg.value = org
    tree.value = treeRes
    members.value = memberRes
  } finally {
    loading.value = false
  }
})
</script>

<style scoped>
.member-card :deep(.el-card__body) {
  padding: 12px;
}
</style>
