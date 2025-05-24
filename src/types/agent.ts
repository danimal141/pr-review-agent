import { z } from 'zod';
import { PRInfoSchema } from './github.js';
import { ReviewCommentSchema } from './review.js';

/**
 * エージェントタスクの型定義
 */
export const AgentTaskSchema = z.object({
  taskId: z.string(),
  agentName: z.string(),
  prInfo: PRInfoSchema,
  filesToAnalyze: z.array(z.string()), // 解析対象ファイルのパス
  config: z.record(z.any()).optional(), // エージェント固有の設定
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;

/**
 * エージェント応答の型定義
 */
export const AgentResponseSchema = z.object({
  taskId: z.string(),
  agentName: z.string(),
  success: z.boolean(),
  comments: z.array(ReviewCommentSchema),
  executionTimeMs: z.number(),
  errorMessage: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

/**
 * エージェント設定の型定義
 */
export const AgentConfigSchema = z.object({
  name: z.string(),
  description: z.string(),
  enabled: z.boolean(),
  priority: z.number().min(1).max(10), // 1が最高優先度
  timeoutMs: z.number().default(30000), // 30秒デフォルト
  maxFiles: z.number().optional(), // 最大解析ファイル数
  filePatterns: z.array(z.string()).optional(), // 対象ファイルパターン
  excludePatterns: z.array(z.string()).optional(), // 除外ファイルパターン
  llmSettings: z.object({
    provider: z.enum(['vercel-ai', 'anthropic-ai', 'google-ai']),
    model: z.string(),
    temperature: z.number().min(0).max(2).default(0.1),
    maxTokens: z.number().optional(),
  }),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Supervisorからの指示
 */
export const SupervisorInstructionSchema = z.object({
  instructionId: z.string(),
  targetAgents: z.array(z.string()), // 対象エージェント名
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  parallelExecution: z.boolean().default(true), // 並行実行するかどうか
  dependencies: z.array(z.string()).optional(), // 依存する他のinstructionId
  timeoutMs: z.number().default(60000),
  taskData: AgentTaskSchema,
});

export type SupervisorInstruction = z.infer<typeof SupervisorInstructionSchema>;
