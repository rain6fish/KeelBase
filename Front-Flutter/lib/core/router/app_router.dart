import 'package:flutter/foundation.dart' show Listenable;
import 'package:go_router/go_router.dart';
import '../../features/auth/presentation/providers/auth_provider.dart';
import '../../features/onboarding/presentation/providers/onboarding_provider.dart';
import '../../features/auth/presentation/pages/login_page.dart';
import '../../features/auth/presentation/pages/register_page.dart';
import '../../features/auth/presentation/pages/forgot_password_page.dart';
import '../../features/auth/presentation/pages/reset_password_page.dart';
import '../../features/auth/presentation/pages/verify_email_page.dart';
import '../../features/splash/presentation/pages/splash_page.dart';
import '../../features/dashboard/presentation/pages/dashboard_page.dart';
import '../../features/events/presentation/pages/events_list_page.dart';
import '../../features/events/presentation/pages/event_form_page.dart';
import '../../features/explore/presentation/pages/explore_page.dart';
import '../../features/ai/presentation/pages/ai_chat_page.dart';
import '../../features/todos/presentation/pages/todos_page.dart';
import '../../features/suppliers/presentation/pages/suppliers_page.dart';
import '../../features/flows/presentation/pages/flow_tasks_page.dart';
import '../../features/tags/presentation/pages/tags_page.dart';
import '../../features/notes/presentation/pages/notes_page.dart';
import '../../features/books/presentation/pages/books_page.dart';
import '../../features/posts/presentation/pages/posts_page.dart';
import '../../features/crm/presentation/pages/customers_page.dart';
import '../../features/crm/presentation/pages/customer_detail_page.dart';
import '../../features/pm/presentation/pages/projects_page.dart';
import '../../features/pm/presentation/pages/project_detail_page.dart';
import '../../features/approval/presentation/pages/approval_requests_page.dart';
import '../../features/approval/presentation/pages/approval_request_detail_page.dart';

import '../../features/ai/presentation/pages/ai_conversation_history_page.dart';
import '../../features/profile/presentation/pages/profile_page.dart';
import '../../features/profile/presentation/pages/profile_edit_page.dart';
import '../../features/org/presentation/pages/my_org_page.dart';
import '../../features/points/presentation/pages/points_page.dart';
import '../../features/auth/presentation/pages/bind_phone_page.dart';
import '../../features/notifications/presentation/pages/notifications_page.dart';
import '../../features/settings/presentation/pages/settings_page.dart';
import '../../features/feedback/presentation/pages/feedback_page.dart';
import '../../features/forms/presentation/pages/dynamic_form_page.dart';
import '../../features/sessions/presentation/pages/session_list_page.dart';
import '../../features/search/presentation/pages/search_page.dart';
import '../../features/upload/presentation/pages/upload_page.dart';
import '../../features/legal/presentation/pages/privacy_policy_page.dart';
import '../../features/legal/presentation/pages/terms_of_service_page.dart';
import '../../features/onboarding/presentation/pages/onboarding_page.dart';
import '../widgets/app_shell.dart';

GoRouter createRouter(
  AuthProvider authProvider,
  OnboardingProvider onboardingProvider,
) {
  return GoRouter(
    initialLocation: '/splash',
    refreshListenable: Listenable.merge([authProvider, onboardingProvider]),
    redirect: (context, state) {
      final isLoggedIn = authProvider.isAuthenticated;
      final authStatus = authProvider.status;
      final onboardingLoaded = onboardingProvider.loaded;
      final path = state.matchedLocation;
      // 用精确路径匹配，避免 /reset-password、/register-verify 等前缀误判为认证路由
      final isAuthRoute = path == '/login' ||
          path == '/register' ||
          path == '/forgot-password' ||
          path == '/reset' ||
          path == '/verify-email';
      final isPublicRoute = path == '/privacy' || path == '/terms';
      final isSplash = path == '/splash';
      final isOnboarding = path == '/onboarding';

      // Public routes (privacy policy, terms of service) are accessible
      // to both authenticated and unauthenticated users
      if (isPublicRoute) return null;

      // 自动登录/引导检查未完成前，延迟所有路由的重定向决策，
      // 避免 deep link（如 /events/3/edit）在自动登录期间被提前踢回 /login。
      // AuthStatus.error 不属于“未完成”，会正常落入后续分支，不会卡死在 splash。
      if (authStatus == AuthStatus.initial ||
          authStatus == AuthStatus.loading ||
          (isSplash && !onboardingLoaded)) {
        return null;
      }
      // After auto-login completes, redirect splash to final destination
      if (isSplash) {
        // UX-8：首次启动（未登录且未看过引导）→ 引导页；已登录直接进首页
        return isLoggedIn ? '/' : (onboardingProvider.seen ? '/login' : '/onboarding');
      }
      // Onboarding only for logged-out users who haven't seen it
      if (isOnboarding) {
        if (isLoggedIn) return '/';
        return null;
      }
      if (!isLoggedIn && !isAuthRoute) return '/login';
      if (isLoggedIn && isAuthRoute) return '/';
      return null;
    },
    routes: [
      GoRoute(
        path: '/splash',
          builder: (_, _) => const SplashPage(),
      ),
      GoRoute(
        path: '/onboarding',
          builder: (_, _) => const OnboardingPage(),
      ),
      GoRoute(
        path: '/login',
          builder: (_, _) => const LoginPage(),
      ),
      GoRoute(
        path: '/register',
          builder: (_, _) => const RegisterPage(),
      ),
      GoRoute(
        path: '/forgot-password',
          builder: (_, _) => const ForgotPasswordPage(),
      ),
      GoRoute(
        path: '/reset',
        builder: (_, state) => ResetPasswordPage(
          token: state.uri.queryParameters['token'] ?? '',
        ),
      ),
      GoRoute(
        path: '/verify-email',
        builder: (_, state) => VerifyEmailPage(
          email: state.uri.queryParameters['email'] ?? '',
        ),
      ),
      GoRoute(
        path: '/notifications',
        builder: (_, _) => const NotificationsPage(),
      ),
      StatefulShellRoute.indexedStack(
        builder: (_, _, navigationShell) =>
            AppShell(navigationShell: navigationShell),
        branches: [
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/',
                pageBuilder: (_, _) => const NoTransitionPage(child: DashboardPage()),
                routes: [
                  GoRoute(
                    path: 'settings',
                    builder: (_, _) => const SettingsPage(),
                  ),
                  GoRoute(
                    path: 'feedback',
                    builder: (_, _) => const FeedbackPage(),
                  ),
                  GoRoute(
                    path: 'form/:slug',
                    builder: (_, state) => DynamicFormPage(slug: state.pathParameters['slug'] ?? ''),
                  ),
                  GoRoute(
                    path: 'sessions',
                    builder: (_, _) => const SessionListPage(),
                  ),
                  GoRoute(
                    path: 'profile',
                    builder: (_, _) => const ProfilePage(),
                    routes: [
                      GoRoute(
                        path: 'edit',
                        builder: (_, _) => const ProfileEditPage(),
                      ),
                      GoRoute(
                        path: 'bind-phone',
                        builder: (_, _) => const BindPhonePage(),
                      ),
                    ],
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/events',
                pageBuilder: (_, _) => const NoTransitionPage(child: EventsListPage()),
                routes: [
                  GoRoute(
                    path: 'create',
                    builder: (_, _) => const EventFormPage(),
                  ),
                  GoRoute(
                    path: ':id/edit',
                    // 无效的 id 直接回事件列表，避免静默进入“创建”模式导致重复创建
                    redirect: (_, state) {
                      final id =
                          int.tryParse(state.pathParameters['id'] ?? '');
                      return id == null ? '/events' : null;
                    },
                    builder: (_, state) => EventFormPage(
                      eventId: int.tryParse(state.pathParameters['id'] ?? ''),
                    ),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/explore',
                pageBuilder: (_, _) => const NoTransitionPage(child: ExplorePage()),
                routes: [
                  GoRoute(
                    path: 'upload',
                    builder: (_, _) => const UploadPage(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/ai',
                pageBuilder: (_, _) => const NoTransitionPage(child: AiChatPage()),
                routes: [
                  GoRoute(
                    path: 'history',
                    builder: (_, _) => const AiConversationHistoryPage(),
                  ),
                ],
              ),
            ],
          ),
          StatefulShellBranch(
            routes: [
              GoRoute(
                path: '/todos',
                pageBuilder: (_, _) => const NoTransitionPage(child: TodosPage()),
              ),
            ],
          ),
        ],
      ),
      // 离开 Shell 的页面：全屏阅读类页面，无底部 Tab Bar
      GoRoute(
        path: '/upload',
        builder: (_, _) => const UploadPage(),
      ),
      GoRoute(
        path: '/search',
        builder: (_, _) => const SearchPage(),
      ),
      GoRoute(
        path: '/flows/tasks',
        builder: (_, _) => const FlowTasksPage(),
      ),
      // 我的组织（ORG-7，只读通讯录）
      GoRoute(
        path: '/my-org',
        builder: (_, _) => const MyOrgPage(),
      ),
      // 积分 / 签到（GROWTH-3）
      GoRoute(
        path: '/points',
        builder: (_, _) => const PointsPage(),
      ),
      // 帖子（EASY-2 生成）
      GoRoute(
        path: '/posts',
        builder: (_, _) => const PostsPage(),
      ),
      // AI CRM 旗舰应用
      GoRoute(
        path: '/crm',
        builder: (_, _) => const CustomersPage(),
      ),
      GoRoute(
        path: '/crm/customers/:id',
        builder: (_, state) => CustomerDetailPage(
          customerId: int.parse(state.pathParameters['id']!),
        ),
      ),
      // AI Project Management 旗舰应用
      GoRoute(
        path: '/pm',
        builder: (_, _) => const ProjectsPage(),
      ),
      GoRoute(
        path: '/pm/projects/:id',
        builder: (_, state) => ProjectDetailPage(
          projectId: int.parse(state.pathParameters['id']!),
        ),
      ),
      // AI Approval 旗舰应用
      GoRoute(
        path: '/approval',
        builder: (_, _) => const ApprovalRequestsPage(),
      ),
      GoRoute(
        path: '/approval/requests/:id',
        builder: (_, state) => ApprovalRequestDetailPage(
          requestId: int.parse(state.pathParameters['id']!),
        ),
      ),
      // 图书（EASY-2 生成）
      GoRoute(
        path: '/books',
        builder: (_, _) => const BooksPage(),
      ),
      // 笔记（EASY-2 生成）
      GoRoute(
        path: '/notes',
        builder: (_, _) => const NotesPage(),
      ),
      // 标签（EASY-2 生成）
      GoRoute(
        path: '/tags',
        builder: (_, _) => const TagsPage(),
      ),
      // 供应商（EASY-2 生成）
      GoRoute(
        path: '/suppliers',
        builder: (_, _) => const SuppliersPage(),
      ),
      // Legal pages
      GoRoute(
        path: '/privacy',
        builder: (_, _) => const PrivacyPolicyPage(),
      ),
      GoRoute(
        path: '/terms',
        builder: (_, _) => const TermsOfServicePage(),
      ),
    ],
  );
}
