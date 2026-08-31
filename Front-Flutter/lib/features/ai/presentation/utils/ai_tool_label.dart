import 'dart:convert';

// AI 工具名 → 业务可读标签（D2 业务语言化：create_followup_task → 创建跟进任务）
// 未命中回退原始工具名，保证任何工具都可展示。
String aiToolLabel(String? toolName) {
  if (toolName == null || toolName.isEmpty) return 'AI 操作';
  const map = <String, String>{
    // AI CRM 旗舰
    'query_customers': '查询客户',
    'query_customer_orders': '查询客户订单',
    'query_customer_activities': '查询客户跟进记录',
    'query_customer_contacts': '查询客户联系人',
    'query_customer_opportunities': '查询销售机会',
    'analyze_customer_risk': '客户风险分析',
    'analyze_sales_pipeline': '销售管道分析',
    'summarize_customer_360': '客户全景摘要',
    'create_followup_task': '创建跟进任务',
    'delete_customer': '删除客户',
    // AI Project
    'query_projects': '查询项目',
    'query_project_tasks': '查询项目任务',
    'analyze_project_risk': '项目风险分析',
    'create_project_task': '创建项目任务',
    // AI Approval
    'query_approval_requests': '查询审批请求',
    'query_approval_policies': '查询审批政策',
    'submit_approval_request': '提交审批请求',
    'review_approval_request': '审批复核',
    // 通用
    'query_events': '查询事件',
    'query_events_by_keyword': '按关键词查询事件',
    'count_events_by_status': '事件状态统计',
    'create_event': '创建事件',
    'create_todo': '创建待办',
    'query_user_stats': '查询用户统计',
    'query_org_members': '查询组织成员',
    'query_org_tasks': '查询组织任务',
    'query_org_availability': '查询组织可用性',
    'query_contracts': '查询合同',
    'create_contract': '创建合同',
    'navigate_page': '页面导航',
    'web_search': '联网搜索',
    'generate_image': '生成图片',
    'create_module': '生成业务模块',
    // 外部系统（AI Bridge）
    'list_customers': '查询外部客户',
    'get_customer': '查看外部客户',
    'list_customer_orders': '查询外部客户订单',
    'update_order_amount': '更新订单金额',
  };
  return map[toolName] ?? toolName;
}

/// 工具参数 JSON → 业务摘要（提取关键参数；未覆盖返回空 = 不展示，技术参数进详情）
String aiToolArgsSummary(String? toolName, String? args) {
  if (toolName == null || args == null || args.isEmpty) return '';
  Map<String, dynamic> a;
  try {
    a = jsonDecode(args) as Map<String, dynamic>;
  } catch (_) {
    return '';
  }
  switch (toolName) {
    case 'query_customers':
      final parts = <String>[];
      if (a['keyword'] != null) parts.add('关键词「${a['keyword']}」');
      if (a['riskLevel'] != null) parts.add('风险：${a['riskLevel']}');
      if (a['status'] != null) parts.add('状态：${a['status']}');
      return parts.isEmpty ? '' : '（${parts.join(' · ')}）';
    case 'analyze_customer_risk':
    case 'query_customer_orders':
    case 'query_customer_activities':
    case 'summarize_customer_360':
      return a['customerId'] != null ? ' #${a['customerId']}' : '';
    case 'create_followup_task':
    case 'create_event':
    case 'create_todo':
    case 'create_project_task':
      return a['title'] != null ? '「${a['title']}」' : '';
    case 'create_contract':
      return a['name'] != null ? '「${a['name']}」' : '';
    default:
      return '';
  }
}
