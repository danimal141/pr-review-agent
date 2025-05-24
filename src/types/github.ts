import { z } from 'zod';

/**
 * GitHub PRイベントの型定義
 */
export const GitHubPREventSchema = z.object({
  action: z.enum(['opened', 'synchronize', 'reopened']),
  number: z.number(),
  pullRequest: z.object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    head: z.object({
      sha: z.string(),
      ref: z.string(),
    }),
    base: z.object({
      sha: z.string(),
      ref: z.string(),
    }),
    changedFiles: z.number().optional(),
    additions: z.number().optional(),
    deletions: z.number().optional(),
  }),
  repository: z.object({
    id: z.number(),
    name: z.string(),
    fullName: z.string(),
    owner: z.object({
      login: z.string(),
    }),
  }),
});

export type GitHubPREvent = z.infer<typeof GitHubPREventSchema>;

/**
 * ファイル変更情報の型定義
 */
export const FileChangeSchema = z.object({
  filename: z.string(),
  status: z.enum(['added', 'modified', 'removed', 'renamed']),
  additions: z.number(),
  deletions: z.number(),
  changes: z.number(),
  patch: z.string().optional(), // 差分内容
  sha: z.string(),
  blobUrl: z.string(),
});

export type FileChange = z.infer<typeof FileChangeSchema>;

/**
 * PR情報の型定義
 */
export const PRInfoSchema = z.object({
  owner: z.string(),
  repo: z.string(),
  number: z.number(),
  title: z.string(),
  body: z.string().nullable(),
  headSha: z.string(),
  baseSha: z.string(),
  files: z.array(FileChangeSchema),
});

export type PRInfo = z.infer<typeof PRInfoSchema>;
