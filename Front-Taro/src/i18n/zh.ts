import type { I18nDictionary } from './types'

/** 中文词典（默认）。key 命名空间：common.* 通用 / <page>.* 页面 / <store|service>.* 状态与提示 */
export const zh: I18nDictionary = {
  // ── common ──
  'common.loading': '加载中…',
  'common.failed': '操作失败',
  'common.created': '创建成功',
  'common.deleted': '删除成功',
  'common.completed': '操作完成',
  'common.ok': '确定',
  'common.cancel': '取消',
  'common.confirm': '确认',
  'common.deleteConfirm': '确定删除「{name}」？',
  'common.noData': '暂无数据',

  // ── todos ──
  'todos.title': '待办清单',
  'todos.count': '{active} 未完成 / {total} 全部',
  'todos.placeholder': '添加待办…',
  'todos.add': '添加',
  'todos.empty': '暂无待办，添加一条开始吧',
  'todos.active': '进行中',
  'todos.done': '已完成',
  'todos.inputRequired': '请输入待办内容',
  'todos.createFailed': '创建失败',
  'todos.deleteTitle': '删除待办',
  'todos.deleteFailed': '删除失败',

  // ── settings ──
  'settings.appearance': '外观',
  'settings.language': '语言',
  'settings.theme': '主题',
  'settings.themeLight': '浅色',
  'settings.themeDark': '深色',
  'settings.themeSystem': '跟随系统',
  'settings.notifications': '通知',
  'settings.wechatReminder': '启用微信事件提醒',
  'settings.h5Only': '仅 H5 支持',
  'settings.account': '账号',
  'settings.loginDevices': '登录设备',
  'settings.signOut': '退出登录',
  'settings.signOutConfirmTitle': '退出登录',
  'settings.signOutConfirm': '确定要退出登录吗？',
  'settings.legal': '法律',
  'settings.privacyPolicy': '隐私政策',
  'settings.terms': '服务条款',
  'settings.appInfo': '应用信息',
  'settings.version': '版本',
  'settings.wechatReminderH5Only': '微信提醒仅小程序可用',
  'settings.wechatReminderNotConfigured': '提醒模板未配置',
  'settings.wechatReminderEnabled': '已启用微信提醒',
  'settings.wechatReminderDeclined': '你已拒绝微信提醒',
  'settings.wechatReminderFailed': '启用提醒失败',

  // ── explore ──
  'explore.searchPlaceholder': '搜索事件、用户…',
  'explore.quickAccess': '快捷入口',
  'explore.recentActivity': '最近动态',
  'explore.discoverSoon': '新功能即将上线，敬请期待！',
  'explore.aiHistory': 'AI 历史',
  'explore.contracts': '合同',
  'explore.suppliers': '供应商',
  'explore.tags': '标签',
  'explore.ai': 'AI',
  'explore.upload': '上传',
  'explore.events': '事件',
  'explore.todos': '待办',
  'explore.settings': '设置',

  // ── aiHistory ──
  'aiHistory.title': '对话历史',
  'aiHistory.newConversation': '新对话',
  'aiHistory.empty': '暂无历史对话',
  'aiHistory.deleteTitle': '删除对话',
  'aiHistory.deleteFailed': '删除失败',

  // ── aiChat ──
  'aiChat.title': 'AI 助手',
  'aiChat.history': '历史',
  'aiChat.clear': '清空',
  'aiChat.welcomeHint': '有什么可以帮你？试试「查一下我今天的事件」',
  'aiChat.thinking': '思考中…',
  'aiChat.placeholder': '输入消息…',
  'aiChat.send': '发送',
  'aiChat.clearTitle': '清空对话',
  'aiChat.clearConfirm': '确定清空当前对话？',

  // ── contracts ──
  'contracts.title': '合同',
  'contracts.count': '{total} 条',
  'contracts.placeholder': '新增合同…',
  'contracts.add': '添加',
  'contracts.empty': '暂无合同',
  'contracts.inputRequired': '请输入合同内容',
  'contracts.createFailed': '创建失败',
  'contracts.deleteTitle': '删除合同',
  'contracts.deleteFailed': '删除失败',
  'contracts.loadFailed': '合同加载失败',

  // ── dashboard ──
  'dashboard.welcome': '欢迎，{name}',
  'dashboard.defaultUser': '用户',
  'dashboard.events': '事件',
  'dashboard.upload': '上传',
  'dashboard.signOut': '退出登录',

  // ── eventForm ──
  'eventForm.titleLabel': '标题 *',
  'eventForm.titlePlaceholder': '事件标题',
  'eventForm.descriptionLabel': '描述',
  'eventForm.descriptionPlaceholder': '事件描述（可选）',
  'eventForm.locationLabel': '地点',
  'eventForm.locationPlaceholder': '事件地点（可选）',
  'eventForm.start': '开始',
  'eventForm.end': '结束',
  'eventForm.color': '颜色',
  'eventForm.update': '更新事件',
  'eventForm.create': '创建事件',
  'eventForm.endBeforeStart': '结束时间必须晚于开始时间',
  'eventForm.created': '事件已创建',

  // ── events ──
  'events.retry': '重试',
  'events.empty': '本月暂无事件',
  'events.loadFailed': '事件加载失败',
  'events.createFailed': '创建事件失败',
  'events.deleteFailed': '删除事件失败',

  // ── notifications ──
  'notifications.title': '通知',
  'notifications.markAllRead': '全部已读',
  'notifications.empty': '暂无通知',
  'notifications.loadingMore': '加载更多…',
  'notifications.unread': '{count} 条未读',
  'notifications.markAllReadConfirm': '确定全部标记为已读？',
  'notifications.deleteTitle': '删除',
  'notifications.deleteConfirm': '确定删除这条通知？',
  'notifications.loadFailed': '通知加载失败',
  'notifications.markReadFailed': '标记已读失败',
  'notifications.markAllReadFailed': '全部标记已读失败',
  'notifications.deleteFailed': '删除通知失败',

  // ── profile ──
  'profile.defaultUser': '用户',
  'profile.unknown': '未知',
  'profile.myEvents': '我的事件',
  'profile.uploads': '上传',
  'profile.notifications': '通知',
  'profile.loginDevices': '登录设备',
  'profile.privacyPolicy': '隐私政策',
  'profile.terms': '服务条款',
  'profile.signOut': '退出登录',
  'profile.signOutConfirm': '确定要退出登录吗？',

  // ── search ──
  'search.placeholder': '搜索事件、用户…',
  'search.searching': '搜索中…',
  'search.empty': '没有找到相关内容',
  'search.eventsSection': '事件（{count}）',
  'search.usersSection': '用户（{count}）',
  'search.failed': '搜索失败',

  // ── sessions ──
  'sessions.title': '登录设备',
  'sessions.subtitle': '可访问你账号的设备',
  'sessions.empty': '暂无活跃会话',
  'sessions.unknownDevice': '未知设备',
  'sessions.current': '当前',
  'sessions.lastActive': 'IP: {ip} · 最近活跃：{time}',
  'sessions.signedIn': '登录时间：{time}',
  'sessions.revoke': '撤销',
  'sessions.revokeTitle': '撤销设备',
  'sessions.revokeConfirm': '确定让该设备退出登录？',
  'sessions.revokeConfirmWith': '确定让「{device}」退出登录？',
  'sessions.revoked': '已撤销会话',
  'sessions.revokeFailed': '撤销失败',
  'sessions.loadFailed': '会话加载失败',

  // ── splash ──
  'splash.title': 'App',

  // ── suppliers ──
  'suppliers.title': '供应商',
  'suppliers.count': '{total} 条',
  'suppliers.placeholder': '新增供应商…',
  'suppliers.add': '添加',
  'suppliers.empty': '暂无供应商',
  'suppliers.inputRequired': '请输入供应商内容',
  'suppliers.createFailed': '创建失败',
  'suppliers.deleteTitle': '删除供应商',
  'suppliers.deleteFailed': '删除失败',
  'suppliers.loadFailed': '供应商加载失败',

  // ── tags ──
  'tags.title': '标签',
  'tags.count': '{total} 条',
  'tags.placeholder': '新增标签…',
  'tags.add': '添加',
  'tags.empty': '暂无标签',
  'tags.inputRequired': '请输入标签内容',
  'tags.createFailed': '创建失败',
  'tags.deleteTitle': '删除标签',
  'tags.deleteFailed': '删除失败',
  'tags.loadFailed': '标签加载失败',

  // ── upload ──
  'upload.uploading': '上传中…',
  'upload.tapToSelect': '点击选择文件',
  'upload.supported': '支持格式：jpg, png, gif, webp, pdf, zip',
  'upload.success': '✅ 上传成功！',
  'upload.uploadAnother': '再传一个',
  'upload.sizeExceeded': '文件大小超过 10 MB 限制',
  'upload.pickFailed': '选择文件失败',
  'upload.uploadFailed': '上传失败',

  // ── userDetail ──
  'userDetail.notFound': '用户不存在',
  'userDetail.username': '用户名',
  'userDetail.nickname': '昵称',
  'userDetail.created': '创建时间',
  'userDetail.updated': '更新时间',
  'userDetail.locked': '🔒 账号已被锁定',

  // ── users ──
  'users.retry': '重试',
  'users.loadFailed': '用户加载失败',

  // ── ai ──
  'ai.newConversation': '新对话',
  'ai.replyFailed': 'AI 回复失败',
  'ai.historyLoadFailed': '加载历史失败',
  'ai.conversationLoadFailed': '加载对话失败',
  'ai.deleteFailed': '删除失败',

  // ── auth ──
  'auth.loginFailed': '登录失败',
  'auth.registrationFailed': '注册失败',
  'auth.wechatH5Unavailable': '微信登录仅在小程序可用',
  'auth.wechatLoginFailed': '微信登录失败',

  // ── api ──
  'api.authRequired': '需要登录',
  'api.requestFailed': '请求失败',
  'api.timeout': '连接超时',
  'api.networkError': '网络错误，请检查网络连接',
  'api.unexpectedError': '发生意外错误',
  'api.invalidResponse': '服务器响应无效',
  'api.uploadFailed': '上传失败',

  // ── todos（追加）──
  'todos.loadFailed': '待办加载失败',
  'todos.toggleFailed': '更新状态失败',
}
