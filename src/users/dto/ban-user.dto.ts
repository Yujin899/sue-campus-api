import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

export class BanUserDto {
  @IsOptional()
  @IsString()
  @MaxLength(280)
  reason?: string;

  /** Omit for a permanent ban. */
  @IsOptional()
  @IsDateString()
  bannedUntil?: string;
}
