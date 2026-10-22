// SPDX-License-Identifier: Apache-2.0

/**
 * S4-H4 C: the governance console runs on its own DataSource, yet it registers the same
 * entity classes as the business side. If either side drifts (a column renamed, a type or
 * nullability changed), the governance DB and the business DB silently diverge. This spec
 * pins the metadata (column name / type / nullability) of the 7 shared tables on both sides.
 *
 * Metadata is built offline: `buildMetadatas()` only reads the DataSource options and entity
 * classes — it never opens a connection or touches the filesystem.
 *
 * S4-H4 C：治理台用独立 DataSource，但注册的是与业务侧同一批实体类。任一环节漂移（改列名/
 * 类型/可空），治理库与业务库就会静默分叉。本测试锁定两侧共用的 7 张表的 metadata。
 * metadata 离线构建：`buildMetadatas()` 只读 DataSource 选项与实体类，不连库、不读写文件。
 */
import { DataSource, EntityMetadata } from 'typeorm';
import { AppDataSource } from './typeorm-data-source';
import { GovernanceDataSource } from './governance-data-source';

/** The 7 tables shared by both sides (source of truth: governance.module.ts forFeature). */
const SHARED_TABLES = [
  'ai_audit_logs',
  'ai_daily_usage',
  'ai_tool_side_effects',
  'ai_agents',
  'ai_confirmation_requests',
  'ai_governance_policy',
  'ai_governance_policy_history',
] as const;

interface ColumnShape {
  type: string;
  nullable: boolean;
}

/** Build metadata without connecting: `buildMetadatas()` is protected in TypeORM's typings. */
async function buildMetadata(ds: DataSource): Promise<EntityMetadata[]> {
  await (ds as unknown as { buildMetadatas(): Promise<void> }).buildMetadatas();
  return ds.entityMetadatas;
}

function columnTypeName(type: unknown): string {
  return typeof type === 'string' ? type : String((type as { name?: string })?.name ?? type);
}

function columnsOf(meta: EntityMetadata): Map<string, ColumnShape> {
  const map = new Map<string, ColumnShape>();
  for (const column of meta.columns) {
    map.set(column.databaseName, { type: columnTypeName(column.type), nullable: column.isNullable });
  }
  return map;
}

/** Describe every column-level difference between the two sides, keyed by column name. */
function diffColumns(governance: Map<string, ColumnShape>, business: Map<string, ColumnShape>): string[] {
  const diffs: string[] = [];
  const names = new Set([...governance.keys(), ...business.keys()]);
  for (const name of [...names].sort()) {
    const gov = governance.get(name);
    const biz = business.get(name);
    if (!gov) {
      diffs.push(`${name}: only on business side`);
      continue;
    }
    if (!biz) {
      diffs.push(`${name}: only on governance side`);
      continue;
    }
    if (gov.type !== biz.type) {
      diffs.push(`${name}: type governance=${gov.type} business=${biz.type}`);
    }
    if (gov.nullable !== biz.nullable) {
      diffs.push(`${name}: nullable governance=${gov.nullable} business=${biz.nullable}`);
    }
  }
  return diffs;
}

/** Exactly one metadata per table name; zero or duplicates are both a failure. */
function findUnique(metadatas: EntityMetadata[], table: string, side: string): EntityMetadata {
  const matches = metadatas.filter((m) => m.tableName === table);
  if (matches.length !== 1) {
    throw new Error(`[${side}] expected exactly one metadata for table "${table}", found ${matches.length}`);
  }
  return matches[0];
}

describe('data source parity (governance vs business)', () => {
  let governanceMetadatas: EntityMetadata[];
  let businessMetadatas: EntityMetadata[];

  beforeAll(async () => {
    [governanceMetadatas, businessMetadatas] = await Promise.all([
      buildMetadata(GovernanceDataSource),
      buildMetadata(AppDataSource),
    ]);
  });

  it('governance DataSource exposes exactly the 7 shared ai_* tables', () => {
    const govAiTables = governanceMetadatas
      .map((m) => m.tableName)
      .filter((name) => name.startsWith('ai_'))
      .sort();
    expect(govAiTables).toEqual([...SHARED_TABLES].sort());
  });

  it('business DataSource exposes every shared table exactly once', () => {
    for (const table of SHARED_TABLES) {
      expect(() => findUnique(businessMetadatas, table, 'business')).not.toThrow();
    }
  });

  it.each(SHARED_TABLES)('%s resolves to the same entity class on both sides', (table) => {
    const gov = findUnique(governanceMetadatas, table, 'governance');
    const biz = findUnique(businessMetadatas, table, 'business');
    // A stale copy with identical columns would still pass the column diff below.
    // 只比列会让「列完全相同的旧副本」蒙混过关，故同时锁定两侧解析到同一个类。
    expect(gov.target).toBe(biz.target);
  });

  it.each(SHARED_TABLES)('%s has identical column metadata on both sides', (table) => {
    const gov = columnsOf(findUnique(governanceMetadatas, table, 'governance'));
    const biz = columnsOf(findUnique(businessMetadatas, table, 'business'));
    expect(diffColumns(gov, biz)).toEqual([]);
  });
});
