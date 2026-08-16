import 'dart:async';
import 'package:flutter/cupertino.dart';
import 'package:flutter/foundation.dart';

/// 国际化支持：中/英文。
/// 遵循 Flutter 标准 Localizations 管线：注册 AppLocalizations.delegate
/// 后，通过 AppLocalizations.of(context) 获取实例。
class AppLocalizations {
  final Locale locale;

  AppLocalizations(this.locale);

  /// 标准查找方法，由 Localizations widget 提供缓存。
  static AppLocalizations of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations)!;
  }

  /// Flutter 本地化委托，注册到 CupertinoApp.localizationsDelegates。
  static const LocalizationsDelegate<AppLocalizations> delegate =
      _AppLocalizationsDelegate();

  /// 简体中文判定：仅 zh_CN / 无地区 zh / Hans 脚本视为简体中文。
  /// zh_TW / zh_HK 等繁体地区无对应译文，按未支持处理（回退英文）。
  bool get isZh =>
      locale.languageCode == 'zh' &&
      (locale.countryCode == null ||
          locale.countryCode == 'CN' ||
          locale.scriptCode == 'Hans');

  String _t(String en, String zh) => isZh ? zh : en;

  // --- General ---
  String get appName => _t('KeelBase', 'KeelBase');
  String get ok => _t('OK', '确定');
  String get cancel => _t('Cancel', '取消');
  String get confirm => _t('Confirm', '确认');
  String get save => _t('Save', '保存');
  String get delete => _t('Delete', '删除');
  String get edit => _t('Edit', '编辑');
  String get create => _t('Create', '创建');
  String get update => _t('Update', '更新');
  String get loading => _t('Loading...', '加载中...');
  String get retry => _t('Retry', '重试');
  String get submit => _t('Submit', '提交');
  String get done => _t('Done', '完成');
  String get back => _t('Back', '返回');

  // --- Notifications ---
  String get notifications => _t('Notifications', '通知');
  String get markAllRead => _t('Mark all read', '全部已读');
  String get noNotifications => _t('No notifications', '暂无通知');

  // --- Auth ---
  String get login => _t('Login', '登录');
  String get register => _t('Register', '注册');
  String get logout => _t('Logout', '退出登录');
  String get username => _t('Username', '用户名');
  String get password => _t('Password', '密码');

  // --- UX-9 登录页 Slogan + 演示账号 ---
  String get loginSlogan => _t('Business-safe AI full-stack app base', '业务安全的 AI 全栈应用基座');
  String get loginSloganSub => _t('Where AI does real work, only within your data', 'AI 真的会干活，且只在你授权的数据里');
  String get demoAccounts => _t('Demo accounts:', '演示账号：');
  String get demoAccountUser => _t('User alex / 123456', '普通用户 alex / 123456');
  String get demoAccountAdmin => _t('Admin admin / Admin@1234', '管理员 admin / Admin@1234');
  String get nickname => _t('Nickname', '昵称');
  String get loginSuccess => _t('Login successful', '登录成功');
  String get registerSuccess => _t('Registration successful', '注册成功');
  String get logoutConfirm => _t('Are you sure to logout?', '确定要退出登录吗？');
  String get passwordLogin => _t('Password Login', '密码登录');
  String get phoneLogin => _t('Phone Login', '手机号登录');
  String get phoneNumber => _t('Phone number', '手机号');
  String get sendCode => _t('Send code', '获取验证码');
  String get phoneOrCodeInvalid => _t('Enter valid phone and 6-digit code', '请输入正确手机号和 6 位验证码');
  String get phoneRequired => _t('Enter phone number first', '请先输入手机号');
  String get smsCodeSent => _t('Code sent to your phone', '验证码已发送到您的手机');
  String get bindPhone => _t('Bind phone', '绑定手机号');
  String get phoneBound => _t('Phone bound', '手机号已绑定');
  String get deactivateAccount => _t('Deactivate account', '注销账号');
  String get deactivateConfirm => _t('This permanently deletes your account and all data. Enter password to confirm.', '此操作将永久删除您的账号及所有数据，请输入密码确认。');
  String get accountDeactivated => _t('Account deactivated', '账号已注销');
  String get exportData => _t('Export my data', '导出我的数据');
  String get dataExported => _t('Data exported', '数据已导出');
  String get deactivateFailed => _t('Deactivate failed', '注销失败');
  String get noAccount => _t("Don't have an account? ", '还没有账号？');
  String get hasAccount => _t('Already have an account? ', '已有账号？');
  String get usernameRequired => _t('Username is required', '请输入用户名');
  String get passwordRequired => _t('Password is required', '请输入密码');
  String get nicknameRequired => _t('Nickname is required', '请输入昵称');
  String get usernameHint => _t('3-32 chars, letters/numbers/_', '3-32位，字母/数字/下划线');
  String get passwordHint => _t('8+ chars, must include letters & numbers', '至少8位，需包含字母和数字');
  String get nicknameHint => _t('Your display name', '您的显示名称');

  // --- OAuth ---
  String get or => _t('or', '或');
  String get signInWithGoogle => _t('Sign in with Google', '使用 Google 登录');
  String get signInWithApple => _t('Sign in with Apple', '使用 Apple 登录');
  String get internationalLogin => _t('International', '国际');
  String get chinaLogin => _t('China', '国内');

  // --- Agreement ---
  String get agreeLabel => _t('Agree to', '已阅读并同意');
  String get termsOfServiceLink => _t('Terms of Service', '《服务条款》');
  String get privacyPolicyLink => _t('Privacy Policy', '《隐私政策》');
  String get and => _t('and', '和');
  String get agreementRequired => _t('Please agree to the terms first', '请先阅读并同意相关协议');

  // --- Tabs ---
  String get tabHome => _t('Home', '首页');
  String get tabEvents => _t('Events', '事件');
  String get tabMore => _t('More', '更多');
  String get tabExplore => _t('Explore', '发现');
  String get tabProfile => _t('Profile', '我的');
  String get tabTodos => _t('Todos', '待办');

  // --- Todos ---
  String get todoInputHint => _t('Add a todo...', '新增待办…');
  String get todoEmpty => _t('No todos yet', '暂无待办');
  String get deleteTodoConfirm => _t('Delete this todo?', '删除该待办？');

  // --- 审批待办（FLOW-7） ---
  String get flowTasksTitle => _t('Approval Tasks', '审批待办');
  String get flowTasksEmpty => _t('No approval tasks', '暂无审批任务');
  String get flowTaskTitle => _t('Approval Task', '审批任务');
  String get flowApprove => _t('Approve', '通过');
  String get flowReject => _t('Reject', '驳回');
  String get flowNote => _t('Note (optional)', '意见（可选）');
  String get flowOpFailed => _t('Operation failed', '操作失败');

  // ORG-7 我的组织 / 通讯录
  String get myOrgTitle => _t('My Organization', '我的组织');
  String get notInOrg => _t('You are not in any organization yet', '您尚未加入任何组织');
  String get myOrgDept => _t('Departments', '部门');
  String get myOrgMembers => _t('Members', '成员');
  String get noDept => _t('No departments', '暂无部门');
  String get noMember => _t('No members', '暂无成员');
  String get roleOwner => _t('Owner', '所有者');
  String get roleAdmin => _t('Admin', '管理员');
  String get roleMember => _t('Member', '成员');

  // GROWTH-3 积分 / 签到
  String get pointsTitle => _t('Points & Check-in', '积分签到');
  String get pointsBalance => _t('Points', '当前积分');
  String get pointsStreak => _t('Check-in streak', '连续签到');
  String get pointsCheckIn => _t('Check in', '签到');
  String get pointsCheckedInToday => _t('Checked in today', '今日已签到');
  String get pointsAchievements => _t('Achievements', '我的成就');
  String get pointsLeaderboard => _t('Leaderboard', '积分排行榜');
  String get pointsNoPoints => _t('No points yet — check in to start earning', '还没有积分，签到开始赚取吧');
  String pointsStreakDays(int days) => _t(
        days == 1 ? '1 day' : '$days days',
        '已连签 $days 天',
      );
  String pointsCheckInGained(int points) => _t('Check-in successful! +$points points', '签到成功！获得 +$points 积分');
  String get pointsCheckInFailed => _t('Check-in failed', '签到失败');
  String get pointsLoadFailed => _t('Failed to load points', '积分数据加载失败');
  String get pointsLeaderboardEmpty => _t('No one on the leaderboard yet', '排行榜暂无数据');

  // --- 标签（EASY-2 生成） ---
  String get tagsTitle => _t('Tag', '标签');
  String get tagsAddTitle => _t('New Tag', '新增标签');
  String get tagsEmpty => _t('No Tag yet', '暂无标签');
  String get tagsDeleteConfirm => _t('Delete this tag?', '删除该标签？');

  // --- 笔记（EASY-2 生成） ---
  String get notesTitle => _t('Note', '笔记');
  String get notesAddTitle => _t('New Note', '新增笔记');
  String get notesEmpty => _t('No Note yet', '暂无笔记');
  String get notesDeleteConfirm => _t('Delete this note?', '删除该笔记？');

  // --- 图书（EASY-2 生成） ---
  String get booksTitle => _t('Book', '图书');
  String get booksAddTitle => _t('New Book', '新增图书');
  String get booksEmpty => _t('No Book yet', '暂无图书');
  String get booksDeleteConfirm => _t('Delete this book?', '删除该图书？');
  String get author => _t('Author', '作者');

  // --- 帖子（EASY-2 生成） ---
  String get postsTitle => _t('Post', '帖子');
  String get postsAddTitle => _t('New Post', '新增帖子');
  String get postsEmpty => _t('No Post yet', '暂无帖子');
  String get postsDeleteConfirm => _t('Delete this post?', '删除该帖子？');
  String get postsCommentHint => _t('Add a comment...', '写评论…');
  String get postsSendComment => _t('Send', '发送');

  // --- Dashboard ---
  String welcome(String name) => _t('Welcome, $name', '欢迎回来，$name');
  String get dashboardDesc => _t('This is your dashboard.', '这是您的仪表盘。');
  String get quickActions => _t('Quick Actions', '快捷操作');
  String get createEvent => _t('Create Event', '创建事件');
  String get uploadFile => _t('Upload File', '上传文件');
  String get editProfile => _t('Edit Profile', '编辑信息');
  String get todaySchedule => _t("Today's Schedule", '今日日程');
  String get noEventsToday => _t('No events today', '今天没有事件');

  // --- UX-10 Dashboard 快速开始卡（空态引导）---
  String get quickStartTitle => _t('Get Started', '快速开始');
  String get quickStartSubtitle => _t('A few things to try:', '几个可以马上试的：');
  String get quickStartCreateFirst => _t('Create your first event', '创建第一个事件');
  String get quickStartTryAi => _t('Try an AI conversation', '试一次 AI 对话');
  String get quickStartImportTemplate => _t('One-click import sample data', '一键导入示例数据');
  String get templateImported => _t('Sample data imported!', '示例数据已导入！');
  String get templateImportFailed => _t('Import failed', '导入失败');
  // UX-5 数据洞察
  String get insightsTitle => _t('My Insights', '数据洞察');
  String get insightsError => _t('Failed to load insights', '数据洞察加载失败');
  String get insightsEmpty => _t('Create events to see your insights', '创建事件后可查看你的数据洞察');
  String get insightsTotal => _t('Total', '全部');
  String get insightsActive => _t('Active', '进行中');
  String get insightsCancelled => _t('Cancelled', '已取消');
  String get insightsRecent => _t('Recent', '近30天');
  String get eventsByMonth => _t('Events by month', '每月事件分布');
  // UX-6 公告
  String get announcementDismiss => _t('Got it', '知道了');
  // PL-10 动态表单
  String get formLoading => _t('Form', '表单');
  String get formSubmit => _t('Submit', '提交');
  // G-1 应用内反馈
  String get feedbackTitle => _t('Feedback', '意见反馈');
  String get feedbackTypeLabel => _t('Type', '反馈类型');
  String get feedbackTypeSuggestion => _t('Suggestion', '建议');
  String get feedbackTypeBug => _t('Bug', '问题');
  String get feedbackTypePraise => _t('Praise', '好评');
  String get feedbackContentHint => _t('Describe your feedback...', '请描述你的建议或遇到的问题…');
  String get feedbackContactHint => _t('Contact (optional)', '联系方式（选填）');
  String get feedbackContentRequired => _t('Please enter feedback content', '请填写反馈内容');
  String get feedbackSubmit => _t('Submit', '提交');
  String get feedbackSubmitted => _t('Feedback submitted, thanks!', '反馈已提交，感谢你的支持！');
  String get feedbackSubmitFailed => _t('Submit failed, please retry', '提交失败，请重试');
  // UX-8 Onboarding
  String get onboardingSkip => _t('Skip', '跳过');
  String get onboardingNext => _t('Next', '下一步');
  String get onboardingStart => _t('Get Started', '开始使用');
  String get onboardingWelcomeTitle => _t('Welcome to KeelBase', '欢迎使用 KeelBase');
  String get onboardingWelcomeDesc => _t('A full-stack app base — events, todos, AI assistant and more.', '全栈应用基座 —— 事件、待办、AI 助手一站式管理。');
  String get onboardingEventsTitle => _t('Events & Todos', '事件与待办');
  String get onboardingEventsDesc => _t('Manage your schedule with calendar events and todo lists.', '用日历事件与待办清单管理你的日程。');
  String get onboardingAiTitle => _t('AI Assistant', 'AI 助手');
  String get onboardingAiDesc => _t('Chat with AI to create events, search knowledge and more.', '与 AI 对话创建事件、查询知识库等。');
  // UX-2 Dev Menu
  String get devMenuTitle => _t('Developer Menu', '开发调试');
  String get devCurrentEnv => _t('Current', '当前环境');
  String get devEnvironment => _t('Environment', '环境');
  String get devEnvSwitched => _t('Environment switched', '已切换环境');
  String get devEnvRestart => _t('Restart the app to apply.', '请重启应用使配置生效。');
  String get devClearData => _t('Clear All Data', '清除所有数据');
  String get devDataCleared => _t('All local data cleared', '本地数据已清除');
  String get mondayShort => _t('Mon', '一');
  String get tuesdayShort => _t('Tue', '二');
  String get wednesdayShort => _t('Wed', '三');
  String get thursdayShort => _t('Thu', '四');
  String get fridayShort => _t('Fri', '五');
  String get saturdayShort => _t('Sat', '六');
  String get sundayShort => _t('Sun', '日');

  // --- Profile ---
  String get personalInfo => _t('Personal Info', '个人信息');
  String get settings => _t('Settings', '设置');
  String memberSince(String date) => _t('Member since $date', '注册于 $date');
  String get sectionAccount => _t('Account', '账户');
  String get sectionGrowth => _t('Growth', '成长');
  String get sectionLegal => _t('Legal', '法律');

  // --- Settings ---
  String get themeMode => _t('Theme', '主题');
  String get lightMode => _t('Light', '浅色');
  String get darkMode => _t('Dark', '深色');
  String get systemMode => _t('System', '跟随系统');
  String get language => _t('Language', '语言');
  String get version => _t('Version', '版本');
  String get about => _t('About', '关于');
  String get sectionAppearance => _t('APPEARANCE', '外观');
  String get sectionRegion => _t('REGION', '地区');
  String get sectionAbout => _t('ABOUT', '关于');
  String get updateAvailable => _t('Update Available', '发现新版本');
  String get forceUpdateTitle => _t('New Version Required', '请升级到新版本');
  String get forceUpdateMessage => _t('The current version is too old to continue. Please update to continue using the app.', '当前版本过低，无法继续使用。请更新到最新版本后继续。');
  String get newVersionAvailable => _t('A new version is available. Check what is new:', '发现新版本，看看有什么新功能：');
  String get updateNow => _t('Update Now', '立即更新');
  String get later => _t('Later', '稍后');
  String get upToDate => _t('You are up to date', '已是最新版本');

  // --- Sessions ---
  String get sessionManagement => _t('Login Devices', '登录设备');

  // --- UX-4 应用锁 ---
  String get appLock => _t('App Lock', '应用锁');
  String get appLockSubtitle => _t('Verify with FaceID / fingerprint on app start', '启动时用 FaceID / 指纹验证');
  String get appLockUnsupported => _t('This device does not support biometrics', '此设备不支持生物识别');
  String get appLockDisabled => _t('App lock disabled', '应用锁已关闭');
  String get sessionEntry => _t('Manage login devices', '登录设备管理');
  String get currentDevice => _t('This device', '当前设备');
  String get noSessions => _t('No active sessions', '暂无登录设备');
  String get revoke => _t('Revoke', '远程登出');
  String get revokeSessionConfirmTitle => _t('Revoke session?', '远程登出该设备？');
  String get revokeSessionConfirmBody => _t('This device will be signed out immediately.', '该设备将被立即登出。');
  String get revokeSuccess => _t('Session revoked', '已远程登出');

  // --- Events ---
  String get eventTitle => _t('Title', '标题');
  String get eventDescription => _t('Description', '描述');
  String get startTime => _t('Start Time', '开始时间');
  String get endTime => _t('End Time', '结束时间');
  String get location => _t('Location', '地点');
  String get noEvents => _t('No events found', '暂无事件');
  String get eventCreated => _t('Event created', '事件创建成功');
  String get eventUpdated => _t('Event updated', '事件更新成功');
  String get eventDeleted => _t('Event deleted', '事件删除成功');
  String get deleteConfirm => _t('Are you sure to delete this event?', '确定要删除此事件吗？');
  String get selectDate => _t('Select date', '选择日期');
  String get newEvent => _t('New Event', '新建事件');
  String get editEvent => _t('Edit Event', '编辑事件');
  String get titleRequired => _t('Title is required', '请输入标题');
  String get titleHint => _t('Up to 200 characters', '最多200字');
  String get color => _t('Color', '颜色');
  String get apply => _t('Apply', '应用');
  String get noTitle => _t('(No Title)', '无标题');
  String get recurringEvent => _t('Recurring Event', '重复事件');
  String get reminder => _t('Reminder', '提醒');
  String get reminderNone => _t('None', '不提醒');
  String get reminder5m => _t('5 minutes before', '提前 5 分钟');
  String get reminder30m => _t('30 minutes before', '提前 30 分钟');
  String get reminder1h => _t('1 hour before', '提前 1 小时');
  String get reminder1d => _t('1 day before', '提前 1 天');

  // --- Explore ---
  String get exploreTitle => _t('Explore', '发现');
  String get exploreDesc => _t('Quick access to all features.', '快速访问所有功能。');

  // --- Upload ---
  String get uploadTitle => _t('Upload File', '上传文件');
  String get selectFile => _t('Select File', '选择文件');
  String get uploading => _t('Uploading...', '上传中...');
  String get uploadSuccess => _t('Upload successful', '上传成功');
  String get uploadFailed => _t('Upload failed', '上传失败');
  String get fileSizeLimit => _t('File too large (max 10MB)', '文件过大（最大10MB）');
  String get uploadFileLabel => _t('File', '文件');
  String get uploadSizeLabel => _t('Size', '大小');
  String get uploadTypeLabel => _t('Type', '类型');

  // --- More Menu ---
  String get moreActions => _t('Quick Actions', '快捷操作');
  String get moreAccount => _t('Account', '账户');
  String get moreLegal => _t('Legal', '法律');
  String get privacyPolicy => _t('Privacy Policy', '隐私政策');
  String get termsOfService => _t('Terms of Service', '服务条款');
  String get appInfo => _t('About', '关于');
  String get moreUploadFile => _t('Upload File', '上传文件');

  // --- Profile fields ---
  String get email => _t('Email', '邮箱');
  String get emailHint => _t('your@email.com', 'your@email.com');
  String get emailRequired => _t('Email is required', '请输入邮箱');
  String get invalidEmail => _t('Invalid email address', '邮箱格式不正确');
  String get registerSubtitle => _t('Create your account', '创建你的账号');
  String get firstName => _t('First Name', '名');
  String get lastName => _t('Last Name', '姓');
  String get firstNameHint => _t('Given name', '名');
  String get lastNameHint => _t('Family name', '姓');
  String get phone => _t('Phone', '手机号');
  String get phoneHint => _t('+86 138 0013 8000', '+86 138 0013 8000');
  String get dateOfBirth => _t('Date of Birth', '生日');
  String get bio => _t('Bio', '个人简介');
  String get bioHint => _t('Tell us about yourself', '介绍一下你自己');
  String get saveProfile => _t('Save Profile', '保存资料');

  // --- Rate limit ---
  String retryIn(int seconds) => _t(
        seconds == 1 ? 'Retry in 1 second' : 'Retry in $seconds seconds',
        '$seconds秒后重试',
      );

  // --- Password recovery ---
  String get forgotPassword => _t('Forgot password?', '忘记密码？');
  String get resetPassword => _t('Reset Password', '重置密码');
  String get sendResetLink => _t('Send Reset Link', '发送重置链接');
  String get checkEmail => _t('Check your email', '请查看您的邮箱');
  String get resetEmailSent => _t('If that email is registered, a reset link has been sent.', '如果该邮箱已注册，重置链接已发送。');
  String get backToLogin => _t('Back to login', '返回登录');
  String get newPassword => _t('New Password', '新密码');
  String get confirmPassword => _t('Confirm Password', '确认密码');
  String get passwordMismatch => _t('Passwords do not match', '两次输入的密码不一致');
  String get resetPasswordHint => _t('At least 8 characters, letters and numbers', '至少 8 位，包含字母和数字');
  String get resetSuccess => _t('Password reset. Please login.', '密码已重置，请登录。');

  // --- Email verification ---
  String get verifyEmail => _t('Verify Email', '验证邮箱');
  String get verificationCode => _t('Verification Code', '验证码');
  String get verificationCodeHint => _t('Enter 6-digit code', '输入 6 位验证码');
  String get resendCode => _t('Resend code', '重新发送');
  String get codeSent => _t('A verification code has been sent to your email.', '验证码已发送到您的邮箱。');
  String get emailVerifiedSuccess => _t('Email verified successfully', '邮箱验证成功');
  String get emailUnverified => _t('Email not verified', '邮箱未验证');
  String get verifyNow => _t('Verify now', '去验证');

  // --- Global search ---
  String get globalSearchHint => _t('Search events, people...', '搜索事件、用户…');
  String get searchEventsTab => _t('Events', '事件');
  String get searchUsersTab => _t('Users', '用户');
  String get searchConversationsTab => _t('Chats', '对话');
  String get noSearchResults => _t('No results found', '未找到结果');
  String get searchHistoryTitle => _t('Recent', '最近搜索');
  String get searchHotTitle => _t('Hot', '热门搜索');
  String get clearSearchHistory => _t('Clear', '清空');

  // --- Errors ---
  String get unknownError => _t('Something went wrong', '出了点问题');
  String get networkError => _t('Network error, please check connection', '网络错误，请检查连接');
  String get sessionExpired => _t('Session expired, please login again', '会话已过期，请重新登录');
  String get emptyData => _t('No data', '暂无数据');

  // --- AI ---
  String get tabAi => _t('AI', 'AI');
  String get aiTitle => _t('AI Assistant', 'AI 助手');
  String get aiInputHint => _t('Type a message...', '输入消息...');
  String get aiThinking => _t('Thinking...', '思考中…');
  String get aiSearching => _t('Searching data...', '正在查询数据…');
  String get aiError => _t('Sorry, an error occurred. Please try again.', '抱歉，出错了，请重试。');
  String Function(String) get aiErrorWithDetail => (String msg) => _t('Sorry, an error occurred: \$msg', '抱歉，出错了：\$msg');
  String get aiConfirmFailed => _t('Confirmation request failed, please retry.', '确认请求失败，请重试');
  String get aiRegenerate => _t('Regenerate', '重新生成');
  String get aiClearConversation => _t('Clear conversation', '清空对话');
  String get aiModelSelect => _t('Switch model', '切换模型');
  String get aiModelPickerTitle => _t('Select model', '选择模型');
  String get aiWelcomeTitle => _t('Hello! How can I help you?', '你好！有什么可以帮助你的？');
  String get aiSuggested1 => _t("What events do I have this month?", "本月有哪些事件？");
  String get aiSuggested2 => _t("Analyze my event trends", "分析我的事件趋势");
  String get aiSuggested3 => _t("Give me a summary of my data", "给我一份数据概览");

  // --- UX-11 AI 示例 chips（agent 能力发现：真实触发句）---
  String get aiExampleChipsTitle => _t('Try:', '试试：');
  String get aiExampleWeekPlan => _t('Plan my week', '帮我安排本周');
  String get aiExampleCreateMeeting => _t('Create a meeting at 3pm tomorrow', '创建明天下午 3 点的会议');
  String get aiExampleTrend => _t('Analyze my event trends', '分析我的事件趋势');
  String get aiConfirmTitle => _t('Confirmation required', '确认操作');
  String get aiConfirmBody => _t('The AI would like to perform the following action:', 'AI 想要执行以下操作，请确认：');
  String get aiConfirmApprove => _t('Confirm', '确认');
  String get aiConfirmReject => _t('Decline', '拒绝');
  String get aiConfirming => _t('Processing...', '处理中…');
  String get aiWaitingConfirm => _t('Awaiting your confirmation...', '等待确认…');
  String get aiConfirmTrustTool => _t('Trust this tool for this session (skip confirmation)', '本会话信任此工具（不再询问）');
  String get aiConfirmArgsTitle => _t('Details', '操作详情');
  String get aiToolRunning => _t('Working...', '正在执行…');
  String get aiToolSuccess => _t('Done', '已完成');
  String get aiToolFailed => _t('Failed', '执行失败');
  String get aiHistory => _t('Chat history', '历史对话');
  String get conversationHistory => _t('Chat history', '对话历史');
  String get noConversationHistory => _t('No chat history yet', '暂无历史对话');
  String get aiLoadFailed => _t('Failed to load conversation', '加载对话失败');
  String get deleteFailed => _t('Delete failed, please try again', '删除失败，请重试');
  String Function(String) get deleteConversationConfirm => (String title) => _t('Delete "$title"?', '确定删除「$title」？');
  String get aiConfirmArgTitle => _t('Title', '标题');
  String get aiConfirmArgStart => _t('Start', '开始');
  String get aiConfirmArgEnd => _t('End', '结束');
  String get aiConfirmArgDueDate => _t('Due', '截止');
  String get aiConfirmArgLocation => _t('Location', '地点');
  String get aiConfirmArgDescription => _t('Description', '描述');
  String get aiConfirmArgReminder => _t('Reminder', '提醒');

  // --- Profile (more menu) ---
  String get profileEntry => _t('Profile', '个人资料');

  // --- Calendar ---
  String get calendarDay => _t('Day', '日');
  String get calendarWeek => _t('Week', '周');
  String get calendarMonth => _t('Month', '月');
  String get noEventsForDate => _t('No events on this date', '此日期暂无事件');
  String get searchEvents => _t('Search', '搜索');
  String get searchHint => _t('Title or description...', '标题或描述...');
  String get allEvents => _t('All', '全部');
  String get loadMore => _t('Load more', '加载更多');
  String get noMoreEvents => _t('All events loaded', '已加载全部事件');
  String eventsCount(int n) => _t(
        n == 1 ? '1 event' : '$n events',
        '$n 个事件',
      );
  String get searchResults => _t('Search Results', '搜索结果');
  String get today => _t('Today', '今天');

}

/// LocalizationsDelegate 实现，将 AppLocalizations 接入 Flutter 管线。
class _AppLocalizationsDelegate
    extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();


  @override
  bool isSupported(Locale locale) =>
      locale.languageCode == 'en' ||
      (locale.languageCode == 'zh' &&
          (locale.countryCode == null ||
              locale.countryCode == 'CN' ||
              locale.scriptCode == 'Hans'));

  @override
  Future<AppLocalizations> load(Locale locale) =>
      SynchronousFuture<AppLocalizations>(AppLocalizations(locale));

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

/// 扩展方法：context.l10n 便捷访问。
extension AppLocalizationsContext on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this);
}
