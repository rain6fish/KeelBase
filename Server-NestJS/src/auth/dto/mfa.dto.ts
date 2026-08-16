import { IsNotEmpty, IsString, Length } from 'class-validator';

/** WEB-FRONT-4 MFA：验证绑定 code 并启用（secret 来自 /mfa/setup）。 */
export class MfaVerifyDto {
  @IsString()
  @IsNotEmpty()
  secret!: string;

  @IsString()
  @Length(6, 6)
  code!: string;
}

/** WEB-FRONT-4 MFA：停用（需正确 TOTP code 确认）。 */
export class MfaDisableDto {
  @IsString()
  @Length(6, 6)
  code!: string;
}
