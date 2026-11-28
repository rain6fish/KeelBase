# Delivery baseline — 2026-11-28T06:17:41Z

Non-human run; evidence ceiling E3, no E4. 6 passed, 0 failed, 0 unverified.

```
criterion / 判据     status      detail
checkout:clean         PASS        all three checkouts are at a recorded HEAD and clean
ci                     PASS        every required workflow is success at each pinned commit; JDK 25 legs reported, not counted
check:all              PASS        exit 0; summary: [check-all] 36/36 全过（47.4s）
e2e                    PASS        exit 0 (logs/e2e.log)
release-rehearsal      PASS        image built locally: keelbase:delivery-baseline-20261128061708 (sha256:dcdc3ef618e7c5b6305faa9998be27f7762f8376a2c5ece7e3fea2625830a570)
evidence               PASS        evidence directory: /d/Rain6fish/.delivery-baseline/q5-1128/evidence
```

Commands, exit codes and log paths are under `logs/`; each reading is in `readings.txt`.

## 中文

非真人运行；证据上限 E3、无 E4。通过 6 项、不成立 0 项、未核验 0 项。

```
criterion / 判据     status      detail
checkout:clean         PASS        all three checkouts are at a recorded HEAD and clean
ci                     PASS        every required workflow is success at each pinned commit; JDK 25 legs reported, not counted
check:all              PASS        exit 0; summary: [check-all] 36/36 全过（47.4s）
e2e                    PASS        exit 0 (logs/e2e.log)
release-rehearsal      PASS        image built locally: keelbase:delivery-baseline-20261128061708 (sha256:dcdc3ef618e7c5b6305faa9998be27f7762f8376a2c5ece7e3fea2625830a570)
evidence               PASS        evidence directory: /d/Rain6fish/.delivery-baseline/q5-1128/evidence
```

命令、退出码与日志路径在 `logs/` 下；逐项读数在 `readings.txt`。
