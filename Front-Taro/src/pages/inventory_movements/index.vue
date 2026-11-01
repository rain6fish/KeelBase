<!-- SPDX-License-Identifier: Apache-2.0 -->
<template>
  <view class="inventory_movements-page">
    <view class="inventory_movements-page__header">
      <text class="inventory_movements-page__title">{{ t('inventory_movements.title') }}</text>
      <text class="inventory_movements-page__count">{{ t('inventory_movements.count', { total: items.length }) }}</text>
    </view>

    <view class="inventory_movements-page__form">
      <input
        class="inventory_movements-page__input"
        v-model="documentNo"
        :placeholder="t('inventory_movements.fieldDocumentNo')"
        confirm-type="next"
      />
      <input
        class="inventory_movements-page__input"
        v-model="sku"
        :placeholder="t('inventory_movements.fieldSku')"
        confirm-type="next"
      />
      <input
        class="inventory_movements-page__input"
        v-model="itemName"
        :placeholder="t('inventory_movements.fieldItemName')"
        confirm-type="next"
      />

      <picker
        mode="selector"
        :range="directionOptions"
        :value="directionIndex"
        @change="onDirectionChange"
      >
        <view class="inventory_movements-page__picker">
          {{ t('inventory_movements.fieldDirection') }}: {{ directionLabel(direction) }}
        </view>
      </picker>

      <input
        class="inventory_movements-page__input"
        v-model="quantity"
        type="number"
        :placeholder="t('inventory_movements.fieldQuantity')"
      />
      <input
        class="inventory_movements-page__input"
        v-model="unit"
        :placeholder="t('inventory_movements.fieldUnit')"
        confirm-type="next"
      />
      <input
        class="inventory_movements-page__input"
        v-model="partner"
        :placeholder="t('inventory_movements.fieldPartner')"
        confirm-type="next"
      />
      <input
        class="inventory_movements-page__input"
        v-model="note"
        :placeholder="t('inventory_movements.fieldNote')"
        confirm-type="done"
        @confirm="handleAdd"
      />

      <button class="inventory_movements-page__add" size="mini" @click="handleAdd">{{ t('inventory_movements.add') }}</button>
    </view>

    <text v-if="store.isLoading" class="inventory_movements-page__hint">{{ t('common.loading') }}</text>
    <text v-if="store.error" class="inventory_movements-page__error">{{ store.error }}</text>

    <view v-if="items.length === 0 && !store.isLoading" class="inventory_movements-page__empty">
      <text>{{ t('inventory_movements.empty') }}</text>
    </view>
    <view v-for="item in items" :key="item.id" class="inventory_movements-page__item">
      <text class="inventory_movements-page__text">{{ item.documentNo }}</text>
      <text class="inventory_movements-page__delete" @click="handleRemove(item)">✕</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import './index.scss'
import { onMounted, ref } from 'vue'
import Taro from '@tarojs/taro'
import { storeToRefs } from 'pinia'
import { useInventoryMovementsStore } from '../../stores/inventory_movements-store'
import { useI18n } from '../../composables/useI18n'
import type { CreateInventoryMovementRequest } from '../../types/inventory_movements'

const store = useInventoryMovementsStore()
const { t } = useI18n()
const { items } = storeToRefs(store)

const documentNo = ref('')
const sku = ref('')
const itemName = ref('')
const directionOptions = ['in', 'out']
const directionIndex = ref(0)
const direction = ref(directionOptions[0])
const quantity = ref('')
const unit = ref('')
const partner = ref('')
const note = ref('')

function directionLabel(value: string): string {
  return value === 'out' ? t('inventory_movements.directionOut') : t('inventory_movements.directionIn')
}

function onDirectionChange(e: any) {
  directionIndex.value = Number(e.detail.value)
  direction.value = directionOptions[directionIndex.value]
}

function resetForm() {
  documentNo.value = ''
  sku.value = ''
  itemName.value = ''
  directionIndex.value = 0
  direction.value = directionOptions[0]
  quantity.value = ''
  unit.value = ''
  partner.value = ''
  note.value = ''
}

onMounted(() => {
  store.load()
})

async function handleAdd() {
  const quantityValue = Number(quantity.value)
  // `sku`, `itemName`, `direction` and `quantity` are required by the server DTO — the old bar sent
  // only `documentNo`, which the ValidationPipe rejected every time.
  // `sku`、`itemName`、`direction`、`quantity` 是服务端 DTO 的必填项 —— 旧的新增栏只发 `documentNo`，
  // 每次都被 ValidationPipe 拒绝。
  if (
    !documentNo.value.trim() ||
    !sku.value.trim() ||
    !itemName.value.trim() ||
    !Number.isInteger(quantityValue) ||
    quantityValue <= 0
  ) {
    Taro.showToast({ title: t('inventory_movements.formRequired'), icon: 'none' })
    return
  }
  const dto: CreateInventoryMovementRequest = {
    documentNo: documentNo.value.trim(),
    sku: sku.value.trim(),
    itemName: itemName.value.trim(),
    direction: direction.value,
    quantity: quantityValue,
    ...(unit.value.trim() ? { unit: unit.value.trim() } : {}),
    ...(partner.value.trim() ? { partner: partner.value.trim() } : {}),
    ...(note.value.trim() ? { note: note.value.trim() } : {}),
  }
  try {
    await store.add(dto)
    resetForm()
  } catch (err: any) {
    Taro.showToast({ title: err.message || t('inventory_movements.createFailed'), icon: 'none' })
  }
}

function handleRemove(item: any) {
  Taro.showModal({
    title: t('inventory_movements.deleteTitle'),
    content: t('common.deleteConfirm', { name: `${item.documentNo}` }),
    success: async (res) => {
      if (!res.confirm) return
      try {
        await store.remove(item.id)
      } catch (err: any) {
        Taro.showToast({ title: err.message || t('inventory_movements.deleteFailed'), icon: 'none' })
      }
    },
  })
}
</script>
