// SPDX-License-Identifier: Apache-2.0

/**
 * One human-readable line about a tool call, sent by the server as a semantic key plus an English
 * fallback instead of a finished sentence.
 *
 * The server used to write the sentence in Chinese; every surface renders these verbatim, so an
 * English interface showed Chinese. Now the server says *what* to say (`key` + `params`) and this
 * side says it in its own language, falling back to `fallback` (English) when the dictionary has no
 * entry. Placeholders in the templates are `{name}`, matching the keys of `params`.
 *
 * 关于一次工具调用的一行人读文案：服务端发**语义 key + 英文兜底**，而不是拼好的句子。
 *
 * 服务端原先用中文拼句子，而各面**原样渲染**，于是英文界面显示中文。现在服务端只说**说什么**
 * （`key` + `params`），由本端用自己的语言说；字典里没有该 key 时插值 `fallback`（英文）。
 * 模板里的占位符写成 `{name}`，与 `params` 的键同名。
 */
export interface PresentationText {
  key: string
  fallback: string
  params?: Record<string, string>
}
