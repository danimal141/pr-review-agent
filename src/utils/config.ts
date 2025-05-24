import { z } from 'zod';
import dotenv from 'dotenv';

// 環境変数を読み込み
dotenv.config();

/**
 * アプリケーション設定のスキーマ
 */
const ConfigSchema = z.object({
  // VoltAgent設定
  port: z.number().default(3141),

  // LLM設定
  openai: z.object({
    apiKey: z.string().optional(),
  }),
  anthropic: z.object({
    apiKey: z.string().optional(),
  }),

  // GitHub設定
  github: z.object({
    token: z.string(),
  }),

  // GitHub Actions環境変数
  githubActions: z.object({
    repository: z.string().optional(),
    eventPath: z.string().optional(),
    workspace: z.string().optional(),
    sha: z.string().optional(),
    ref: z.string().optional(),
  }),

  // ログ設定
  logging: z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  }),

  // レビュー設定
  review: z.object({
    maxFiles: z.number().default(50),
    maxLinesPerFile: z.number().default(1000),
    enableSecurityScan: z.boolean().default(true),
    enableStyleCheck: z.boolean().default(true),
    enableCodeAnalysis: z.boolean().default(true),
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

/**
 * 環境変数から設定を読み込む
 */
function loadConfig(): Config {
  const config = {
    port: process.env.VOLTAGENT_PORT ? parseInt(process.env.VOLTAGENT_PORT, 10) : 3141,

    openai: {
      apiKey: process.env.OPENAI_API_KEY,
    },

    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY,
    },

    github: {
      token: process.env.GITHUB_TOKEN || '',
    },

    githubActions: {
      repository: process.env.GITHUB_REPOSITORY,
      eventPath: process.env.GITHUB_EVENT_PATH,
      workspace: process.env.GITHUB_WORKSPACE,
      sha: process.env.GITHUB_SHA,
      ref: process.env.GITHUB_REF,
    },

    logging: {
      level: (process.env.LOG_LEVEL as any) || 'info',
    },

    review: {
      maxFiles: process.env.REVIEW_MAX_FILES ? parseInt(process.env.REVIEW_MAX_FILES, 10) : 50,
      maxLinesPerFile: process.env.REVIEW_MAX_LINES_PER_FILE ? parseInt(process.env.REVIEW_MAX_LINES_PER_FILE, 10) : 1000,
      enableSecurityScan: process.env.ENABLE_SECURITY_SCAN !== 'false',
      enableStyleCheck: process.env.ENABLE_STYLE_CHECK !== 'false',
      enableCodeAnalysis: process.env.ENABLE_CODE_ANALYSIS !== 'false',
    },
  };

  return ConfigSchema.parse(config);
}

/**
 * アプリケーション設定のインスタンス
 */
export const config = loadConfig();

/**
 * GitHub Actions環境で実行されているかを判定
 */
export function isGitHubActions(): boolean {
  return Boolean(process.env.GITHUB_ACTIONS);
}

/**
 * 必要な環境変数が設定されているかを検証
 */
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.github.token) {
    errors.push('GITHUB_TOKEN環境変数が設定されていません');
  }

  if (!config.openai.apiKey && !config.anthropic.apiKey) {
    errors.push('OPENAI_API_KEYまたはANTHROPIC_API_KEYのいずれかを設定してください');
  }

  if (isGitHubActions()) {
    if (!config.githubActions.repository) {
      errors.push('GitHub Actions環境でGITHUB_REPOSITORYが設定されていません');
    }
    if (!config.githubActions.eventPath) {
      errors.push('GitHub Actions環境でGITHUB_EVENT_PATHが設定されていません');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
