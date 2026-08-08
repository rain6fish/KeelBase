#!/usr/bin/env bash
#
# UX-3 Flutter 模块脚手架生成器
#
# 用法:
#   ./tool/generate_feature.sh <feature_name>      e.g. ./tool/generate_feature.sh my_feature
#
# 生成 (对齐项目 Clean Architecture 约定, 见 CLAUDE.md §3.2):
#   lib/features/<feature_name>/
#   ├── data/models/<feature_name>_model.dart
#   ├── data/repositories/<feature_name>_repository.dart
#   ├── presentation/pages/<feature_name>_page.dart
#   └── presentation/providers/<feature_name>_provider.dart
#
# 生成后仍需手动: main.dart 注册 Provider, i18n 文案, 路由注册。

set -euo pipefail
cd "$(dirname "$0")/.."

FEATURE="${1:?用法: ./tool/generate_feature.sh <feature_name>}"

# snake_case → PascalCase (my_feature → MyFeature)
PASCAL="$(echo "$FEATURE" | awk -F_ '{for(i=1;i<=NF;i++){$i=toupper(substr($i,1,1)) substr($i,2)}}1' | tr -d ' ')"

BASE_DIR="lib/features/$FEATURE"
mkdir -p "$BASE_DIR/data/models" "$BASE_DIR/data/repositories" "$BASE_DIR/presentation/pages" "$BASE_DIR/presentation/providers"

emit() { # emit <file> <<'EOF' ... EOF
  local file="$1"
  cat > "$file"
  # 替换占位符
  sed -i "s/__PASCAL__/$PASCAL/g; s/__FEATURE__/$FEATURE/g" "$file"
}

emit "$BASE_DIR/data/models/${FEATURE}_model.dart" <<'EOF'
class __PASCAL__Model {
  final int id;
  final String title;

  const __PASCAL__Model({required this.id, required this.title});

  factory __PASCAL__Model.fromJson(Map<String, dynamic> json) => __PASCAL__Model(
        id: json['id'] as int,
        title: json['title'] as String,
      );

  Map<String, dynamic> toJson() => {'id': id, 'title': title};
}
EOF

emit "$BASE_DIR/data/repositories/${FEATURE}_repository.dart" <<'EOF'
import '../../../../core/api/api_client.dart';
import '../../../../core/api/api_response.dart';
import '../models/__FEATURE___model.dart';

class __PASCAL__Repository {
  final ApiClient _client;

  __PASCAL__Repository(this._client);

  Future<List<__PASCAL__Model>> getAll() async {
    final json = await _client.get('/__FEATURE__');
    final response = ApiResponse.fromJson(json, (data) {
      if (data is List) {
        return data
            .map((e) => __PASCAL__Model.fromJson(e as Map<String, dynamic>))
            .toList();
      }
      return <__PASCAL__Model>[];
    });
    return response.data ?? [];
  }
}
EOF

emit "$BASE_DIR/presentation/providers/${FEATURE}_provider.dart" <<'EOF'
import 'package:flutter/foundation.dart';
import '../../data/models/__FEATURE___model.dart';
import '../../data/repositories/__FEATURE___repository.dart';

class __PASCAL__Provider extends ChangeNotifier {
  final __PASCAL__Repository _repository;

  __PASCAL__Provider(this._repository);

  List<__PASCAL__Model> _items = [];
  bool _loading = false;
  String? _error;

  List<__PASCAL__Model> get items => _items;
  bool get loading => _loading;
  String? get error => _error;

  Future<void> load() async {
    _loading = true;
    _error = null;
    notifyListeners();
    try {
      _items = await _repository.getAll();
    } catch (e) {
      _error = e.toString();
    } finally {
      _loading = false;
      notifyListeners();
    }
  }
}
EOF

emit "$BASE_DIR/presentation/pages/${FEATURE}_page.dart" <<'EOF'
import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/__FEATURE___provider.dart';

class __PASCAL__Page extends StatelessWidget {
  const __PASCAL__Page({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final provider = context.watch<__PASCAL__Provider>();

    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => context.canPop() ? context.pop() : null,
        ),
        middle: Text(l10n.tabHome),
      ),
      child: provider.loading
          ? const Center(child: CupertinoActivityIndicator())
          : provider.error != null
              ? Text(provider.error!)
              : ListView.builder(
                  itemCount: provider.items.length,
                  itemBuilder: (_, i) =>
                      CupertinoListTile(title: Text(provider.items[i].title)),
                ),
    );
  }
}
EOF

echo "✓ 已生成 feature '$FEATURE' → $BASE_DIR"
echo "  下一步: main.dart 注册 Provider / i18n 文案 / app_router 路由"
