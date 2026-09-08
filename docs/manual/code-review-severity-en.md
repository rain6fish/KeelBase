# Code Review Severity Mapping

> Principle: static scanners report severity against generic rules — **never treat it as KeelBase defect severity directly**. Route every finding through this mapping before it enters the backlog, otherwise every AI scan run produces dozens-to-hundreds of "critical" issues that drown the findings that actually affect Trust.

## Mapping

| Scanner Severity | KeelBase Level | Action | Example |
|---|---|---|---|
| Critical | P0 | Evaluate immediately whether it is a Trust/security/correctness defect; if yes → P0, else downgrade | Data-privilege escalation / audit-chain tampering |
| High | P0/P1 | Judge by whether it sits in Server Runtime or the Trust core chain (Identity→Authz→Tool→Confirm→SideEffect→Audit→Revoke) | Real unauthorized access / write tool executed past confirmation |
| Medium | P1/P2 | Confirm blast radius; engine defects → backlog, non-core → P2 | Resource leak, race |
| Low | P2/P3 | Usually batch into a P3 cleanup | Null fallback, edge cases |
| Style | P3 | One-off formatter/lint cleanup, no per-issue tickets | Indentation / semicolon / quotes |
| Documentation | P3 | Fix opportunistically with doc changes | Stale comments / HTML semantic tags |
| Generated / config | Usually P3 | Template/generated files must not pollute core metrics | Taro config, scaffolding boilerplate |
| Tool false positive / rule not applicable | Ignore | Record the reason, then ignore | Flutter Bridging Header missing guard, `#import`, one-off script `open` |

## Workflow

1. Scan → classify each finding through the mapping.
2. P0/P1: keep only items that genuinely belong to Trust/security/correctness; move to backlog.
3. P2: record by module; Engine/core first.
4. P3: one-off cleanup (run each stack's own formatter/lint), no per-issue tickets.
5. Ignore: document the reason, do not file an issue.

## Evidence

A full-repo static scan yielded ~**180 findings**: ~**145 "info" + 33 "warning" + only 2 "critical"**; most clustered in template/generated frontends (formatting noise) and docs; the 2 "critical" findings reviewed turned out not to be Server-Runtime security (one-off script resource handling, Flutter bridging-header false positive). Conclusion: after mapping, very few findings truly need to enter the backlog, and they concentrate on the Trust core chain.

Related: [[README]] · docs/manual/release-precheck · docs/keelbase-dna.md
