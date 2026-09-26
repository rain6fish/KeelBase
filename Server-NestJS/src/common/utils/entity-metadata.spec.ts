// SPDX-License-Identifier: Apache-2.0

import {
  DISPLAY_COLUMN_NAMES,
  OWNER_COLUMN_NAMES,
  pickDisplayColumn,
  pickOwnerColumn,
} from './entity-metadata';

describe('entity-metadata', () => {
  const cols = (...names: string[]) => ({ columns: names.map((propertyName) => ({ propertyName })) });

  describe('pickDisplayColumn', () => {
    it('展示列按**元数据顺序**取第一个命中的 —— 不是「优先名次最高」的那个', () => {
      // 这条与撤销路径共用，规则自始如此；上一条断言钉住「顺序决定，而非优先级」：
      // 同两个名字换个声明顺序，取到的列就跟着换。
      expect(pickDisplayColumn(cols('id', 'title', 'name'))).toBe('title');
      expect(pickDisplayColumn(cols('id', 'name', 'title'))).toBe('name');
      expect(pickDisplayColumn(cols('subject'))).toBe('subject');
      expect(pickDisplayColumn(cols('label'))).toBe('label');
    });

    it('没有展示列时答 null，而不是硬塞一个 title', () => {
      expect(pickDisplayColumn(cols('id', 'state', 'dataJson'))).toBeNull();
      expect(pickDisplayColumn({})).toBeNull();
      expect(pickDisplayColumn({ columns: [] })).toBeNull();
    });

    it('优先次序就是常量本身（改常量即改行为，这条跟着红）', () => {
      expect(DISPLAY_COLUMN_NAMES).toEqual(['title', 'name', 'subject', 'label']);
    });
  });

  describe('pickOwnerColumn', () => {
    it('按 userId → requesterId → initiatorId 回落', () => {
      expect(pickOwnerColumn(cols('id', 'requesterId', 'userId'))).toBe('userId');
      expect(pickOwnerColumn(cols('id', 'requesterId'))).toBe('requesterId');
      expect(pickOwnerColumn(cols('initiatorId'))).toBe('initiatorId');
    });

    it('无主实体答 null —— 组织级记录本就没有归属人', () => {
      expect(pickOwnerColumn(cols('id', 'orgId', 'name'))).toBeNull();
      expect(pickOwnerColumn({})).toBeNull();
    });

    it('三个候选名与常量一致', () => {
      expect(OWNER_COLUMN_NAMES).toEqual(['userId', 'requesterId', 'initiatorId']);
    });
  });
});
