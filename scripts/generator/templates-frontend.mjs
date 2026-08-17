/**
 * EASY-2 前端模板：按 todos feature 约定生成 4 个文件。
 * 每个函数接收 buildContext 的 ctx，返回文件内容字符串。
 */

// ─── Model 字段映射 ──────────────────────────────────────────────────────────
const MODEL_FIELD = {
  string: (c) => ({
    decl: `  final String ${c};`,
    ctor: `required this.${c}`,
    from: `      ${c}: json['${c}'] as String,`,
    to: `        '${c}': ${c},`,
  }),
  text: (c) => ({
    decl: `  final String? ${c};`,
    ctor: `this.${c}`,
    from: `      ${c}: json['${c}'] as String?,`,
    to: `        '${c}': ${c},`,
  }),
  int: (c) => ({
    decl: `  final int? ${c};`,
    ctor: `this.${c}`,
    from: `      ${c}: json['${c}'] as int?,`,
    to: `        '${c}': ${c},`,
  }),
  bool: (c) => ({
    decl: `  final bool ${c};`,
    ctor: `this.${c} = false`,
    from: `      ${c}: json['${c}'] as bool? ?? false,`,
    to: `        '${c}': ${c},`,
  }),
  date: (c) => ({
    decl: `  final String? ${c};`,
    ctor: `this.${c}`,
    from: `      ${c}: json['${c}'] as String?,`,
    to: `        '${c}': ${c},`,
  }),
  enum: (c, f) => ({
    decl: `  final String ${c};`,
    ctor: `this.${c} = '${f.enum[0]}'`,
    from: `      ${c}: json['${c}'] as String? ?? '${f.enum[0]}',`,
    to: `        '${c}': ${c},`,
  }),
};

export function modelTemplate(ctx) {
  const decls = ctx.fields.map((f) => MODEL_FIELD[f.type](f.name, f).decl).join('\n');
  const ctors = ctx.fields.map((f) => `    ${MODEL_FIELD[f.type](f.name, f).ctor},`).join('\n');
  const froms = ctx.fields.map((f) => MODEL_FIELD[f.type](f.name, f).from).join('\n');
  const tos = ctx.fields.map((f) => MODEL_FIELD[f.type](f.name, f).to).join('\n');
  const copyParams = ctx.fields.map((f) => {
    const m = MODEL_FIELD[f.type](f.name, f);
    const type = m.decl.replace(/^  final /, '').replace(/;/, '');
    return `${f.name}: ${type} ?? this.${f.name}`;
  }).join(',\n    ');

  return `class ${ctx.singlePascal}Model {
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
    ${ctx.fields.map((f) => `${f.name} = const Object()`).join(',\n    ')}
  }) {
    return ${ctx.singlePascal}Model(
      id: id,
${ctx.fields.map((f) => `      ${f.name}: ${f.name} == const Object() ? this.${f.name} : ${f.name} as dynamic,`).join('\n')}
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
                child: Text(o),
              ),
            },
          ),`,
};

const FORM_CONTROLLERS = {
  string: (c) => `  final _${c}Ctrl = TextEditingController();`,
  text: (c) => `  final _${c}Ctrl = TextEditingController();`,
  int: (c) => `  final _${c}Ctrl = TextEditingController();`,
  bool: (c) => `  bool _${c}Val = false;`,
  date: (c) => `  final _${c}Ctrl = TextEditingController();`,
  enum: (c, f) => `  String _${c}Val = '${f.enum[0]}';`,
};

const FORM_READ = {
  string: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = _${c}Ctrl.text.trim();`,
  text: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = _${c}Ctrl.text.trim();`,
  int: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = int.tryParse(_${c}Ctrl.text.trim());`,
  bool: (c) => `data['${c}'] = _${c}Val;`,
  date: (c) => `if (_${c}Ctrl.text.isNotEmpty) data['${c}'] = _${c}Ctrl.text.trim();`,
  enum: (c) => `data['${c}'] = _${c}Val;`,
};

export function pageTemplate(ctx) {
  const controllers = ctx.fields.map((f) => FORM_CONTROLLERS[f.type](f.name, f)).join('\n');
  const formFields = ctx.fields.map((f) => FORM_FIELD[f.type](f.name, null, f)).join('\n\n');
  const reads = ctx.fields.map((f) => FORM_READ[f.type](f.name, f)).join('\n');
  const titleField = ctx.fields.length > 0 ? ctx.fields[0].name : 'id';

  return `import 'package:flutter/cupertino.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/${ctx.plural}_provider.dart';

/// ${ctx.label}页
class ${ctx.pluralPascal}Page extends StatefulWidget {
  const ${ctx.pluralPascal}Page({super.key});

  @override
  State<${ctx.pluralPascal}Page> createState() => _${ctx.pluralPascal}PageState();
}

class _${ctx.pluralPascal}PageState extends State<${ctx.pluralPascal}Page> {
${controllers}

  @override
  void initState() {
    super.initState();
    Future.microtask(() {
      if (mounted) context.read<${ctx.pluralPascal}Provider>().load();
    });
  }

  @override
  void dispose() {
    ${ctx.fields.filter((f) => f.type !== 'bool' && f.type !== 'enum').map((f) => `_${f.name}Ctrl.dispose();`).join('\n    ')}
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
                      title: Text(title),
                      trailing: CupertinoButton(
                        padding: EdgeInsets.zero,
                        minimumSize: const Size(32, 32),
                        onPressed: () => _onDelete(item.id),
                        child: const Icon(
                          CupertinoIcons.trash,
                          size: 18,
                          color: CupertinoColors.destructiveRed,
                        ),
                      ),
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
