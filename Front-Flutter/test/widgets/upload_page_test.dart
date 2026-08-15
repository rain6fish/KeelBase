import 'package:flutter/widgets.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:provider/provider.dart';
import 'package:front_app/features/upload/presentation/pages/upload_page.dart';
import 'package:front_app/features/upload/presentation/providers/upload_provider.dart';
import '../helpers.dart';

void main() {
  Widget wrap() => wrapCupertinoPage(
        const UploadPage(),
        providers: [
          ChangeNotifierProvider<UploadProvider>(
            create: (_) => UploadProvider(MockUploadRepository()),
          ),
        ],
      );

  testWidgets('渲染上传页初始状态（选择文件按钮）', (tester) async {
    await tester.pumpWidget(wrap());
    await tester.pump();

    expect(find.text('上传文件'), findsWidgets);
    expect(tester.takeException(), isNull);
  });
}
