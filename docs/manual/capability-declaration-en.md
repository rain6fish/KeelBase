# Lightweight Capability Declaration (EB-3 Capability Declaration)

> A low-friction entry to the **Enterprise Capability Bridge**: an external system (CRM/ERP/OA) declares "what this business system can do" in one lightweight YAML, and KeelBase generates B-path Proxy tools from it (AI-callable + governance-graded) — simpler than writing a full OpenAPI, focused on business capabilities rather than API structure.
> roadmap §22.11 EB-3: **lightweight declarative, not a metadata-driven mapping platform** (staying in bounds — no iPaaS / ETL / data sync).

## In One Sentence

> **One capability list gives an existing business system governed AI capability.**

## Declaration Format

```yaml
system:
  name: External CRM
  baseUrl: http://legacy-crm:8080/api   # external system address
  audience: legacy-crm                  # delegated JWT audience (AI Bridge)

capabilities:
  - id: list_customers                  # tool name (snake_case, AI-callable)
    label: Customer list                # human-readable name
    description: Query customers by keyword   # capability description for the LLM
    action: read                        # read → R1 (automatic) | write → R3 (requires human confirmation)
    # risk: R3                          # explicit risk-level override (optional)
    http:
      method: GET
      path: /customers
      query: [keyword]                  # query params (optional)
      # pathParams: [id]                # path params (optional)
      # body: [content, dueDate]        # body fields (write ops, optional)
```

- **action**: `read` → risk level R1 (AI executes automatically); `write` → R3 (requires human confirmation, no silent writes)
- **risk**: explicit override (e.g., high-risk writes can be marked R4 dual-approval / R5 blocked)
- **pathParams / query / body**: parameter lists (YAML flow arrays or comma-separated strings)

## Usage

```bash
# Generate B-path Proxy tool config JSON (same shape as openapi-proxy, for runtime registration)
node scripts/keelbase-capability.mjs specs/external-crm.capability.yaml

# Human-readable tool list + governance grading
node scripts/keelbase-capability.mjs specs/external-crm.capability.yaml --list
```

Apply to the runtime: write the output JSON to `PUT /settings/ai_proxy_tools` (or paste it in the Admin Console "Settings"); after restart the tools take effect (ProxyToolRegistryService registers them dynamically).

## Example: External CRM

`specs/external-crm.capability.yaml`:

| Tool | Capability | Risk level | Governance |
|---|---|---|---|
| `list_customers` | Customer list | R1 | Automatic (read) |
| `get_customer` | Customer detail | R1 | Automatic (read) |
| `list_customer_orders` | Customer orders | R1 | Automatic (read) |
| `create_followup_task` | Create follow-up task | **R3** | **Requires human confirmation** (write) |
| `update_order_amount` | Update order amount | **R3** | **Requires human confirmation** (write) |

## OpenAPI vs. Capability Declaration

| | OpenAPI (AI Bridge) | Capability declaration (EB-3) |
|---|---|---|
| Description granularity | Full API structure | Business capability list |
| Barrier to entry | Requires writing OpenAPI | One YAML |
| Parameters | Full schema | Parameter name lists |
| When to use | Already has OpenAPI / spec'd interfaces | Quick declaration / legacy systems with informal interfaces |

Both generate the same-shape Proxy tool config and share one runtime governance (Identity / Risk / Confirmation / Audit / Revoke).

## Related

- [external-crm-demo.md](external-crm-demo.md) — EB-1 external CRM integration demo
- [ai-bridge.md](ai-bridge.md) — AI Bridge (Java legacy integration, B path)
- [framework-adapter.md](framework-adapter.md) — Agent Framework governance integration (AR-2)
