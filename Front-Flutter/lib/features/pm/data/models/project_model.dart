/// AI Project Management：项目模型
class ProjectModel {
  final int id;
  final String name;
  final String? description;
  final String status;
  final String riskLevel;
  final String? startDate;
  final String? endDate;

  const ProjectModel({
    required this.id,
    required this.name,
    this.description,
    this.status = 'planned',
    this.riskLevel = 'low',
    this.startDate,
    this.endDate,
  });

  factory ProjectModel.fromJson(Map<String, dynamic> json) => ProjectModel(
        id: json['id'] as int,
        name: json['name'] as String,
        description: json['description'] as String?,
        status: json['status'] as String? ?? 'planned',
        riskLevel: json['riskLevel'] as String? ?? 'low',
        startDate: json['startDate'] as String?,
        endDate: json['endDate'] as String?,
      );

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'description': description,
        'status': status,
        'riskLevel': riskLevel,
        'startDate': startDate,
        'endDate': endDate,
      };
}

/// 里程碑
class MilestoneModel {
  final int id;
  final int projectId;
  final String title;
  final String? dueDate;
  final String status;

  const MilestoneModel({
    required this.id,
    required this.projectId,
    required this.title,
    this.dueDate,
    this.status = 'pending',
  });

  factory MilestoneModel.fromJson(Map<String, dynamic> json) => MilestoneModel(
        id: json['id'] as int,
        projectId: json['projectId'] as int,
        title: json['title'] as String? ?? '',
        dueDate: json['dueDate'] as String?,
        status: json['status'] as String? ?? 'pending',
      );
}

/// 项目任务
class ProjectTaskModel {
  final int id;
  final int projectId;
  final String title;
  final String? description;
  final String? dueDate;
  final String status;

  const ProjectTaskModel({
    required this.id,
    required this.projectId,
    required this.title,
    this.description,
    this.dueDate,
    this.status = 'pending',
  });

  factory ProjectTaskModel.fromJson(Map<String, dynamic> json) => ProjectTaskModel(
        id: json['id'] as int,
        projectId: json['projectId'] as int,
        title: json['title'] as String? ?? '',
        description: json['description'] as String?,
        dueDate: json['dueDate'] as String?,
        status: json['status'] as String? ?? 'pending',
      );
}

/// 项目风险
class ProjectRiskModel {
  final int id;
  final int projectId;
  final String level;
  final String reason;

  const ProjectRiskModel({required this.id, required this.projectId, this.level = 'medium', required this.reason});

  factory ProjectRiskModel.fromJson(Map<String, dynamic> json) => ProjectRiskModel(
        id: json['id'] as int,
        projectId: json['projectId'] as int,
        level: json['level'] as String? ?? 'medium',
        reason: json['reason'] as String? ?? '',
      );
}

/// 项目详情聚合
class ProjectDetailModel {
  final ProjectModel project;
  final List<MilestoneModel> milestones;
  final List<ProjectTaskModel> tasks;
  final List<ProjectRiskModel> risks;
  final int memberCount;

  const ProjectDetailModel({
    required this.project,
    this.milestones = const [],
    this.tasks = const [],
    this.risks = const [],
    this.memberCount = 0,
  });

  factory ProjectDetailModel.fromJson(Map<String, dynamic> json) {
    List<T> list<T>(String key, T Function(Map<String, dynamic>) from) =>
        (json[key] as List? ?? []).whereType<Map<String, dynamic>>().map(from).toList();
    return ProjectDetailModel(
      project: ProjectModel.fromJson(json['project'] as Map<String, dynamic>),
      milestones: list('milestones', MilestoneModel.fromJson),
      tasks: list('tasks', ProjectTaskModel.fromJson),
      risks: list('risks', ProjectRiskModel.fromJson),
      memberCount: json['memberCount'] as int? ?? 0,
    );
  }
}

/// 项目风险分析
class ProjectRiskAnalysis {
  final String level;
  final int score;
  final List<String> reasons;

  const ProjectRiskAnalysis({required this.level, this.score = 0, this.reasons = const []});

  factory ProjectRiskAnalysis.fromJson(Map<String, dynamic> json) => ProjectRiskAnalysis(
        level: json['level'] as String? ?? 'low',
        score: json['score'] as int? ?? 0,
        reasons: (json['reasons'] as List? ?? []).whereType<String>().toList(),
      );
}
