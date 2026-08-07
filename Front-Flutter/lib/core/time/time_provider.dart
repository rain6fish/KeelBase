/// Abstract time provider for testability.
abstract class TimeProvider {
  DateTime now();
}

class SystemTimeProvider implements TimeProvider {
  @override
  DateTime now() => DateTime.now();
}

class MockTimeProvider implements TimeProvider {
  DateTime _now;
  MockTimeProvider(this._now);

  @override
  DateTime now() => _now;

  void advance(Duration duration) {
    _now = _now.add(duration);
  }
}
