import { IsBoolean, IsOptional, IsString, Length, Matches } from 'class-validator';

export class ActivateDto {
  @IsString()
  @Length(8, 64)
  code!: string;

  @IsString()
  @Length(4, 128)
  @Matches(/^[A-Za-z0-9._:-]+$/, { message: 'hwid contains invalid characters' })
  hwid!: string;
}

export class VerifyDto extends ActivateDto {
  /** Per-process session token for single-instance (multi-open) tracking. */
  @IsOptional()
  @IsString()
  @Length(8, 64)
  @Matches(/^[A-Za-z0-9._:-]+$/, { message: 'session contains invalid characters' })
  session?: string;

  /** Set on a process's startup beat to claim/steal the session (顶号). */
  @IsOptional()
  @IsBoolean()
  takeover?: boolean;
}
