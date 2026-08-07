import 'package:flutter/cupertino.dart';

/// Apple Human Interface Guidelines–inspired theme.
class AppTheme {
  AppTheme._();

  // ─── Light ────────────────────────────────────────────────────────────────

  static const CupertinoThemeData lightTheme = CupertinoThemeData(
    brightness: Brightness.light,
    primaryColor: CupertinoColors.systemBlue,
    primaryContrastingColor: CupertinoColors.white,
    scaffoldBackgroundColor: CupertinoColors.systemBackground,
    barBackgroundColor: CupertinoColors.systemBackground,
    textTheme: CupertinoTextThemeData(
      navLargeTitleTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 34,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.37,
        color: CupertinoColors.label,
      ),
      navTitleTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 28,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.36,
        color: CupertinoColors.label,
      ),
      textStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 17,
        fontWeight: FontWeight.w400,
        letterSpacing: -0.43,
        color: CupertinoColors.label,
      ),
      tabLabelTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 10,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.07,
      ),
      actionTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 17,
        fontWeight: FontWeight.w400,
        color: CupertinoColors.systemBlue,
      ),
      dateTimePickerTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 21,
        fontWeight: FontWeight.w400,
        letterSpacing: -0.41,
        color: CupertinoColors.label,
      ),
    ),
  );

  // ─── Dark ─────────────────────────────────────────────────────────────────

  static const CupertinoThemeData darkTheme = CupertinoThemeData(
    brightness: Brightness.dark,
    primaryColor: CupertinoColors.systemBlue,
    primaryContrastingColor: CupertinoColors.white,
    scaffoldBackgroundColor: CupertinoColors.systemBackground,
    barBackgroundColor: CupertinoColors.systemBackground,
    textTheme: CupertinoTextThemeData(
      navLargeTitleTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 34,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.37,
        color: CupertinoColors.label,
      ),
      navTitleTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 28,
        fontWeight: FontWeight.w700,
        letterSpacing: 0.36,
        color: CupertinoColors.label,
      ),
      textStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 17,
        fontWeight: FontWeight.w400,
        letterSpacing: -0.43,
        color: CupertinoColors.label,
      ),
      tabLabelTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 10,
        fontWeight: FontWeight.w500,
        letterSpacing: 0.07,
      ),
      actionTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 17,
        fontWeight: FontWeight.w400,
        color: CupertinoColors.systemBlue,
      ),
      dateTimePickerTextStyle: TextStyle(
        inherit: false,
        fontFamily: 'NotoSansSC',
        fontSize: 21,
        fontWeight: FontWeight.w400,
        letterSpacing: -0.41,
        color: CupertinoColors.label,
      ),
    ),
  );
}
