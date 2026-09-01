// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../data/legal_text.dart';

class TermsOfServicePage extends StatelessWidget {
  const TermsOfServicePage({super.key});

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final text = l10n.isZh ? LegalText.termsOfServiceZH : LegalText.termsOfServiceEN;
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(l10n.termsOfService),
        leading: CupertinoNavigationBarBackButton(
          previousPageTitle: l10n.back,
          onPressed: () => context.canPop() ? context.pop() : context.go('/profile'),
        ),
      ),
      child: SafeArea(
        child: SingleChildScrollView(
          padding: const EdgeInsets.all(20),
          child: _buildContent(text),
        ),
      ),
    );
  }

  Widget _buildContent(String raw) {
    final lines = raw.split('\n');
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: lines.map((line) {
        if (line.startsWith('# ')) {
          return Padding(
            padding: const EdgeInsets.only(top: 8, bottom: 16),
            child: Text(line.substring(2), style: const TextStyle(fontSize: 24, fontWeight: FontWeight.w700)),
          );
        } else if (line.startsWith('## ')) {
          return Padding(
            padding: const EdgeInsets.only(top: 20, bottom: 8),
            child: Text(line.substring(3), style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w600)),
          );
        } else if (line.startsWith('- **')) {
          final rest = line.substring(4);
          final parts = rest.split('**');
          if (parts.length >= 2) {
            return Padding(
              padding: const EdgeInsets.only(left: 8, top: 4, bottom: 4),
              child: Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  const Text('• ', style: TextStyle(fontSize: 15)),
                  Expanded(
                    child: Text.rich(
                      TextSpan(
                        style: const TextStyle(fontSize: 15, height: 1.5),
                        children: [
                          TextSpan(text: parts[0].trim(), style: const TextStyle(fontWeight: FontWeight.w600)),
                          TextSpan(text: parts[1]),
                        ],
                      ),
                    ),
                  ),
                ],
              ),
            );
          }
          return _body(line);
        } else if (line.startsWith('- ')) {
          return Padding(
            padding: const EdgeInsets.only(left: 8, top: 4, bottom: 4),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                const Text('• ', style: TextStyle(fontSize: 15)),
                Expanded(child: Text(line.substring(2), style: const TextStyle(fontSize: 15, height: 1.5))),
              ],
            ),
          );
        } else if (line.trim().isEmpty) {
          return const SizedBox(height: 4);
        } else {
          return _body(line);
        }
      }).toList(),
    );
  }

  Widget _body(String line) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 2),
      child: Text(line, style: const TextStyle(fontSize: 15, height: 1.6)),
    );
  }
}
