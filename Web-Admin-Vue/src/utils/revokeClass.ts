// SPDX-License-Identifier: Apache-2.0

/**
 * KB-6 撤销能力档位的展示映射（单一映射，两处消费：工具治理页 `AiToolsView` + 确认卡
 * `AiConfirmationCard`——「批准前看到的话」与「事后撤销页的话」必须同一套）。
 *
 * 文案复用既有 `revokeClass*` 四键（与 `docs/manual/product-language.md` 的 Revoke class 词条一致），
 * 不在此另立第二套词表（术语闸覆盖）。
 *
 * 只做展示映射，**不重算档位规则**：档位由服务端 `resolveRevokeClass` 单源下发
 * （docs/impact-preview.spec.md §5「单源」）；未知/缺省按 `none` 显示——不猜"可撤销"。
 */

export type RevokeClassTagType = 'success' | 'warning' | 'primary' | 'info'

export interface RevokeClassTag {
  label: string
  type: RevokeClassTagType
}

export function revokeClassTag(
  revokeClass: string | undefined,
  t: (key: string) => string,
): RevokeClassTag {
  if (revokeClass === 'local_compensate') return { label: t('revokeClassLocal'), type: 'success' }
  if (revokeClass === 'governed_external') return { label: t('revokeClassGoverned'), type: 'warning' }
  if (revokeClass === 'transactional') return { label: t('revokeClassTransactional'), type: 'primary' }
  return { label: t('revokeClassNone'), type: 'info' }
}
