import { z } from 'zod';

/**
 * レビューの重要度レベル
 */
export const ReviewSeveritySchema = z.enum(['info', 'warning', 'error', 'critical']);
export type ReviewSeverity = z.infer<typeof ReviewSeveritySchema>;

/**
 * レビューカテゴリ
 */
export const ReviewCategorySchema = z.enum([
  'code_quality',
  'security',
  'performance',
  'style',
  'best_practices',
  'bugs',
  'maintainability'
]);
export type ReviewCategory = z.infer<typeof ReviewCategorySchema>;

// ヘルパー関数
export const ReviewSeverityHelpers = {
  /** 利用可能なすべての重要度レベル */
  all: ReviewSeveritySchema.options,

  /** 重要度の数値優先度（高いほど重要） */
  getPriority: (severity: ReviewSeverity): number => {
    const priorities = { info: 1, warning: 2, error: 3, critical: 4 };
    return priorities[severity];
  },

  /** 重要度を比較（aがbより重要な場合true） */
  isMoreSevere: (a: ReviewSeverity, b: ReviewSeverity): boolean => {
    return ReviewSeverityHelpers.getPriority(a) > ReviewSeverityHelpers.getPriority(b);
  },

  /** 重要度の日本語表示名 */
  getDisplayName: (severity: ReviewSeverity): string => {
    const names = {
      info: '情報',
      warning: '警告',
      error: 'エラー',
      critical: '重大'
    };
    return names[severity];
  }
} as const;

export const ReviewCategoryHelpers = {
  /** 利用可能なすべてのカテゴリ */
  all: ReviewCategorySchema.options,

  /** カテゴリの日本語表示名 */
  getDisplayName: (category: ReviewCategory): string => {
    const names = {
      code_quality: 'コード品質',
      security: 'セキュリティ',
      performance: 'パフォーマンス',
      style: 'スタイル',
      best_practices: 'ベストプラクティス',
      bugs: 'バグ',
      maintainability: '保守性'
    };
    return names[category];
  }
} as const;

/**
 * レビューコメント
 */
export const ReviewCommentSchema = z.object({
  id: z.string(),
  filename: z.string(),
  line: z.number().optional(), // 行番号（ファイル全体のコメントの場合はundefined）
  category: ReviewCategorySchema,
  severity: ReviewSeveritySchema,
  title: z.string(),
  description: z.string(),
  suggestion: z.string().optional(), // 修正提案
  code_snippet: z.string().optional(), // 該当コード
  suggested_fix: z.string().optional(), // 修正後のコード例
});

export type ReviewComment = z.infer<typeof ReviewCommentSchema>;

/**
 * エージェント実行結果
 */
export const AgentResultSchema = z.object({
  agent_name: z.string(),
  execution_time_ms: z.number(),
  success: z.boolean(),
  error_message: z.string().optional(),
  comments: z.array(ReviewCommentSchema),
  metadata: z.record(z.any()).optional(), // エージェント固有のメタデータ
});

export type AgentResult = z.infer<typeof AgentResultSchema>;

/**
 * 総合レビュー結果
 */
export const ReviewResultSchema = z.object({
  pr_number: z.number(),
  repository: z.string(),
  review_id: z.string(),
  created_at: z.string(), // ISO 8601形式
  agent_results: z.array(AgentResultSchema),
  summary: z.object({
    total_comments: z.number(),
    by_severity: z.object({
      info: z.number(),
      warning: z.number(),
      error: z.number(),
      critical: z.number(),
    }),
    by_category: z.record(z.number()),
    overall_score: z.number().min(0).max(10), // 0-10のスコア
    recommendation: z.enum(['approve', 'request_changes', 'comment']),
  }),
  execution_stats: z.object({
    total_time_ms: z.number(),
    files_analyzed: z.number(),
    lines_analyzed: z.number(),
  }),
});

export type ReviewResult = z.infer<typeof ReviewResultSchema>;
