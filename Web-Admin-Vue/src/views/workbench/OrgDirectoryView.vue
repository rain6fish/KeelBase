<template>
  <div>
    <PageHeader :title="t('workbenchOrgDir')" :subtitle="t('orgDirSubtitle')" />

    <v-empty-state v-if="!loading && !myOrg" icon="mdi-office-building-outline" :title="t('notInOrg')" :text="t('notInOrgHint')" />

    <template v-else>
      <v-card class="mb-4">
        <v-card-text>
          <div class="text-h6">{{ myOrg?.org.name }}</div>
          <div class="text-body-2 text-medium-emphasis mt-1">
            <v-icon icon="mdi-badge-account-outline" size="small" class="me-1" />
            {{ t(`role${cap(myOrg?.role ?? '')}`) }}
            <template v-if="myOrg?.deptPath.length">
              <v-icon icon="mdi-chevron-right" size="small" class="mx-1" />
              {{ myOrg.deptPath.join(' / ') }}
            </template>
          </div>
        </v-card-text>
      </v-card>

      <v-row class="ma-0">
        <!-- 部门树 -->
        <v-col cols="12" md="5" class="ps-0">
          <v-card>
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-sitemap" class="me-2" />
              {{ t('deptTitle') }}
            </v-card-title>
            <v-divider />
            <v-card-text class="pa-2">
              <v-list v-if="tree.length" density="comfortable" nav>
                <OrgDeptTree v-for="n in tree" :key="n.id" :node="n" :selected-id="null" readonly />
              </v-list>
              <div v-else class="text-medium-emphasis pa-2 text-caption">{{ t('noDept') }}</div>
            </v-card-text>
          </v-card>
        </v-col>

        <!-- 成员 -->
        <v-col cols="12" md="7" class="pe-0">
          <v-card>
            <v-card-title class="d-flex align-center">
              <v-icon icon="mdi-account-group-outline" class="me-2" />
              {{ t('memberTitle') }}
              <v-spacer />
              <v-chip size="small" variant="tonal">{{ t('memberTotal', { n: members.length }) }}</v-chip>
            </v-card-title>
            <v-divider />
            <v-card-text>
              <div v-if="!members.length" class="text-medium-emphasis text-caption">{{ t('noMember') }}</div>
              <v-row v-else class="ma-n1">
                <v-col v-for="m in members" :key="m.id" cols="12" sm="6">
                  <v-card variant="outlined" class="member-card">
                    <v-card-text class="d-flex align-center ga-3">
                      <v-avatar size="40" color="primary" variant="tonal">
                        <v-img v-if="m.avatarUrl" :src="m.avatarUrl" cover />
                        <span v-else>{{ (m.nickname || '?').charAt(0) }}</span>
                      </v-avatar>
                      <div class="flex-grow-1">
                        <div class="text-subtitle-2">{{ m.nickname || '-' }}</div>
                        <div class="text-caption text-medium-emphasis">{{ m.deptName || '-' }}</div>
                      </div>
                      <v-chip size="x-small" :color="roleColor(m.role)" variant="tonal">
                        {{ t(`role${cap(m.role)}`) }}
                      </v-chip>
                    </v-card-text>
                  </v-card>
                </v-col>
              </v-row>
            </v-card-text>
          </v-card>
        </v-col>
      </v-row>
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
.member-card :deep(.v-card-text) {
  padding: 12px;
}
</style>
