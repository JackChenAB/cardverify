import { Type } from 'class-transformer';
import {
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MaxLength,
} from 'class-validator';

export class LoginDto {
  @IsString()
  @MaxLength(64)
  username!: string;

  @IsString()
  @MaxLength(128)
  password!: string;
}

export class CreateBatchDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  count!: number;

  // null / omitted = permanent card
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36500)
  durationDays?: number;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  note?: string;
}

export enum CardStatusFilter {
  UNUSED = 'UNUSED',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  BANNED = 'BANNED',
}

/** Sortable columns. `expiresAt` also backs the computed "remaining time" column. */
export enum CardSortBy {
  STATUS = 'status',
  EXPIRES_AT = 'expiresAt',
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class ListCardsDto {
  @IsOptional()
  @IsEnum(CardStatusFilter)
  status?: CardStatusFilter;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  hwid?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  batchId?: number;

  @IsOptional()
  @IsEnum(CardSortBy)
  sortBy?: CardSortBy;

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number = 20;
}

export enum ExtendScope {
  IDS = 'ids',
  FILTER = 'filter',
}

export class ExtendCardsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(36500)
  days!: number;

  @IsEnum(ExtendScope)
  scope!: ExtendScope;

  // scope = 'ids': the explicit card ids to extend
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  ids?: number[];

  // scope = 'filter': extend every card matching these filters
  @IsOptional()
  @IsEnum(CardStatusFilter)
  status?: CardStatusFilter;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(128)
  hwid?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  batchId?: number;
}
