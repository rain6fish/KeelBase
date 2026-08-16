import 'package:flutter_test/flutter_test.dart';
import 'package:shared_preferences/shared_preferences.dart';
import 'package:front_app/core/services/app_cache.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  late SharedPreferences prefs;
  late AppCache cache;

  setUp(() async {
    SharedPreferences.setMockInitialValues({});
    prefs = await SharedPreferences.getInstance();
    cache = AppCache(prefs);
  });

  test('writeList / readList 往返一致', () async {
    await cache.writeList('todos', 'list', [
      {'id': 1, 'title': '买牛奶', 'completed': false},
    ]);

    final result = await cache.readList('todos', 'list');
    expect(result, isNotNull);
    expect(result!.length, 1);
    expect(result[0]['title'], '买牛奶');
  });

  test('readList 无缓存时返回 null', () async {
    expect(await cache.readList('nope', 'x'), isNull);
  });

  test('readList 损坏 JSON 时安全返回 null', () async {
    await prefs.setString('todos:list', '{not json');
    expect(await cache.readList('todos', 'list'), isNull);
  });

  test('writeInt / readInt 往返', () async {
    await cache.writeInt('notifications', 'unread', 5);
    expect(cache.readInt('notifications', 'unread'), 5);
  });

  test('remove 删除缓存', () async {
    await cache.writeList('todos', 'list', [
      {'id': 1},
    ]);
    await cache.remove('todos', 'list');
    expect(await cache.readList('todos', 'list'), isNull);
  });

  test('unavailable 降级实例：读 null、写不抛错', () async {
    final noop = AppCache.unavailable();
    expect(await noop.readList('todos', 'list'), isNull);
    await noop.writeList('todos', 'list', [
      {'id': 1},
    ]);
    expect(noop.readInt('todos', 'x'), isNull);
  });

  test('clearAll 只清 AppCache key，保留应用级键（CR-12）', () async {
    await cache.writeList('todos', 'list', [
      {'id': 1, 'title': 'x'},
    ]);
    await cache.writeInt('notifications', 'unread', 5);
    // 模拟 token/主题等应用级键（非 AppCache 格式）
    await prefs.setString('refresh_token', 'keep-me');
    await prefs.setString('theme_mode', 'dark');

    await cache.clearAll();

    expect(await cache.readList('todos', 'list'), isNull);
    expect(cache.readInt('notifications', 'unread'), isNull);
    expect(prefs.getString('refresh_token'), 'keep-me');
    expect(prefs.getString('theme_mode'), 'dark');
  });
}
