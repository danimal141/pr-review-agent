import { z } from 'zod';
import { PRInfoSchema } from './github.js';
import { ReviewCommentSchema } from './review.js';

/**
 * エージェントタスクの型定義
 */
export const AgentTaskSchema = z.object({
  task_id: z.string(),
  agent_name: z.string(),
  pr_info: PRInfoSchema,
  files_to_analyze: z.array(z.string()), // 解析対象ファイルのパス
  config: z.record(z.any()).optional(), // エージェント固有の設定
});

export type AgentTask = z.infer<typeof AgentTaskSchema>;

/**
 * エージェント応答の型定義
 */
export const AgentResponseSchema = z.object({
  task_id: z.string(),
  agent_name: z.string(),
  success: z.boolean(),
  comments: z.array(ReviewCommentSchema),
  execution_time_ms: z.number(),
  error_message: z.string().optional(),
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
  timeout_ms: z.number().default(30000), // 30秒デフォルト
  max_files: z.number().optional(), // 最大解析ファイル数
  file_patterns: z.array(z.string()).optional(), // 対象ファイルパターン
  exclude_patterns: z.array(z.string()).optional(), // 除外ファイルパターン
  llm_settings: z.object({
    provider: z.enum(['vercel-ai', 'anthropic-ai', 'google-ai']),
    model: z.string(),
    temperature: z.number().min(0).max(2).default(0.1),
    max_tokens: z.number().optional(),
  }),
});

export type AgentConfig = z.infer<typeof AgentConfigSchema>;

/**
 * Supervisorからの指示
 */
export const SupervisorInstructionSchema = z.object({
  instruction_id: z.string(),
  target_agents: z.array(z.string()), // 対象エージェント名
  priority: z.enum(['low', 'normal', 'high', 'critical']),
  parallel_execution: z.boolean().default(true), // 並行実行するかどうか
  dependencies: z.array(z.string()).optional(), // 依存する他のinstruction_id
  timeout_ms: z.number().default(60000),
  task_data: AgentTaskSchema,
});

export type SupervisorInstruction = z.infer<typeof SupervisorInstructionSchema>;
