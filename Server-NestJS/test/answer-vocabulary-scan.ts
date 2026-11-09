// SPDX-License-Identifier: Apache-2.0

/**
 * The «zero internal names» check, in one place so the unit spec and the e2e spec assert the same
 * thing. A hit is a cell that still carries an identifier the reader was never meant to see.
 *
 * 一处「0 内部名」判定，供单测与 e2e 共用。命中 = 某格仍带着本不该给读者看的内部分标识符。
 */
export interface InternalNameHit {
  /** Which pattern the cell tripped. */
  pattern: string;
  /** The offending cell, verbatim. */
  cell: string;
}

export interface ScanOptions {
  /**
   * Display names of the people in the rows. A username is human-chosen and may legitimately
   * contain an underscore (`u1_user`); it is the one identifier the reader **is** meant to see, so
   * it is removed before scanning rather than weakening every other pattern.
   *
   * 行里那些人的显示名。用户名由人取、可以合法地含下划线（`u1_user`）；它恰恰是读者**应该**看到的
   * 那一个标识，故扫描前先把它拿掉，而不是放宽其余每一条模式。
   */
  allowedHumanNames?: string[];
}

const PATTERNS: ReadonlyArray<{ name: string; re: RegExp }> = [
  // `crm_customer`, `tool_call`, `not_executed` — the frozen internal vocabularies.
  { name: 'snake_case token', re: /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/ },
  // `crmCustomer`, `businessEvent` — internal identifiers written in camelCase.
  { name: 'camelCase token', re: /\b[a-z]+[A-Z][a-zA-Z0-9]*\b/ },
  { name: 'uuid', re: /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i },
  // A sha256 digest is 64 hex chars; 32 is the conservative floor so a truncated one still trips.
  { name: 'hex digest', re: /\b[0-9a-f]{32,}\b/i },
  // The raw outcome / confirmation codes, exactly as the columns store them. Case-sensitive on
  // purpose: the product word «Executed» is capitalised, the code is not.
  // 原始的结局 / 确认码，与列里存的一模一样。区分大小写是有意的：产品词「Executed」首字母大写，
  // 而码是小写。
  {
    name: 'raw code',
    re: /^(executed|pending|blocked|refused|declined|failed|not_executed|approved|timeout|attempted|revoked|revoke_failed|compensating|claimed|settled|released)$/,
  },
  // Identity tokens or serialised snapshots — neither belongs in a reader's cell.
  { name: 'identity or JSON', re: /\b(user|agent|headless|key):|\{|\}|\[|\]/i },
];

export function scanForInternalNames(
  cells: string[],
  options: ScanOptions = {},
): InternalNameHit[] {
  const allowed = options.allowedHumanNames ?? [];
  const hits: InternalNameHit[] = [];
  for (const cell of cells) {
    let probe = cell;
    for (const name of allowed) {
      if (name) probe = probe.split(name).join(' ');
    }
    for (const { name, re } of PATTERNS) {
      if (re.test(probe)) hits.push({ pattern: name, cell });
    }
  }
  return hits;
}
