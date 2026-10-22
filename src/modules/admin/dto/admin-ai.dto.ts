import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Max, Min, ValidateIf } from 'class-validator';

export class UpdateAiSettingsDto {
  @ApiPropertyOptional() @IsOptional() @IsBoolean() limitsEnabled?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(1000) burstPerMinute?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) userDailyBudgetUsd?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) userMonthlyBudgetUsd?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @Min(0) globalDailyBudgetUsd?: number;
  @ApiPropertyOptional() @IsOptional() @IsInt() @Min(1) @Max(100) warnPercent?: number;
}

export class UpdateAiUserLimitDto {
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) dailyBudgetUsd: number | null;
  @ApiPropertyOptional({ nullable: true }) @ValidateIf((_, v) => v !== null) @IsNumber() @Min(0) monthlyBudgetUsd: number | null;
  @ApiPropertyOptional() @IsBoolean() blocked: boolean;
  @ApiPropertyOptional({ nullable: true }) @IsOptional() @IsString() note?: string | null;
}

export interface AiSettingsDto {
  limitsEnabled: boolean;
  burstPerMinute: number;
  userDailyBudgetUsd: number;
  userMonthlyBudgetUsd: number;
  globalDailyBudgetUsd: number;
  warnPercent: number;
}

export interface AiUserLimitDto {
  dailyBudgetUsd: number | null;
  monthlyBudgetUsd: number | null;
  blocked: boolean;
  note: string | null;
}

export interface AiUsageStatsDto {
  range: { from: string; to: string };
  totals: { calls: number; inputTokens: number; outputTokens: number; costUsd: number; blockedCount: number; cachedCount: number; uniqueUsers: number };
  today: { costUsd: number; globalBudgetUsd: number; percent: number };
  perDay: { date: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number; blockedCount: number }[];
  perFeature: { feature: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number; blockedCount: number; cachedCount: number }[];
  perModel: { provider: string; model: string | null; calls: number; inputTokens: number; outputTokens: number; costUsd: number }[];
  topUsers: {
    userId: number; name: string; email: string; calls: number; inputTokens: number; outputTokens: number; costUsd: number;
    blockedCount: number; todayCostUsd: number; monthCostUsd: number; limit: AiUserLimitDto | null;
  }[];
  recentBlocks: { createdAt: string; userId: number | null; name: string | null; email: string | null; feature: string; reason: string | null }[];
}
