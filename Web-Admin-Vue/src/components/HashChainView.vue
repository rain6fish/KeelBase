<template>
  <div class="hash-chain">
    <div class="d-flex align-center ga-2 mb-2">
      <span :class="['hash-status', valid ? 'is-valid' : 'is-broken']">
        {{ valid ? t('secChainValid') : `${t('secChainBroken')} @${brokenIndex ?? '?'}` }}
      </span>
      <span class="text-caption text-medium-emphasis">{{ t('secActionChain') }} ({{ checked }})</span>
    </div>
    <div class="hash-nodes">
      <div v-for="node in visibleNodes" :key="node.id" class="hash-node" :class="{ 'is-broken': node.broken }">
        <div class="hash-rail" />
        <div class="hash-body">
          <div class="d-flex align-center ga-2 flex-wrap">
            <code class="hash-value" :title="`${node.prevHash ?? 'genesis'} → ${node.hash ?? '∅'}`">
              #{{ node.id }} · {{ shortHash(node.hash) }}
            </code>
            <span v-if="node.broken" class="hash-broken-tag">{{ t('hashNodeBroken') }}</span>
          </div>
          <div class="text-caption text-medium-emphasis">{{ nodeLabel(node) }} · {{ formatTime(node.createdAt) }}</div>
        </div>
      </div>
    </div>
    <div v-if="chain.length > maxNodes" class="text-caption text-medium-emphasis mt-1">
      {{ t('hashTruncated', { n: maxNodes }) }}
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { formatTime } from '@/utils/format'
import type { HashNode } from '@/types/audit'

/** E-2 哈希链可视化：逐行节点（圆点轨道 + prev→hash 连线），断链行红高亮；长链折叠最近 N 条。 */
const props = withDefaults(
  defineProps<{
    chain: HashNode[]
    valid: boolean
    checked: number
    brokenIndex?: number | null
    maxNodes?: number
  }>(),
  { maxNodes: 20 },
)

const { t } = useI18n()

// 链是 id 升序（旧→新，链尾最后）；slice(-n) 保留最近 n 条（最新证据），而非最旧
const visibleNodes = computed(() => props.chain.slice(-props.maxNodes))

function shortHash(h: string | null): string {
  return h ? h.slice(0, 8) : '—'
}

function nodeLabel(node: HashNode): string {
  if (node.toolName) return node.toolName
  if (node.method && node.path) return `${node.method} ${node.path}`
  return node.action
}
</script>

<style scoped>
.hash-nodes {
  display: flex;
  flex-direction: column;
}
.hash-node {
  display: flex;
  gap: 10px;
  padding-bottom: 10px;
}
.hash-rail {
  position: relative;
  width: 14px;
  flex-shrink: 0;
}
.hash-rail::before {
  content: '';
  position: absolute;
  top: 4px;
  left: 3px;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-success);
  z-index: 1;
}
.hash-rail::after {
  content: '';
  position: absolute;
  top: 14px;
  bottom: 0;
  left: 6px;
  width: 2px;
  background: var(--el-border-color-lighter);
}
.hash-node:last-child .hash-rail::after {
  display: none;
}
.hash-node.is-broken .hash-rail::before {
  background: var(--el-color-danger);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--el-color-danger) 25%, transparent);
}
.hash-node.is-broken .hash-body {
  padding: 4px 8px;
  border: 1px solid var(--el-color-danger);
  border-radius: 4px;
}
.hash-value {
  font-family: monospace;
  font-size: 12px;
}
.hash-broken-tag {
  font-size: 12px;
  color: var(--el-color-danger);
}
.hash-status {
  font-weight: 500;
}
.hash-status.is-valid {
  color: var(--el-color-success);
}
.hash-status.is-broken {
  color: var(--el-color-danger);
}
</style>
