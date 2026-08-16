import 'package:flutter/cupertino.dart';
import 'package:go_router/go_router.dart';
import 'package:provider/provider.dart';
import '../../../../core/i18n/app_localizations.dart';
import '../../../../core/widgets/app_error_view.dart';
import '../../../../core/widgets/app_form_section.dart';
import '../../../../core/widgets/app_primary_button.dart';
import '../../../../core/widgets/app_toast.dart';
import '../../../../core/widgets/loading_widget.dart';
import '../providers/events_provider.dart';
import '../../data/repositories/events_repository.dart';

/// 预设颜色 hex：与后端 EventColorRole 枚举 index 一一对应
/// （blue→red→green→orange→purple→cyan）。禁止按 UI 顺序排——否则保存时
/// `indexOf` 落成枚举下标会选红存 blue、回显整体错位（CR-11）。
const List<String> _colorHexes = [
  '007AFF', // blue(0)
  'FF3B30', // red(1)
  '34C759', // green(2)
  'FF9500', // orange(3)
  'AF52DE', // purple(4)
  '32ADE6', // cyan(5)
];

/// 预设颜色（顺序与 _colorHexes 一致）
const List<Color> _colorPalette = [
  CupertinoColors.systemBlue,   // blue
  CupertinoColors.systemRed,    // red
  CupertinoColors.systemGreen,  // green
  CupertinoColors.systemOrange, // orange
  CupertinoColors.systemPurple, // purple
  CupertinoColors.systemCyan,   // cyan
];

class EventFormPage extends StatefulWidget {
  final int? eventId;
  const EventFormPage({super.key, this.eventId});
  @override
  State<EventFormPage> createState() => _EventFormPageState();
}

class _EventFormPageState extends State<EventFormPage> {
  final _titleCtrl = TextEditingController();
  final _descCtrl = TextEditingController();
  final _locationCtrl = TextEditingController();

  late DateTime _startDate;
  late DateTime _endDate;
  String _colorRole = "007AFF"; // default blue hex
  bool _recurring = false;
  int? _reminderMinutes;
  bool _loading = false;
  bool _saving = false;
  bool _loadFailed = false;

  bool get _editing => widget.eventId != null;

  @override
  void initState() {
    super.initState();
    if (_editing) {
      _load();
    } else {
      // 新建事件默认落在日历当前选中的日期（双击某天创建时即当天）。
      final selected = context.read<EventsProvider>().selectedDate;
      _startDate = selected;
      _endDate = selected.add(const Duration(hours: 1));
    }
  }

  @override
  void dispose() {
    _titleCtrl.dispose();
    _descCtrl.dispose();
    _locationCtrl.dispose();
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _loadFailed = false;
    });
    try {
      final repo = context.read<EventsRepository>();
      final event = await repo.getEvent(widget.eventId!);
      if (!mounted) return;
      setState(() {
        _titleCtrl.text = event.title;
        _descCtrl.text = event.description ?? '';
        _locationCtrl.text = event.location ?? '';
        _startDate = event.startTime;
        _endDate = event.endTime;
        _colorRole = event.colorRole.index < _colorHexes.length ? _colorHexes[event.colorRole.index] : _colorHexes[0];
        _recurring = event.isRecurring;
        _reminderMinutes = event.reminderMinutes;
      });
    } catch (_) {
      if (mounted) setState(() => _loadFailed = true);
    } finally {
      if (mounted) setState(() => _loading = false);
    }
  }

  String _reminderLabel(AppLocalizations l10n) {
    switch (_reminderMinutes) {
      case 5:
        return l10n.reminder5m;
      case 30:
        return l10n.reminder30m;
      case 60:
        return l10n.reminder1h;
      case 1440:
        return l10n.reminder1d;
      default:
        return l10n.reminderNone;
    }
  }

  void _pickReminder() {
    final options = <int?, String>{
      null: context.l10n.reminderNone,
      5: context.l10n.reminder5m,
      30: context.l10n.reminder30m,
      60: context.l10n.reminder1h,
      1440: context.l10n.reminder1d,
    };
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => CupertinoActionSheet(
        title: Text(context.l10n.reminder),
        actions: [
          for (final entry in options.entries)
            CupertinoActionSheetAction(
              isDefaultAction: _reminderMinutes == entry.key,
              onPressed: () {
                Navigator.pop(ctx);
                setState(() => _reminderMinutes = entry.key);
              },
              child: Text(entry.value),
            ),
        ],
        cancelButton: CupertinoActionSheetAction(
          child: Text(context.l10n.cancel),
          onPressed: () => Navigator.pop(ctx),
        ),
      ),
    );
  }

  void _pickDateTime(bool isStart) {
    final initial = isStart ? _startDate : _endDate;
    DateTime? picked;
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) {
        DateTime local = initial;
        return Container(
          height: 280,
          decoration: BoxDecoration(
            color: CupertinoTheme.brightnessOf(context) == Brightness.dark
                ? const Color(0xFF1C1C1E)
                : CupertinoColors.systemBackground.resolveFrom(context),
            borderRadius: const BorderRadius.vertical(top: Radius.circular(14)),
          ),
          child: Column(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  CupertinoButton(
                    child: Text(context.l10n.cancel),
                    onPressed: () => Navigator.pop(ctx),
                  ),
                  CupertinoButton(
                    child: Text(context.l10n.done, style: const TextStyle(fontWeight: FontWeight.w600)),
                    onPressed: () {
                      picked = local;
                      Navigator.pop(ctx);
                    },
                  ),
                ],
              ),
              Expanded(
                child: CupertinoDatePicker(
                  initialDateTime: initial,
                  mode: CupertinoDatePickerMode.dateAndTime,
                  use24hFormat: true,
                  onDateTimeChanged: (v) {
                    local = v;
                  },
                ),
              ),
            ],
          ),
        );
      },
    ).then((_) {
      if (picked != null && mounted) {
        setState(() {
          if (isStart) {
            _startDate = picked!;
            if (_endDate.isBefore(_startDate)) {
              _endDate = _startDate.add(const Duration(hours: 1));
            }
          } else {
            if (picked!.isBefore(_startDate)) {
              return;
            }
            _endDate = picked!;
          }
        });
      }
    });
  }

  Future<void> _save() async {
    final title = _titleCtrl.text.trim();
    if (title.isEmpty) {
      AppToast.error(context, context.l10n.titleRequired);
      return;
    }
    setState(() => _saving = true);
    final l10n = context.l10n;
    final provider = context.read<EventsProvider>();
    final data = <String, dynamic>{
      'title': title,
      'description': _descCtrl.text.trim().isEmpty ? null : _descCtrl.text.trim(),
      'startTime': _startDate.toUtc().toIso8601String(),
      'endTime': _endDate.toUtc().toIso8601String(),
      'location': _locationCtrl.text.trim().isEmpty ? null : _locationCtrl.text.trim(),
      'colorRole': _colorHexes.indexOf(_colorRole).clamp(0, 5),
      'isRecurring': _recurring,
      'reminderMinutes': _reminderMinutes,
    };
    try {
      final ok = _editing ? await provider.update(widget.eventId!, data) : await provider.create(data);
      if (!mounted) return;
      if (ok) {
        AppToast.success(context, _editing ? l10n.eventUpdated : l10n.eventCreated);
        context.pop();
      } else {
        AppToast.error(context, provider.error ?? l10n.unknownError);
      }
    } catch (e) {
      // 防御：即使 provider 抛异常也不让保存按钮卡死
      if (mounted) {
        AppToast.error(context, e.toString());
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String _fmt(DateTime dt) {
    return '${dt.year}-'
        '${dt.month.toString().padLeft(2, '0')}-'
        '${dt.day.toString().padLeft(2, '0')}  '
        '${dt.hour.toString().padLeft(2, '0')}:'
        '${dt.minute.toString().padLeft(2, '0')}';
  }

  void _showCustomColorPicker() {
    showCupertinoModalPopup(
      context: context,
      builder: (ctx) => _ColorPickerSheet(
        currentHex: _colorHexes.contains(_colorRole) ? _colorHexes[0] : _colorRole,
        onPicked: (hex) {
          setState(() => _colorRole = hex);
        },
      ),
    );
  }

  @override
  Widget build(BuildContext context) {
    final l10n = context.l10n;
    if (_loading) {
      return CupertinoPageScaffold(
        navigationBar: CupertinoNavigationBar(middle: Text(_editing ? l10n.editEvent : l10n.newEvent)),
        child: const LoadingWidget(),
      );
    }
    if (_loadFailed) {
      return CupertinoPageScaffold(
        navigationBar: CupertinoNavigationBar(middle: Text(_editing ? l10n.editEvent : l10n.newEvent)),
        child: AppErrorView(
          message: l10n.unknownError,
          onRetry: () {
            setState(() => _loadFailed = false);
            _load();
          },
        ),
      );
    }
    return CupertinoPageScaffold(
      navigationBar: CupertinoNavigationBar(
        middle: Text(_editing ? l10n.editEvent : l10n.newEvent),
        previousPageTitle: l10n.back,
      ),
      child: ListView(
        padding: const EdgeInsets.all(12),
        children: [
          // Title
          AppFormSection(
            header: Text(l10n.eventTitle),
            children: [
              CupertinoTextField(
                controller: _titleCtrl,
                placeholder: l10n.titleHint,
                placeholderStyle: TextStyle(color: CupertinoColors.systemGrey.withAlpha(140)),
                maxLength: 200,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Description — 放大 + 可滚动
          AppFormSection(
            header: Text(l10n.eventDescription),
            children: [
              CupertinoTextField(
                controller: _descCtrl,
                placeholder: l10n.eventDescription,
                maxLines: 3,
                minLines: 2,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
                textAlignVertical: TextAlignVertical.top,
                textInputAction: TextInputAction.newline,
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Location
          AppFormSection(
            header: Text(l10n.location),
            children: [
              CupertinoTextField(
                controller: _locationCtrl,
                placeholder: l10n.location,
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                prefix: const Icon(CupertinoIcons.location_solid, size: 18),
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Start Time
          AppFormSection(
            header: Text(l10n.startTime),
            children: [
              CupertinoButton(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                onPressed: () => _pickDateTime(true),
                child: Row(
                  children: [
                    const Icon(CupertinoIcons.calendar, size: 18),
                    const SizedBox(width: 8),
                    Text(_fmt(_startDate)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),

          // End Time
          AppFormSection(
            header: Text(l10n.endTime),
            children: [
              CupertinoButton(
                padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
                onPressed: () => _pickDateTime(false),
                child: Row(
                  children: [
                    const Icon(CupertinoIcons.calendar, size: 18),
                    const SizedBox(width: 8),
                    Text(_fmt(_endDate)),
                  ],
                ),
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Color — 预设颜色网格 + 自定义
          AppFormSection(
            header: Text(l10n.color),
            children: [
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  ...List.generate(_colorPalette.length, (i) {
                    final isSelected = _colorRole == _colorHexes[i];
                    final color = _colorPalette[i];
                    return GestureDetector(
                      onTap: () => setState(() => _colorRole = _colorHexes[i]),
                      child: Container(
                        width: 34, height: 34,
                        decoration: BoxDecoration(
                          color: color,
                          shape: BoxShape.circle,
                          border: isSelected
                              ? Border.all(color: CupertinoColors.label.resolveFrom(context), width: 2.5)
                              : Border.all(color: CupertinoColors.separator.resolveFrom(context).withAlpha(80)),
                        ),
                        child: isSelected
                            ? Icon(CupertinoIcons.check_mark_circled_solid, size: 18,
                                color: CupertinoColors.label.resolveFrom(context))
                            : null,
                      ),
                    );
                  }),
                  // 自定义颜色按钮
                  GestureDetector(
                    onTap: () => _showCustomColorPicker(),
                    child: Container(
                      width: 34, height: 34,
                      decoration: BoxDecoration(
                        color: !_colorHexes.contains(_colorRole)
                            ? Color(int.parse(_colorRole, radix: 16) | 0xFF000000)
                            : CupertinoColors.systemGrey.withAlpha(40),
                        shape: BoxShape.circle,
                        border: Border.all(
                          color: !_colorHexes.contains(_colorRole)
                              ? CupertinoColors.label.resolveFrom(context)
                              : CupertinoColors.separator.resolveFrom(context).withAlpha(80),
                          width: !_colorHexes.contains(_colorRole) ? 2.5 : 1,
                        ),
                      ),
                      child: Icon(
                        CupertinoIcons.square_fill_on_circle_fill,
                        size: 16,
                        color: CupertinoColors.systemGrey.resolveFrom(context),
                      ),
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Recurring
          AppFormSection(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(l10n.recurringEvent),
                  CupertinoSwitch(value: _recurring, onChanged: (v) => setState(() => _recurring = v)),
                ],
              ),
            ],
          ),
          const SizedBox(height: 4),

          // Reminder
          AppFormSection(
            children: [
              Row(
                mainAxisAlignment: MainAxisAlignment.spaceBetween,
                children: [
                  Text(l10n.reminder),
                  GestureDetector(
                    onTap: _pickReminder,
                    child: Row(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        Text(
                          _reminderLabel(l10n),
                          style: TextStyle(color: CupertinoTheme.of(context).primaryColor, fontSize: 15),
                        ),
                        const Icon(CupertinoIcons.chevron_down, size: 12),
                      ],
                    ),
                  ),
                ],
              ),
            ],
          ),
          const SizedBox(height: 12),

          // Save button
          AppPrimaryButton(
            label: _editing ? l10n.update : l10n.create,
            isLoading: _saving,
            onPressed: _save,
          ),
          const SizedBox(height: 12),
        ],
      ),
    );
  }
}

/// 自定义颜色选择底部面板 — iOS 风格（Hue 条 + 2D 饱和度/明度面板）
class _ColorPickerSheet extends StatefulWidget {
  final String currentHex;
  final ValueChanged<String> onPicked;
  const _ColorPickerSheet({required this.currentHex, required this.onPicked});

  @override
  State<_ColorPickerSheet> createState() => _ColorPickerSheetState();
}

class _ColorPickerSheetState extends State<_ColorPickerSheet> {
  late double _hue;
  late double _saturation;
  late double _brightness;

  @override
  void initState() {
    super.initState();
    final c = HSVColor.fromColor(
      Color(int.parse(widget.currentHex, radix: 16) | 0xFF000000),
    );
    _hue = c.hue;
    _saturation = c.saturation;
    _brightness = c.value;
  }

  Color get _currentColor => HSVColor.fromAHSV(1, _hue, _saturation, _brightness).toColor();

  String _colorToHex(Color c) =>
      c.value.toRadixString(16).padLeft(8, '0').substring(2).toUpperCase();

  void _apply() {
    widget.onPicked(_colorToHex(_currentColor));
    Navigator.pop(context);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = CupertinoTheme.brightnessOf(context) == Brightness.dark;
    final bg = isDark ? const Color(0xFF1C1C1E) : CupertinoColors.systemBackground.resolveFrom(context);

    return Container(
      decoration: BoxDecoration(color: bg, borderRadius: const BorderRadius.vertical(top: Radius.circular(16))),
      child: SafeArea(
        top: false,
        child: Padding(
          padding: const EdgeInsets.fromLTRB(20, 20, 20, 24),
          child: Column(mainAxisSize: MainAxisSize.min, crossAxisAlignment: CrossAxisAlignment.start, children: [
            Text(context.l10n.color, style: TextStyle(fontSize: 20, fontWeight: FontWeight.w700, color: CupertinoColors.label)),
            const SizedBox(height: 20),

            // Hue strip
            ClipRRect(
              borderRadius: BorderRadius.circular(8),
              child: Container(
                height: 36,
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    colors: List.generate(12, (i) =>
                      HSVColor.fromAHSV(1, i * 30.0, 1, 1).toColor(),
                    ),
                  ),
                ),
                child: CupertinoSlider(
                  value: _hue,
                  min: 0,
                  max: 360,
                  onChanged: (v) => setState(() => _hue = v),
                ),
              ),
            ),
            const SizedBox(height: 12),

            // 2D Sat/Bright panel
            SizedBox(
              height: 160,
              child: ClipRRect(
                borderRadius: BorderRadius.circular(10),
                child: LayoutBuilder(
                  builder: (ctx, constraints) {
                    final w = constraints.maxWidth;
                    final h = constraints.maxHeight;
                    return GestureDetector(
                      onPanDown: (d) => _updateSatBright(d.localPosition, w, h),
                      onPanUpdate: (d) => _updateSatBright(d.localPosition, w, h),
                      child: CustomPaint(
                        size: Size(w, h),
                        painter: _SatBrightPainter(_hue),
                        child: Container(
                          decoration: BoxDecoration(
                            border: Border.all(color: CupertinoColors.separator.resolveFrom(context).withAlpha(40)),
                          ),
                          child: Stack(
                            children: [
                              // Crosshair at current position
                              Positioned(
                                left: _saturation * (w - 16),
                                top: (1 - _brightness) * (h - 16),
                                child: Container(
                                  width: 16, height: 16,
                                  decoration: BoxDecoration(
                                    color: _currentColor,
                                    shape: BoxShape.circle,
                                    border: Border.all(color: CupertinoColors.white, width: 2.5),
                                    boxShadow: [BoxShadow(color: CupertinoColors.black.withAlpha(40), blurRadius: 3)],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ),
                    );
                  },
                ),
              ),
            ),
            const SizedBox(height: 16),

            // Preview + hex + Apply
            Row(children: [
              Container(width: 40, height: 40,
                decoration: BoxDecoration(color: _currentColor, borderRadius: BorderRadius.circular(10),
                  border: Border.all(color: CupertinoColors.separator.resolveFrom(context).withAlpha(60))),
              ),
              const SizedBox(width: 12),
              Text('#${_colorToHex(_currentColor)}', style: TextStyle(fontSize: 14, fontWeight: FontWeight.w600,
                color: CupertinoColors.systemGrey.resolveFrom(context))),
              const Spacer(),
              CupertinoButton(
                padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 10),
                borderRadius: BorderRadius.circular(10),
                color: CupertinoColors.systemBlue,
                child: Text(context.l10n.apply, style: const TextStyle(fontSize: 15, fontWeight: FontWeight.w600, color: CupertinoColors.white)),
                onPressed: _apply,
              ),
            ]),
          ]),
        ),
      ),
    );
  }

  void _updateSatBright(Offset pos, double w, double h) {
    setState(() {
      _saturation = (pos.dx / w).clamp(0.0, 1.0);
      _brightness = (1 - pos.dy / h).clamp(0.0, 1.0);
    });
  }
}

/// 绘制 2D 饱和度/明度面板
class _SatBrightPainter extends CustomPainter {
  final double hue;
  _SatBrightPainter(this.hue);

  @override
  void paint(Canvas canvas, Size size) {
    final w = size.width;
    final h = size.height;
    // 底部纯色 = 当前色相满饱和满亮度
    final base = HSVColor.fromAHSV(1, hue, 1, 1).toColor();

    // X 轴：左白 → 右 base 色
    final xGrad = LinearGradient(colors: [CupertinoColors.white, base], stops: const [0, 1]);
    final paint = Paint()..shader = xGrad.createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), paint);

    // Y 轴：上透明 → 下黑色（叠加）
    final yGrad = LinearGradient(
      begin: Alignment.topCenter, end: Alignment.bottomCenter,
      colors: [const Color(0x00000000), CupertinoColors.black],
    );
    final paint2 = Paint()..shader = yGrad.createShader(Rect.fromLTWH(0, 0, w, h));
    canvas.drawRect(Rect.fromLTWH(0, 0, w, h), paint2);
  }

  @override
  bool shouldRepaint(_SatBrightPainter old) => old.hue != hue;
}
