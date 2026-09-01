// SPDX-License-Identifier: Apache-2.0

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailModule } from './mail.module';
import { MAIL_TRANSPORTER } from './mail.constants';

jest.mock('nodemailer');
const nodemailerMock = nodemailer as jest.Mocked<typeof nodemailer>;

describe('MailModule（工厂分支）', () => {
  const values: Record<string, unknown> = {};
  const config = { get: jest.fn((key: string, def?: unknown) => values[key] ?? def) };

  afterEach(() => {
    for (const k of Object.keys(values)) delete values[k];
    (nodemailerMock.createTransport as jest.Mock).mockClear();
  });

  async function compile() {
    const moduleRef = await Test.createTestingModule({ imports: [MailModule] })
      .overrideProvider(ConfigService)
      .useValue(config)
      .compile();
    return moduleRef.get(MAIL_TRANSPORTER);
  }

  it('MAIL_ENABLED=false 或 SMTP_HOST 为空 → transporter null（降级日志）', async () => {
    const transporter = await compile();
    expect(transporter).toBeNull();
    expect(nodemailerMock.createTransport).not.toHaveBeenCalled();
  });

  it('MAIL_ENABLED=true 且 SMTP_HOST 配置 → createTransport 带参数', async () => {
    values['MAIL_ENABLED'] = true;
    values['SMTP_HOST'] = 'smtp.example.com';
    values['SMTP_PORT'] = 587;
    values['SMTP_SECURE'] = false;
    values['SMTP_USER'] = 'user@example.com';
    values['SMTP_PASS'] = 'secret';

    const transporter = await compile();
    expect(transporter).not.toBeNull();
    expect(nodemailerMock.createTransport).toHaveBeenCalledWith(
      expect.objectContaining({
        host: 'smtp.example.com',
        port: 587,
        secure: false,
        auth: { user: 'user@example.com', pass: 'secret' },
      }),
    );
  });

  it('SMTP_USER/PASS 为空 → auth undefined', async () => {
    values['MAIL_ENABLED'] = true;
    values['SMTP_HOST'] = 'smtp.example.com';
    const transporter = await compile();
    expect(transporter).not.toBeNull();
    const args = (nodemailerMock.createTransport as jest.Mock).mock.calls[0][0];
    expect(args.auth).toBeUndefined();
  });
});
