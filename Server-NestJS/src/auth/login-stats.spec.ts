// SPDX-License-Identifier: Apache-2.0

import { parseUserAgent, recordLoginStats } from './login-stats';

jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  mkdirSync: jest.fn(),
  appendFileSync: jest.fn(),
}));

import { mkdirSync, appendFileSync } from 'fs';

describe('login-stats（登录页访问统计）', () => {
  describe('parseUserAgent（UA → OS / 浏览器）', () => {
    it('识别 Windows + Edge', () => {
      expect(parseUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) Edg/120.0')).toEqual({ os: 'Windows', browser: 'Edge' });
    });

    it('识别 iOS + Safari', () => {
      expect(parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Safari/605.1.15')).toEqual({ os: 'iOS', browser: 'Safari' });
    });

    it('识别 Android + Chrome', () => {
      expect(parseUserAgent('Mozilla/5.0 (Linux; Android 14) Chrome/120.0')).toEqual({ os: 'Android', browser: 'Chrome' });
    });

    it('识别 macOS + Firefox', () => {
      expect(parseUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Firefox/121.0')).toEqual({ os: 'macOS', browser: 'Firefox' });
    });

    it('识别 Linux 且浏览器未知', () => {
      expect(parseUserAgent('curl/8.0 (Linux)')).toEqual({ os: 'Linux', browser: 'unknown' });
    });

    it('未知 UA → unknown/unknown', () => {
      expect(parseUserAgent('weird-client')).toEqual({ os: 'unknown', browser: 'unknown' });
    });
  });

  describe('recordLoginStats（追加写盘，失败静默）', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('成功追加一行（IP/OS/浏览器/时间 tab 分隔）', () => {
      recordLoginStats('1.2.3.4', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0');

      expect(mkdirSync).toHaveBeenCalled();
      expect(appendFileSync).toHaveBeenCalledTimes(1);
      const [file, line] = (appendFileSync as jest.Mock).mock.calls[0] as [string, string];
      expect(file).toMatch(/login-stats\.log$/);
      expect(line).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(line).toContain('1.2.3.4\tWindows\tChrome');
    });

    it('IP 缺失 → 写 -；UA 缺失 → 解析 unknown', () => {
      recordLoginStats(undefined, undefined);

      const [, line] = (appendFileSync as jest.Mock).mock.calls[0] as [string, string];
      expect(line).toContain('\t-\tunknown\tunknown');
    });

    it('写文件失败 → 静默不抛（统计不影响登录）', () => {
      (appendFileSync as jest.Mock).mockImplementation(() => {
        throw new Error('disk full');
      });

      expect(() => recordLoginStats('1.2.3.4', 'ua')).not.toThrow();
    });
  });
});
