import { IsString, IsOptional, IsInt, IsBoolean, IsDateString, MinLength, MaxLength, IsIn } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiProperty({ description: 'name' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @ApiProperty({ description: 'counterparty' })
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  counterparty!: string;

  @ApiProperty({ description: 'status', enum: ['draft', 'reviewing', 'active', 'expired', 'terminated'] })
  @IsString()
  @IsIn(['draft', 'reviewing', 'active', 'expired', 'terminated'])
  status!: string;

  @ApiPropertyOptional({ description: 'amount' })
  @IsInt()
  @IsOptional()
  amount?: number;
}
