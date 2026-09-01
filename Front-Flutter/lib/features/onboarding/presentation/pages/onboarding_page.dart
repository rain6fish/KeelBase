// SPDX-License-Identifier: Apache-2.0

import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../providers/onboarding_provider.dart';

/// UX-8 Onboarding 首次引导页：三页功能介绍，可跳过。
/// 完成（或跳过）后标记已看并跳转登录页。
class OnboardingPage extends StatefulWidget {
  const OnboardingPage({super.key});

  @override
  State<OnboardingPage> createState() => _OnboardingPageState();
}

class _OnboardingPageState extends State<OnboardingPage> {
  final _pageController = PageController();
  int _current = 0;

  @override
  void dispose() {
    _pageController.dispose();
    super.dispose();
  }

  Future<void> _finish() async {
    await context.read<OnboardingProvider>().markSeen();
    if (!mounted) return;
    context.go('/login');
  }

  void _next() {
    if (_current < 2) {
      _pageController.nextPage(
        duration: const Duration(milliseconds: 300),
        curve: Curves.easeOut,
      );
    } else {
      _finish();
    }
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    final theme = CupertinoTheme.of(context);
    final pages = [
      (
        icon: CupertinoIcons.sparkles,
        color: CupertinoColors.systemBlue,
        title: l10n.onboardingWelcomeTitle,
        desc: l10n.onboardingWelcomeDesc,
      ),
      (
        icon: CupertinoIcons.calendar,
        color: CupertinoColors.systemGreen,
        title: l10n.onboardingEventsTitle,
        desc: l10n.onboardingEventsDesc,
      ),
      (
        icon: CupertinoIcons.chat_bubble_2_fill,
        color: CupertinoColors.systemPurple,
        title: l10n.onboardingAiTitle,
        desc: l10n.onboardingAiDesc,
      ),
    ];

    return CupertinoPageScaffold(
      child: SafeArea(
        child: Column(
          children: [
            // 跳过按钮
            Align(
              alignment: Alignment.topRight,
              child: Padding(
                padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 8),
                child: CupertinoButton(
                  padding: EdgeInsets.zero,
                  onPressed: _finish,
                  child: Text(l10n.onboardingSkip,
                      style: TextStyle(color: CupertinoColors.systemGrey.resolveFrom(context))),
                ),
              ),
            ),
            // 页面
            Expanded(
              child: PageView.builder(
                controller: _pageController,
                itemCount: pages.length,
                onPageChanged: (i) => setState(() => _current = i),
                itemBuilder: (_, i) {
                  final p = pages[i];
                  return Padding(
                    padding: const EdgeInsets.symmetric(horizontal: 40),
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Container(
                          width: 120,
                          height: 120,
                          decoration: BoxDecoration(
                            color: p.color.withAlpha(24),
                            shape: BoxShape.circle,
                          ),
                          child: Icon(p.icon, size: 56, color: p.color),
                        ),
                        const SizedBox(height: 32),
                        Text(p.title,
                            textAlign: TextAlign.center,
                            style: theme.textTheme.navLargeTitleTextStyle
                                .copyWith(fontSize: 24, fontWeight: FontWeight.w700)),
                        const SizedBox(height: 12),
                        Text(p.desc,
                            textAlign: TextAlign.center,
                            style: TextStyle(
                              fontSize: 15,
                              height: 1.5,
                              color: CupertinoColors.systemGrey.resolveFrom(context),
                            )),
                      ],
                    ),
                  );
                },
              ),
            ),
            // 指示点
            Row(
              mainAxisAlignment: MainAxisAlignment.center,
              children: List.generate(pages.length, (i) {
                final active = i == _current;
                return AnimatedContainer(
                  duration: const Duration(milliseconds: 200),
                  margin: const EdgeInsets.symmetric(horizontal: 4),
                  width: active ? 20 : 8,
                  height: 8,
                  decoration: BoxDecoration(
                    color: active ? theme.primaryColor : CupertinoColors.systemGrey.withAlpha(80),
                    borderRadius: BorderRadius.circular(4),
                  ),
                );
              }),
            ),
            // 下一步 / 开始
            Padding(
              padding: const EdgeInsets.all(24),
              child: SizedBox(
                width: double.infinity,
                child: CupertinoButton.filled(
                  borderRadius: BorderRadius.circular(14),
                  onPressed: _next,
                  child: Text(_current == 2 ? l10n.onboardingStart : l10n.onboardingNext,
                      style: const TextStyle(fontSize: 16, fontWeight: FontWeight.w600)),
                ),
              ),
            ),
          ],
        ),
      ),
    );
  }
}
