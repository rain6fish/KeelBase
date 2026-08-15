import 'package:flutter/cupertino.dart';

/// Apple Human Interface Guidelines–inspired theme.
class AppTheme {
  AppTheme._();

  static const String _fontFamily = 'NotoSansSC';

  /// 品牌主色：primaryColor 与 action/按钮文本统一取自此处，改一处全局生效。
  static const Color _primary = CupertinoColors.systemBlue;

  /// 浅/深色共用文本主题：所用颜色（label / systemBlue）均为动态色，
  /// 会按当前主题亮度自动解析，故可安全共享。
  static const CupertinoTextThemeData _textTheme = CupertinoTextThemeData(
    navLargeTitleTextStyle: TextStyle(
      inherit: false,
      fontFamily: _fontFamily,
      fontSize: 34,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.37,
      color: CupertinoColors.label,
    ),
    navTitleTextStyle: TextStyle(
      inherit: false,
      fontFamily: _fontFamily,
      fontSize: 28,
      fontWeight: FontWeight.w700,
      letterSpacing: 0.36,
      color: CupertinoColors.label,
    ),
    textStyle: TextStyle(
      inherit: false,
      fontFamily: _fontFamily,
      fontSize: 17,
      fontWeight: FontWeight.w400,
      letterSpacing: -0.43,
      color: CupertinoColors.label,
    ),
    tabLabelTextStyle: TextStyle(
      inherit: false,
      fontFamily: _fontFamily,
      fontSize: 10,
      fontWeight: FontWeight.w500,
      letterSpacing: 0.07,
    ),
    actionTextStyle: TextStyle(
      inherit: false,
      fontFamily: _fontFamily,
      fontSize: 17,
      fontWeight: FontWeight.w400,
      color: _primary,
    ),
    dateTimePickerTextStyle: TextStyle(
      inherit: false,
      fontFamily: _fontFamily,
      fontSize: 21,
      fontWeight: FontWeight.w400,
      letterSpacing: -0.41,
      color: CupertinoColors.label,
    ),
  );

  // ─── Light ────────────────────────────────────────────────────────────────

  static const CupertinoThemeData lightTheme = CupertinoThemeData(
    brightness: Brightness.light,
    primaryColor: _primary,
    primaryContrastingColor: CupertinoColors.white,
    scaffoldBackgroundColor: CupertinoColors.systemBackground,
    barBackgroundColor: CupertinoColors.systemBackground,
    textTheme: _textTheme,
  );

  // ─── Dark ─────────────────────────────────────────────────────────────────

  static const CupertinoThemeData darkTheme = CupertinoThemeData(
    brightness: Brightness.dark,
    primaryColor: _primary,
    primaryContrastingColor: CupertinoColors.white,
    scaffoldBackgroundColor: CupertinoColors.systemBackground,
    barBackgroundColor: CupertinoColors.systemBackground,
    textTheme: _textTheme,
  );
}
