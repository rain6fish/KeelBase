// SPDX-License-Identifier: Apache-2.0

/**
 * EASY-2 前端模板：按 todos feature 约定生成 4 个文件。
 * 每个函数接收 buildContext 的 ctx，返回文件内容字符串。
 */

import {
  attachmentFields,
  decimalScale,
  enumLabelGetter,
  hasEnumLabels,
  modelMemberNames,
  refColumnName,
  refFields,
  refTarget,
  toPascal,
} from './validate.mjs';

// ─── Model 字段映射 ──────────────────────────────────────────────────────────
// f.required === true → 非空类型 + `required this.x`（构造必填）；否则保持现状
const MODEL_FIELD = {
  string: (c) => ({
    decl: `  final String ${c};`,
    ctor: `required this.${c}`,
    from: `      ${c}: json['${c}'] as String,`,
    to: `        '${c}': ${c},`,
  }),
  text: (c, f) => (f.required === true
    ? {
      decl: `  final String ${c};`,
      ctor: `required this.${c}`,
      from: `      ${c}: json['${c}'] as String,`,
      to: `        '${c}': ${c},`,
    }
    : {
      decl: `  final String? ${c};`,
      ctor: `this.${c}`,
      from: `      ${c}: json['${c}'] as String?,`,
      to: `        '${c}': ${c},`,
    }),
  int: (c, f) => (f.required === true
    ? {
      decl: `  final int ${c};`,
      ctor: `required this.${c}`,
      from: `      ${c}: json['${c}'] as int,`,
      to: `        '${c}': ${c},`,
    }
    : {
      decl: `  final int? ${c};`,
      ctor: `this.${c}`,
      from: `      ${c}: json['${c}'] as int?,`,
      to: `        '${c}': ${c},`,
    }),
  // decimal travels as a string in both directions (protocol decision ①): a Dart
  // double would re-introduce exactly the rounding the backend transformer avoids.
  // decimal 双向都以字符串传递（协议决策 ①）：用 double 会把后端转换器刻意避免的
  // 浮点舍入重新引入。
  decimal: (c, f) => (f.required === true
    ? {
      decl: `  final String ${c};`,
      ctor: `required this.${c}`,
      from: `      ${c}: json['${c}'] as String,`,
      to: `        '${c}': ${c},`,
    }
    : {
      decl: `  final String? ${c};`,
      ctor: `this.${c}`,
      from: `      ${c}: json['${c}'] as String?,`,
      to: `        '${c}': ${c},`,
    }),
  bool: (c, f) => (f.required === true
    ? {
      decl: `  final bool ${c};`,
      ctor: `required this.${c}`,
      from: `      ${c}: json['${c}'] as bool,`,
      to: `        '${c}': ${c},`,
    }
    : {
      decl: `  final bool ${c};`,
      ctor: `this.${c} = false`,
      from: `      ${c}: json['${c}'] as bool? ?? false,`,
      to: `        '${c}': ${c},`,
    }),
  date: (c, f) => (f.required === true
    ? {
      decl: `  final String ${c};`,
      ctor: `required this.${c}`,
      from: `      ${c}: json['${c}'] as String,`,
      to: `        '${c}': ${c},`,
    }
    : {
      decl: `  final String? ${c};`,
      ctor: `this.${c}`,
      from: `      ${c}: json['${c}'] as String?,`,
      to: `        '${c}': ${c},`,
    }),
  // 关联在模型里只带外键 id（列名加 Id 后缀，单源见 refColumnName）。
  // 目标对象的友好回显属切片 2。
  // 关联：外键 id 用于提交，目标名（后端 relations 带回）用于**回显** ——
  // 界面显示名字而不是 id，正是切片 2 要的那一半。
  ref: (c, f) => ({
    decl: `  final int? ${refColumnName(c)};\n  final String? ${c}Name;`,
    ctor: `this.${refColumnName(c)}, this.${c}Name`,
    from:
      `      ${refColumnName(c)}: json['${refColumnName(c)}'] as int?,\n` +
      `      ${c}Name: (json['${c}'] as Map?)?['${f.display}'] as String?,`,
    to: `        '${refColumnName(c)}': ${refColumnName(c)},`,
  }),
  // 附件在模型里带 **(id, 文件名) 列表**：只有名字撤销不了 —— 撤销按 attachmentId。
  // 它不经本模型提交，关联走自己的两个端点（上传关联 / 撤销关联）。
  attachment: (c, f, ctx) => ({
    decl: `  final List<${ctx.singlePascal}AttachmentRef> ${c}Attachments;`,
    ctor: `this.${c}Attachments = const []`,
    from:
      `      ${c}Attachments: ((json['attachments'] as List?) ?? const [])\n` +
      `          .where((a) => (a as Map)['field'] == '${c}')\n` +
      `          .map((a) => ${ctx.singlePascal}AttachmentRef(\n` +
      `                id: a['id'] as int,\n` +
      `                name: a['originalName'] as String,\n` +
      `              ))\n` +
      `          .toList(),`,
    to: '',
  }),
  enum: (c, f) => (f.required === true
    ? {
      decl: `  final String ${c};`,
      ctor: `required this.${c}`,
      from: `      ${c}: json['${c}'] as String,`,
      to: `        '${c}': ${c},`,
    }
    : {
      decl: `  final String ${c};`,
      ctor: `this.${c} = '${f.enum[0]}'`,
      from: `      ${c}: json['${c}'] as String? ?? '${f.enum[0]}',`,
      to: `        '${c}': ${c},`,
    }),
};

export function modelTemplate(ctx) {
  const decls = ctx.fields.map((f) => MODEL_FIELD[f.type](f.name, f, ctx).decl).join('\n');
  const ctors = ctx.fields.map((f) => `    ${MODEL_FIELD[f.type](f.name, f, ctx).ctor},`).join('\n');
  const froms = ctx.fields.map((f) => MODEL_FIELD[f.type](f.name, f, ctx).from).join('\n');
  const tos = ctx.fields.map((f) => MODEL_FIELD[f.type](f.name, f, ctx).to).join('\n');
  // copyWith 必须按**模型成员名**生成，而不是协议字段名：ref 的成员叫 customerId /
  // customerName，附件叫 contractAttachments —— 用字段名会引用不存在的成员（实测编译错误）。
  const members = ctx.fields.flatMap(modelMemberNames);
  // 只在真有附件字段时发这个类，避免每个模块都多一个没人用的类型（Code Economy §15.3）。
  const attachRefClass =
    attachmentFields(ctx.fields).length === 0
      ? ''
      : `/// One attachment of this module: the id is what a revoke needs, the name is what a user reads.\n` +
        `/// 本模块的一个附件：撤销要用 id，用户看的是 name。\n` +
        `class ${ctx.singlePascal}AttachmentRef {\n` +
        `  final int id;\n` +
        `  final String name;\n` +
        `  const ${ctx.singlePascal}AttachmentRef({required this.id, required this.name});\n` +
        `}\n\n`;

  return `${attachRefClass}class ${ctx.singlePascal}Model {
  final int id;
${decls}

  const ${ctx.singlePascal}Model({
    required this.id,
${ctors}
  });

  factory ${ctx.singlePascal}Model.fromJson(Map<String, dynamic> json) {
    return ${ctx.singlePascal}Model(
      id: json['id'] as int,
${froms}
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
${tos}
      };

  ${ctx.singlePascal}Model copyWith({
    ${members.map((n) => `Object? ${n} = const Object()`).join(',\n    ')}
  }) {
    return ${ctx.singlePascal}Model(
      id: id,
${members.map((n) => `      ${n}: ${n} == const Object() ? this.${n} : ${n} as dynamic,`).join('\n')}
    );
  }
}
`;
}

// ─── Repository ──────────────────────────────────────────────────────────────
export function repositoryTemplate(ctx) {
  return `import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/${ctx.singular}_model.dart';

class ${ctx.pluralPascal}Repository {
  final ApiClient _client;

  ${ctx.pluralPascal}Repository(this._client);

  Future<List<${ctx.singlePascal}Model>> get${ctx.pluralPascal}() async {
    final json = await _client.get('/${ctx.plural}');
    final response = ApiResponse.fromJson(json, (data) {
      final items = data as List? ?? [];
      return items.map((e) => ${ctx.singlePascal}Model.fromJson(e as Map<String, dynamic>)).toList();
    });
    return response.data ?? [];
  }

  Future<${ctx.singlePascal}Model> create(Map<String, dynamic> data) async {
    final json = await _client.post('/${ctx.plural}', data: data);
    final response = ApiResponse.fromJson(json, (data) => ${ctx.singlePascal}Model.fromJson(data as Map<String, dynamic>));
    return response.data!;
  }

  Future<void> delete(int id) async {
    await _client.delete('/${ctx.plural}/\$id');
  }
}
`;
}

// ─── Provider ────────────────────────────────────────────────────────────────
export function providerTemplate(ctx) {
  return `import 'package:flutter/foundation.dart';
import '../../../../core/services/app_cache.dart';
import '../../data/models/${ctx.singular}_model.dart';
import '../../data/repositories/${ctx.plural}_repository.dart';

/// ${ctx.label}状态管理（UX-1：缓存优先 + 乐观更新）。
class ${ctx.pluralPascal}Provider extends ChangeNotifier {
  final ${ctx.pluralPascal}Repository _repository;
  final AppCache _cache;

  static const _ns = '${ctx.plural}';
  static const _keyList = 'list';

  List<${ctx.singlePascal}Model> _items = [];
  bool _loading = false;
  bool _fromCache = false;
  String? _error;

  ${ctx.pluralPascal}Provider(this._repository, {AppCache? cache})
      : _cache = cache ?? AppCache.unavailable();

  List<${ctx.singlePascal}Model> get items => _items;
  bool get loading => _loading;
  String? get error => _error;
  /// 当前数据是否来自离线缓存（网络未刷新成功）。
  bool get fromCache => _fromCache;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();

    // 缓存优先：先展示本地缓存，避免空白
    final cached = await _cache.readList(_ns, _keyList);
    if (cached != null) {
      _items = cached.map(${ctx.singlePascal}Model.fromJson).toList();
      _fromCache = true;
      notifyListeners();
    }

    try {
      _items = await _repository.get${ctx.pluralPascal}();
      _fromCache = false;
      await _cache.writeList(_ns, _keyList, _items.map((e) => e.toJson()).toList());
    } catch (e) {
      if (_items.isEmpty) _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }

  Future<bool> add(Map<String, dynamic> data) async {
    try {
      final item = await _repository.create(data);
      _items = [..._items, item];
      _error = null;
      notifyListeners();
      await _persist();
      return true;
    } catch (e) {
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  /// 乐观更新：本地立即移除，网络失败恢复原列表。
  Future<bool> remove(int id) async {
    final originalList = _items;
    _items = _items.where((e) => e.id != id).toList();
    _error = null;
    notifyListeners();

    try {
      await _repository.delete(id);
      await _persist();
      return true;
    } catch (e) {
      _items = originalList;
      _error = e.toString();
      notifyListeners();
      return false;
    }
  }

  Future<void> _persist() async {
    await _cache.writeList(_ns, _keyList, _items.map((e) => e.toJson()).toList());
  }
}
`;
}

// ─── Page ────────────────────────────────────────────────────────────────────
const FORM_FIELD = {
  string: (c, l10n) =>
    `          CupertinoTextField(
            placeholder: '${c}',
            controller: _${c}Ctrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),`,
  text: (c, l10n) =>
    `          CupertinoTextField(
            placeholder: '${c}',
            controller: _${c}Ctrl,
            maxLines: 3,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),`,
  int: (c, l10n) =>
    `          CupertinoTextField(
            placeholder: '${c}',
            controller: _${c}Ctrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: false),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),`,
  decimal: (c, l10n, f) =>
    `          CupertinoTextField(
            placeholder: '${c} (≤${decimalScale(f)} 位小数)',
            controller: _${c}Ctrl,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),`,
  // 关联（切片 2）：选项到手就用**下拉**；取不到则回落 id 输入，表单永远可用。
  ref: (c, l10n, f) =>
    `          if (_${c}Options.isEmpty)\n` +
    `            CupertinoTextField(\n` +
    `              placeholder: '${c} ID（${f.target}）',\n` +
    `              controller: _${refColumnName(c)}Ctrl,\n` +
    `              keyboardType: const TextInputType.numberWithOptions(decimal: false),\n` +
    `              padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),\n` +
    `            )\n` +
    `          else\n` +
    `            CupertinoSlidingSegmentedControl<int>(\n` +
    `              groupValue: _${c}IdVal,\n` +
    `              onValueChanged: (v) => setState(() => _${c}IdVal = v),\n` +
    `              children: {\n` +
    `                for (final o in _${c}Options)\n` +
    `                  (o['id'] as int): Padding(\n` +
    `                    padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),\n` +
    `                    child: Text('\${o['${f.display}'] ?? o['id']}'),\n` +
    `                  ),\n` +
    `              },\n` +
    `            ),`,
  // 附件在表单里暂不呈现（上传控件属切片 2）；列表处显示名字。
  attachment: () => '',
  bool: (c, l10n) =>
    `          Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: [
              Text('${c}'),
              CupertinoSwitch(value: _${c}Val, onChanged: (v) => setState(() => _${c}Val = v)),
            ],
          ),`,
  date: (c, l10n) =>
    `          CupertinoTextField(
            placeholder: '${c} (ISO 8601)',
            controller: _${c}Ctrl,
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
          ),`,
  enum: (c, l10n, f) =>
    `          CupertinoSegmentedControl<String>(
            groupValue: _${c}Val,
            onValueChanged: (v) => setState(() => _${c}Val = v),
            children: {
              for (final o in ${JSON.stringify(f.enum)}) o: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
                child: Text(${hasEnumLabels(f) ? `_${c}Labels(l10n)[o] ?? o` : 'o'}),
              ),
            },
          ),`,
};

/**
 * Per-field bilingual label lookup for enum controls (empty string for every
 * non-enum field and for enum fields without labels, so callers can join freely).
 *
 * 供 enum 控件使用的每字段双语标签查表（非 enum 字段、以及未声明标签的 enum 字段
 * 都返回空串，调用方可直接 join）。
 */
const FORM_ENUM_LABELS = {
  string: () => '',
  text: () => '',
  int: () => '',
  bool: () => '',
  date: () => '',
  decimal: () => '',
  ref: () => '',
  attachment: () => '',
  enum: (c, f, ctx) => {
    if (!hasEnumLabels(f)) return '';
    const entries = f.enum
      .filter((opt) => f.enumLabels[opt])
      .map((opt) => `        '${opt}': l10n.${enumLabelGetter(ctx, c, opt)},`)
      .join('\n');
    return (
      `  /// Bilingual labels for \`${c}\`; an option without a label falls back to its identifier.\n` +
      `  /// \`${c}\` 的双语标签；未声明标签的选项回落显示标识符。\n` +
      `  Map<String, String> _${c}Labels(AppLocalizations l10n) => {\n${entries}\n  };`
    );
  },
};

const FORM_CONTROLLERS = {
  string: (c) => `  final _${c}Ctrl = TextEditingController();`,
  text: (c) => `  final _${c}Ctrl = TextEditingController();`,
  int: (c) => `  final _${c}Ctrl = TextEditingController();`,
  bool: (c) => `  bool _${c}Val = false;`,
  date: (c) => `  final _${c}Ctrl = TextEditingController();`,
  decimal: (c) => `  final _${c}Ctrl = TextEditingController();`,
  ref: (c) => `  final _${refColumnName(c)}Ctrl = TextEditingController();`,
  // 附件没有输入控件（关联走自己的端点），故不产控制器 —— dispose() 也必须跳过它
  attachment: () => '',
  enum: (c, f) => `  String _${c}Val = '${f.enum[0]}';`,
};

const FORM_READ = {
  string: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = _${c}Ctrl.text.trim();`,
  text: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = _${c}Ctrl.text.trim();`,
  int: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = int.tryParse(_${c}Ctrl.text.trim());`,
  // decimal 原样提交字符串：不 parse 成 num（理由见 MODEL_FIELD.decimal 的注释），
  // 精度校验由后端 DTO 的十进制字符串规则把关。
  decimal: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = _${c}Ctrl.text.trim();`,
  ref: (c) =>
    `if (_${c}IdVal != null) {\n` +
    `        data['${refColumnName(c)}'] = _${c}IdVal;\n` +
    `      } else if (_${refColumnName(c)}Ctrl.text.isNotEmpty) {\n` +
    `        data['${refColumnName(c)}'] = int.tryParse(_${refColumnName(c)}Ctrl.text.trim());\n` +
    `      }`,
  attachment: () => '',
  bool: (c) => `data['${c}'] = _${c}Val;`,
  date: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = _${c}Ctrl.text.trim();`,
  enum: (c) => `data['${c}'] = _${c}Val;`,
};

export function pageTemplate(ctx) {
  const controllers = ctx.fields.map((f) => FORM_CONTROLLERS[f.type](f.name, f)).join('\n');
  const labelMethods = ctx.fields
    .map((f) => FORM_ENUM_LABELS[f.type](f.name, f, ctx))
    .filter(Boolean)
    .join('\n\n');
  const formFields = ctx.fields.map((f) => FORM_FIELD[f.type](f.name, null, f)).join('\n\n');
  // 回显（切片 2）：关联显示**目标名**而非 id，附件显示**文件名**；无值的部分略去。
  const echoEntries = [
    ...refFields(ctx.fields).map(
      (r) => `      if (item.${r.name}Name != null && item.${r.name}Name!.isNotEmpty) item.${r.name}Name!,`,
    ),
    ...attachmentFields(ctx.fields).map(
      (n) => `      if (item.${n}Attachments.isNotEmpty) item.${n}Attachments.map((a) => a.name).join('、'),`,
    ),
    // 金额字段走**单源**格式化（core/utils/money.dart），而不是把裸十进制字符串摊给用户看。
    // Currency-bearing decimals are formatted through the single-source helper rather than
    // shown as the raw decimal string.
    ...ctx.fields
      .filter((f) => f.type === 'decimal' && f.currency === true)
      .map(
        (f) =>
          `      if (item.${f.name} != null && item.${f.name}!.isNotEmpty) formatMoney(item.${f.name}),`,
      ),
  ];
  const echoMethod =
    echoEntries.length === 0
      ? ''
      : `\n  ///\n` +
        `  /// Relations and attachments, shown instead of their raw ids. Parts with no value\n` +
        `  /// are dropped so an empty row does not render a stray separator.\n` +
        `  ///\n` +
        `  /// 关联与附件的回显（显示名字而非裸 id）；无值的部分略去，\n` +
        `  /// 免得空行渲染出多余的分隔符。\n` +
        `  ///\n` +
        `  String _echo(${ctx.singlePascal}Model item) {\n` +
        `    final parts = <String>[\n${echoEntries.join('\n')}\n    ];\n` +
        `    return parts.where((p) => p.isNotEmpty).join(' · ');\n` +
        `  }\n`;
  const listSubtitle = echoEntries.length === 0 ? '' : `\n                      subtitle: Text(_echo(item)),`;
  // _echo 的形参是**模型**类（页面上只有 Model，没有实体），故须导入模型文件。
  // 页面在 presentation/pages/ 下，模型在 data/models/ 下 —— 相对路径要退两级。
  const modelImport = echoEntries.length === 0 ? '' : `import '../../data/models/${ctx.singular}_model.dart';\n`;
  // ── 切片 2：两个控件 ────────────────────────────────────────────────────────
  // 关联下拉放**新建表单**（选项取不到则回落手工输入 id）；附件上传放**列表行上**
  // —— 因为关联必须有一个已存在的 owner id，而新建时该 id 还不存在。
  const refControls = refFields(ctx.fields);
  const attControls = attachmentFields(ctx.fields);
  const pageExtraImports =
    refControls.length > 0 || attControls.length > 0
      ? `import '../../../../core/api/api_client.dart';\n`
      : '';
  const filePickerImport =
    attControls.length > 0 ? `import 'package:file_picker/file_picker.dart';\n` : '';
  const moneyImport =
    ctx.fields.some((f) => f.type === 'decimal' && f.currency === true)
      ? `import '../../../../core/utils/money.dart';\n`
      : '';
  const refStateFields = refControls
    .map((r) => `  int? _${r.name}IdVal;\n  List<Map<String, dynamic>> _${r.name}Options = const [];`)
    .join('\n');
  const refOptionFetch = refControls
    .map(
      (r) =>
        `    // 关联选项：只取**调用者自己看得见**的记录（用户端列表自带范围过滤），\n` +
        `    // 取不到就不阻塞表单 —— 下拉留空并回落到手工输入 id。\n` +
        `    Future.microtask(() async {\n` +
        `      if (!mounted) return;\n` +
        `      final client = context.read<ApiClient>();\n` +
        `      try {\n` +
        `        final json = await client.get('/${refTarget(r.target).plural}');\n` +
        `        final list = (json['data'] as List?) ?? const [];\n` +
        `        if (mounted) {\n` +
        `          setState(() {\n` +
        `            _${r.name}Options = list.map((e) => Map<String, dynamic>.from(e as Map)).toList();\n` +
        `          });\n` +
        `        }\n` +
        `      } catch (_) {\n` +
        `        // 选项不可得不影响创建：仍可用 id 手工关联。\n` +
        `      }\n` +
        `    });\n`,
    )
    .join('');
  const attachMethods = attControls
    .map(
      (n) =>
        `\n  ///\n` +
        `  /// Picks a file, uploads it through the platform's existing /upload pipeline and\n` +
        `  /// then records the association against this row. Attachment is per row rather than\n` +
        `  /// part of the create form, because the association needs an owner id that does not\n` +
        `  /// exist yet while the row is still being created.\n` +
        `  ///\n` +
        `  /// 选文件、走平台既有的 /upload 管线上传、再把关联登记到本行。附件是**按行**操作的\n` +
        `  /// 而不是新建表单的一部分 —— 因为关联需要一个 owner id，而行还在创建中时它并不存在。\n` +
        `  ///\n` +
        `  Future<void> _attach${toPascal(n)}(int ownerId) async {\n` +
        `    final picked = await FilePicker.platform.pickFiles();\n` +
        `    if (picked == null || picked.files.isEmpty) return;\n` +
        `    final file = picked.files.first;\n` +
        `    if (file.path == null) return;\n` +
        `    // 取 client 必须在 await 之前：跨 await 用 context 会触发\n` +
        `    // use_build_context_synchronously（本仓 analyze 常绿，不新增 lint）。\n` +
        `    if (!mounted) return;\n` +
        `    final client = context.read<ApiClient>();\n` +
        `    try {\n` +
        `      final uploaded = await client.uploadFile(file.path!, file.name);\n` +
        `      await client.post('/${ctx.plural}/\$ownerId/attachments', data: {\n` +
        `        'field': '${n}',\n` +
        `        'storageKey': uploaded['filename'],\n` +
        `        'originalName': uploaded['originalName'] ?? file.name,\n` +
        `        'mimeType': uploaded['mimeType'] ?? 'application/octet-stream',\n` +
        `        'size': uploaded['size'] ?? 0,\n` +
        `      });\n` +
        `      if (mounted) context.read<${ctx.pluralPascal}Provider>().load();\n` +
        `    } catch (e) {\n` +
        `      debugPrint('attach ${n} failed: \$e');\n` +
        `    }\n` +
        `  }\n` +
        `\n  ///\n` +
        `  /// Opens this row's attachment menu: one destructive entry per attachment (revoking it),\n` +
        `  /// plus an entry that uploads a new one. A menu rather than one button per attachment —\n` +
        `  /// a field can hold many, and the row's trailing area is already crowded.\n` +
        `  ///\n` +
        `  /// 打开该行的附件菜单：每个附件一条可撤销项，外加一条上传新附件。做成菜单而不是\n` +
        `  /// 每个附件一个按钮 —— 一个字段可以挂很多个，而行的尾部已经很挤。\n` +
        `  ///\n` +
        `  Future<void> _attachmentMenu${toPascal(n)}(${ctx.singlePascal}Model item) async {\n` +
        `    final l10n = context.l10n;\n` +
        `    final action = await showCupertinoModalPopup<String>(\n` +
        `      context: context,\n` +
        `      builder: (sheetContext) => CupertinoActionSheet(\n` +
        `        title: Text(l10n.${ctx.plural}AttachmentMenuTitle),\n` +
        `        actions: <Widget>[\n` +
        `          for (final a in item.${n}Attachments)\n` +
        `            CupertinoActionSheetAction(\n` +
        `              isDestructiveAction: true,\n` +
        `              onPressed: () => Navigator.pop(sheetContext, 'revoke:\${a.id}'),\n` +
        `              child: Text('\${a.name} · \${l10n.${ctx.plural}AttachmentRevoke}'),\n` +
        `            ),\n` +
        `          CupertinoActionSheetAction(\n` +
        `            onPressed: () => Navigator.pop(sheetContext, 'upload'),\n` +
        `            child: Text(l10n.uploadFile),\n` +
        `          ),\n` +
        `        ],\n` +
        `        cancelButton: CupertinoActionSheetAction(\n` +
        `          onPressed: () => Navigator.pop(sheetContext),\n` +
        `          child: Text(l10n.cancel),\n` +
        `        ),\n` +
        `      ),\n` +
        `    );\n` +
        `    if (!mounted || action == null) return;\n` +
        `    if (action == 'upload') {\n` +
        `      await _attach${toPascal(n)}(item.id);\n` +
        `      return;\n` +
        `    }\n` +
        `    await _revoke${toPascal(n)}(item.id, int.parse(action.substring('revoke:'.length)));\n` +
        `  }\n` +
        `\n  ///\n` +
        `  /// Revokes one association (soft delete on the server) after the user confirms.\n` +
        `  ///\n` +
        `  /// 用户确认后撤销一条关联（服务端软删）。\n` +
        `  ///\n` +
        `  Future<void> _revoke${toPascal(n)}(int ownerId, int attachmentId) async {\n` +
        `    if (!mounted) return;\n` +
        `    final l10n = context.l10n;\n` +
        `    final client = context.read<ApiClient>();\n` +
        `    final confirmed = await showCupertinoDialog<bool>(\n` +
        `      context: context,\n` +
        `      builder: (dialogContext) => CupertinoAlertDialog(\n` +
        `        content: Text(l10n.${ctx.plural}AttachmentRevokeConfirm),\n` +
        `        actions: <Widget>[\n` +
        `          CupertinoDialogAction(\n` +
        `            onPressed: () => Navigator.pop(dialogContext, false),\n` +
        `            child: Text(l10n.cancel),\n` +
        `          ),\n` +
        `          CupertinoDialogAction(\n` +
        `            isDestructiveAction: true,\n` +
        `            onPressed: () => Navigator.pop(dialogContext, true),\n` +
        `            child: Text(l10n.confirm),\n` +
        `          ),\n` +
        `        ],\n` +
        `      ),\n` +
        `    );\n` +
        `    if (confirmed != true) return;\n` +
        `    try {\n` +
        `      await client.delete('/${ctx.plural}/\$ownerId/attachments/\$attachmentId');\n` +
        `      if (mounted) context.read<${ctx.pluralPascal}Provider>().load();\n` +
        `    } catch (e) {\n` +
        `      debugPrint('revoke ${n} failed: \$e');\n` +
        `    }\n` +
        `  }\n`,
    )
    .join('');
  const attachButtons = attControls
    .map(
      (n) =>
        `          CupertinoButton(\n` +
        `            padding: EdgeInsets.zero,\n` +
        `            minimumSize: const Size(32, 32),\n` +
        `            onPressed: () => _attachmentMenu${toPascal(n)}(item),\n` +
        `            child: const Icon(CupertinoIcons.paperclip, size: 18),\n` +
        `          ),\n`,
    )
    .join('');
  const listTrailing =
    attControls.length === 0
      ? `CupertinoButton(\n                        padding: EdgeInsets.zero,\n                        minimumSize: const Size(32, 32),\n                        onPressed: () => _onDelete(item.id),\n                        child: const Icon(\n                          CupertinoIcons.trash,\n                          size: 18,\n                          color: CupertinoColors.destructiveRed,\n                        ),\n                      )`
      : `Row(\n                        mainAxisSize: MainAxisSize.min,\n                        children: [\n${attachButtons}          CupertinoButton(\n            padding: EdgeInsets.zero,\n            minimumSize: const Size(32, 32),\n            onPressed: () => _onDelete(item.id),\n            child: const Icon(\n              CupertinoIcons.trash,\n              size: 18,\n              color: CupertinoColors.destructiveRed,\n            ),\n          ),\n                        ],\n                      )`;
  const reads = ctx.fields.map((f) => FORM_READ[f.type](f.name, f)).join('\n');
  const titleField = ctx.fields.length > 0 ? ctx.fields[0].name : 'id';

  return `import 'package:flutter/cupertino.dart';
${pageExtraImports}${filePickerImport}${moneyImport}import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
${modelImport}import '../providers/${ctx.plural}_provider.dart';

/// ${ctx.label}页
class ${ctx.pluralPascal}Page extends StatefulWidget {
  const ${ctx.pluralPascal}Page({super.key});

  @override
  State<${ctx.pluralPascal}Page> createState() => _${ctx.pluralPascal}PageState();
}

class _${ctx.pluralPascal}PageState extends State<${ctx.pluralPascal}Page> {
${controllers}
${refStateFields}
${labelMethods}${echoMethod}${attachMethods}

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<${ctx.pluralPascal}Provider>().load();
    });
${refOptionFetch}  }

  @override
  void dispose() {
    ${ctx.fields
      .filter((f) => f.type !== 'bool' && f.type !== 'enum' && f.type !== 'attachment')
      // 控制器变量名必须与 FORM_CONTROLLERS 一致：ref 用外键列名（customerIdCtrl），
      // 不是字段名 —— 否则这里会 dispose 一个不存在的变量，产物编译不过。
      .map((f) => `${f.type === 'ref' ? `_${refColumnName(f.name)}Ctrl` : `_${f.name}Ctrl`}.dispose();`)
      .join('\n    ')}
    super.dispose();
  }

  Future<void> _onAdd() async {
    final l10n = context.l10n;
    await showCupertinoModalPopup<void>(
      context: context,
      builder: (ctx) => Padding(
        padding: EdgeInsets.only(bottom: MediaQuery.of(ctx).viewInsets.bottom),
        child: CupertinoActionSheet(
          title: Text(l10n.${ctx.plural}AddTitle),
          message: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              const SizedBox(height: 8),
${formFields}
            ],
          ),
          actions: [
            CupertinoActionSheetAction(
              isDefaultAction: true,
              onPressed: () async {
                final data = <String, dynamic>{};
${reads}
                final ok = await ctx.read<${ctx.pluralPascal}Provider>().add(data);
                if (ctx.mounted) Navigator.pop(ctx, ok);
              },
              child: const Text('保存'),
            ),
            CupertinoActionSheetAction(
              onPressed: () => Navigator.pop(ctx),
              child: const Text('取消'),
            ),
          ],
        ),
      ),
    );
  }

  Future<void> _onDelete(int id) async {
    final l10n = context.l10n;
    final confirmed = await showCupertinoDialog<bool>(
      context: context,
      builder: (ctx) => CupertinoAlertDialog(
        title: Text(l10n.${ctx.plural}DeleteConfirm),
        actions: [
          CupertinoDialogAction(child: Text(l10n.cancel), onPressed: () => Navigator.pop(ctx, false)),
          CupertinoDialogAction(
            isDestructiveAction: true,
            child: Text(l10n.delete),
            onPressed: () => Navigator.pop(ctx, true),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await context.read<${ctx.pluralPascal}Provider>().remove(id);
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<${ctx.pluralPascal}Provider>();
    final items = provider.items;

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.${ctx.plural}Title),
        trailing: CupertinoButton(
          padding: EdgeInsets.zero,
          minimumSize: const Size(36, 36),
          onPressed: _onAdd,
          child: Icon(
            CupertinoIcons.add,
            size: 24,
            color: CupertinoTheme.of(context).primaryColor,
          ),
        ),
      ),
      child: provider.loading && items.isEmpty
          ? const Center(child: CupertinoActivityIndicator())
          : items.isEmpty
              ? Center(child: Text(l10n.${ctx.plural}Empty, style: const TextStyle(fontSize: 16)))
              : ListView.separated(
                  itemCount: items.length,
                  separatorBuilder: (_, _) => Container(
                    height: 1,
                    margin: const EdgeInsets.only(left: 16),
                    color: CupertinoColors.systemGrey.withAlpha(30),
                  ),
                  itemBuilder: (_, i) {
                    final item = items[i];
                    final title = item.${titleField}.toString();
                    return CupertinoListTile(
                      title: Text(title),${listSubtitle}
                      trailing: ${listTrailing},
                    );
                  },
                ),
    );
  }
}
`;
}

/** 全部前端文件：{ relativePath, content }。 */
export function frontendFiles(ctx) {
  return [
    { path: `features/${ctx.plural}/data/models/${ctx.singular}_model.dart`, content: modelTemplate(ctx) },
    { path: `features/${ctx.plural}/data/repositories/${ctx.plural}_repository.dart`, content: repositoryTemplate(ctx) },
    { path: `features/${ctx.plural}/presentation/providers/${ctx.plural}_provider.dart`, content: providerTemplate(ctx) },
    { path: `features/${ctx.plural}/presentation/pages/${ctx.plural}_page.dart`, content: pageTemplate(ctx) },
  ];
}
