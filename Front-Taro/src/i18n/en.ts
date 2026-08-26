import type { I18nDictionary } from './types'

/** 英文词典。key 与 zh.ts 一致；缺失时回退到 zh 或 key 本身。 */
export const en: I18nDictionary = {
  // ── common ──
  'common.loading': 'Loading…',
  'common.failed': 'Operation failed',
  'common.created': 'Created',
  'common.deleted': 'Deleted',
  'common.completed': 'Done',
  'common.ok': 'OK',
  'common.cancel': 'Cancel',
  'common.confirm': 'Confirm',
  'common.deleteConfirm': 'Delete "{name}"?',
  'common.noData': 'No data',

  // ── todos ──
  'todos.title': 'Todos',
  'todos.count': '{active} active / {total} total',
  'todos.placeholder': 'Add a todo…',
  'todos.add': 'Add',
  'todos.empty': 'No todos yet — add one to get started',
  'todos.active': 'Active',
  'todos.done': 'Completed',
  'todos.inputRequired': 'Please enter a todo',
  'todos.createFailed': 'Failed to create',
  'todos.deleteTitle': 'Delete todo',
  'todos.deleteFailed': 'Failed to delete',

  // ── settings ──
  'settings.appearance': 'Appearance',
  'settings.language': 'Language',
  'settings.theme': 'Theme',
  'settings.themeLight': 'Light',
  'settings.themeDark': 'Dark',
  'settings.themeSystem': 'System',
  'settings.notifications': 'Notifications',
  'settings.wechatReminder': 'Enable WeChat Event Reminders',
  'settings.h5Only': 'H5 only',
  'settings.account': 'Account',
  'settings.loginDevices': 'Login Devices',
  'settings.signOut': 'Sign Out',
  'settings.signOutConfirmTitle': 'Sign Out',
  'settings.signOutConfirm': 'Are you sure you want to sign out?',
  'settings.legal': 'Legal',
  'settings.privacyPolicy': 'Privacy Policy',
  'settings.terms': 'Terms of Service',
  'settings.appInfo': 'App Info',
  'settings.version': 'Version',
  'settings.wechatReminderH5Only': 'WeChat reminders are only available in the mini program',
  'settings.wechatReminderNotConfigured': 'Reminder template not configured',
  'settings.wechatReminderEnabled': 'WeChat reminders enabled',
  'settings.wechatReminderDeclined': 'You declined WeChat reminders',
  'settings.wechatReminderFailed': 'Failed to enable reminders',

  // ── explore ──
  'explore.searchPlaceholder': 'Search events, users…',
  'explore.quickAccess': 'Quick Access',
  'explore.recentActivity': 'Recent Activity',
  'explore.discoverSoon': 'Discover new features coming soon!',
  'explore.aiHistory': 'AI History',
  'explore.contracts': 'Contracts',
  'explore.suppliers': 'Suppliers',
  'explore.tags': 'Tags',
  'explore.ai': 'AI',
  'explore.upload': 'Upload',
  'explore.events': 'Events',
  'explore.todos': 'Todos',
  'explore.settings': 'Settings',

  // ── aiHistory ──
  'aiHistory.title': 'Conversation History',
  'aiHistory.newConversation': 'New Conversation',
  'aiHistory.empty': 'No conversation history',
  'aiHistory.deleteTitle': 'Delete Conversation',
  'aiHistory.deleteFailed': 'Failed to delete',

  // ── aiChat ──
  'aiChat.title': 'AI Assistant',
  'aiChat.history': 'History',
  'aiChat.clear': 'Clear',
  'aiChat.welcomeHint': 'How can I help? Try "check my events today"',
  'aiChat.thinking': 'Thinking…',
  'aiChat.placeholder': 'Type a message…',
  'aiChat.send': 'Send',
  'aiChat.clearTitle': 'Clear Conversation',
  'aiChat.clearConfirm': 'Clear the current conversation?',

  // ── contracts ──
  'contracts.title': 'Contracts',
  'contracts.count': '{total} items',
  'contracts.placeholder': 'Add a contract…',
  'contracts.add': 'Add',
  'contracts.empty': 'No contracts yet',
  'contracts.inputRequired': 'Please enter a contract name',
  'contracts.createFailed': 'Failed to create',
  'contracts.deleteTitle': 'Delete Contract',
  'contracts.deleteFailed': 'Failed to delete',
  'contracts.loadFailed': 'Failed to load contracts',

  // ── dashboard ──
  'dashboard.welcome': 'Welcome, {name}',
  'dashboard.defaultUser': 'User',
  'dashboard.events': 'Events',
  'dashboard.upload': 'Upload',
  'dashboard.signOut': 'Sign Out',

  // ── eventForm ──
  'eventForm.titleLabel': 'Title *',
  'eventForm.titlePlaceholder': 'Event title',
  'eventForm.descriptionLabel': 'Description',
  'eventForm.descriptionPlaceholder': 'Event description (optional)',
  'eventForm.locationLabel': 'Location',
  'eventForm.locationPlaceholder': 'Event location (optional)',
  'eventForm.start': 'Start',
  'eventForm.end': 'End',
  'eventForm.color': 'Color',
  'eventForm.update': 'Update Event',
  'eventForm.create': 'Create Event',
  'eventForm.endBeforeStart': 'End time must be after start',
  'eventForm.created': 'Event created',

  // ── events ──
  'events.retry': 'Retry',
  'events.empty': 'No events this month',
  'events.loadFailed': 'Failed to load events',
  'events.createFailed': 'Failed to create event',
  'events.deleteFailed': 'Failed to delete event',

  // ── notifications ──
  'notifications.title': 'Notifications',
  'notifications.markAllRead': 'Mark All Read',
  'notifications.empty': 'No notifications yet',
  'notifications.loadingMore': 'Loading more…',
  'notifications.unread': '{count} unread',
  'notifications.markAllReadConfirm': 'Mark all notifications as read?',
  'notifications.deleteTitle': 'Delete',
  'notifications.deleteConfirm': 'Delete this notification?',
  'notifications.loadFailed': 'Failed to load notifications',
  'notifications.markReadFailed': 'Failed to mark as read',
  'notifications.markAllReadFailed': 'Failed to mark all as read',
  'notifications.deleteFailed': 'Failed to delete notification',

  // ── profile ──
  'profile.defaultUser': 'User',
  'profile.unknown': 'unknown',
  'profile.myEvents': 'My Events',
  'profile.uploads': 'Uploads',
  'profile.notifications': 'Notifications',
  'profile.loginDevices': 'Login Devices',
  'profile.privacyPolicy': 'Privacy Policy',
  'profile.terms': 'Terms of Service',
  'profile.signOut': 'Sign Out',
  'profile.signOutConfirm': 'Are you sure you want to sign out?',

  // ── search ──
  'search.placeholder': 'Search events, users…',
  'search.searching': 'Searching…',
  'search.empty': 'No results found',
  'search.eventsSection': 'Events ({count})',
  'search.usersSection': 'Users ({count})',
  'search.failed': 'Search failed',

  // ── sessions ──
  'sessions.title': 'Login Devices',
  'sessions.subtitle': 'Devices that have access to your account',
  'sessions.empty': 'No active sessions',
  'sessions.unknownDevice': 'Unknown Device',
  'sessions.current': 'Current',
  'sessions.lastActive': 'IP: {ip} · Last active: {time}',
  'sessions.signedIn': 'Signed in: {time}',
  'sessions.revoke': 'Revoke',
  'sessions.revokeTitle': 'Revoke Device',
  'sessions.revokeConfirm': 'Sign out this device?',
  'sessions.revokeConfirmWith': 'Sign out "{device}"?',
  'sessions.revoked': 'Session revoked',
  'sessions.revokeFailed': 'Failed to revoke',
  'sessions.loadFailed': 'Failed to load sessions',

  // ── splash ──
  'splash.title': 'App',

  // ── suppliers ──
  'suppliers.title': 'Suppliers',
  'suppliers.count': '{total} items',
  'suppliers.placeholder': 'Add a supplier…',
  'suppliers.add': 'Add',
  'suppliers.empty': 'No suppliers yet',
  'suppliers.inputRequired': 'Please enter a supplier name',
  'suppliers.createFailed': 'Failed to create',
  'suppliers.deleteTitle': 'Delete Supplier',
  'suppliers.deleteFailed': 'Failed to delete',
  'suppliers.loadFailed': 'Failed to load suppliers',

  // ── tags ──
  'tags.title': 'Tags',
  'tags.count': '{total} items',
  'tags.placeholder': 'Add a tag…',
  'tags.add': 'Add',
  'tags.empty': 'No tags yet',
  'tags.inputRequired': 'Please enter a tag name',
  'tags.createFailed': 'Failed to create',
  'tags.deleteTitle': 'Delete Tag',
  'tags.deleteFailed': 'Failed to delete',
  'tags.loadFailed': 'Failed to load tags',

  // ── upload ──
  'upload.uploading': 'Uploading…',
  'upload.tapToSelect': 'Tap to select a file',
  'upload.supported': 'Supported: jpg, png, gif, webp, pdf, zip',
  'upload.success': '✅ Upload successful!',
  'upload.uploadAnother': 'Upload Another',
  'upload.sizeExceeded': 'File size exceeds 10 MB limit',
  'upload.pickFailed': 'Failed to pick file',
  'upload.uploadFailed': 'Upload failed',

  // ── userDetail ──
  'userDetail.notFound': 'User not found',
  'userDetail.username': 'Username',
  'userDetail.nickname': 'Nickname',
  'userDetail.created': 'Created',
  'userDetail.updated': 'Updated',
  'userDetail.locked': '🔒 Account is locked',

  // ── users ──
  'users.retry': 'Retry',
  'users.loadFailed': 'Failed to load users',

  // ── ai ──
  'ai.newConversation': 'New Conversation',
  'ai.replyFailed': 'AI reply failed',
  'ai.historyLoadFailed': 'Failed to load history',
  'ai.conversationLoadFailed': 'Failed to load conversation',
  'ai.deleteFailed': 'Failed to delete',

  // ── auth ──
  'auth.loginFailed': 'Login failed',
  'auth.registrationFailed': 'Registration failed',
  'auth.wechatH5Unavailable': 'WeChat login is only available in the mini program',
  'auth.wechatLoginFailed': 'WeChat login failed',

  // ── api ──
  'api.authRequired': 'Authentication required',
  'api.requestFailed': 'Request failed',
  'api.timeout': 'Connection timed out',
  'api.networkError': 'Network error - please check your connection',
  'api.unexpectedError': 'Unexpected error',
  'api.invalidResponse': 'Invalid server response',
  'api.uploadFailed': 'Upload failed',

  // ── todos（追加）──
  'todos.loadFailed': 'Failed to load todos',
  'todos.toggleFailed': 'Failed to update status',
}
