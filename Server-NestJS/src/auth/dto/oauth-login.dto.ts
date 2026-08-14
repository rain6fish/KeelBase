import { IsString, IsIn, IsOptional, MinLength, ValidateIf } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class OAuthLoginDto {
  @ApiProperty({
    description: 'OAuth provider name',
    example: 'google',
    enum: ['google', 'apple', 'wechat', 'alipay'],
  })
  @IsString()
  @IsIn(['google', 'apple', 'wechat', 'alipay'])
  provider!: string;

  @ApiProperty({
    description: 'ID token from the OAuth provider (JWT format) — used by Google, Apple',
    required: false,
    example: 'eyJhbGciOiJSUzI1NiIs...',
  })
  @ValidateIf((o: OAuthLoginDto) => o.provider === 'google' || o.provider === 'apple')
  @IsString()
  @MinLength(20)
  idToken?: string;

  @ApiProperty({
    description: 'Authorization code from the OAuth provider — used by WeChat, Alipay',
    required: false,
    example: '081LJL000m2zG41I3r200e5Guh1LJL0Y',
  })
  @ValidateIf((o: OAuthLoginDto) => ['wechat', 'alipay'].includes(o.provider))
  @IsString()
  @MinLength(8)
  authorizationCode?: string;

  @ApiProperty({
    description: 'OAuth client ID for audience verification (optional, defaults to env config)',
    required: false,
    example: '123456789-abcdef.apps.googleusercontent.com',
  })
  @IsOptional()
  @IsString()
  clientId?: string;

  @ApiProperty({
    description: 'Redirect URI used in the OAuth flow (needed by some providers for code exchange)',
    required: false,
    example: 'https://yourdomain.com/auth/oauth/wechat/callback',
  })
  @IsOptional()
  @IsString()
  redirectUri?: string;
}
