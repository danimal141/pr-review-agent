import { describe, it, expect, vi } from 'vitest';
import { GitHubPREvent, FileChange } from '../../src/types/github';

// VoltAgent関連のモジュールをモック
vi.mock('@voltagent/core', () => ({
  Agent: vi.fn()
}));

import { Agent } from '@voltagent/core';

vi.mock('@voltagent/vercel-ai', () => ({
  VercelAIProvider: vi.fn()
}));

vi.mock('@ai-sdk/openai', () => ({
  openai: vi.fn()
}));

// モック後にインポート
import { SupervisorAgentHelpers, createSupervisorAgent } from '../../src/agents/supervisor';
describe('SupervisorAgent', () => {
  describe('createSupervisorAgent', () => {
    it('正常にSupervisorAgentを作成できる', () => {
      const agent = createSupervisorAgent();
      expect(agent).toBeDefined();
    });

    it('エージェントの指示に必要なキーワードが含まれている', () => {
      // Agentコンストラクタの呼び出しを確認
      const agent = createSupervisorAgent();
      expect(vi.mocked(Agent)).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'supervisor-agent',
          instructions: expect.stringContaining('SupervisorAgent')
        })
      );
    });
  });
});

describe('SupervisorAgentHelpers', () => {
  const mockFiles: FileChange[] = [
    {
      sha: 'abc123',
      filename: 'src/utils/helper.ts',
      status: 'modified',
      additions: 50,
      deletions: 10,
      changes: 60,
      blobUrl: 'https://github.com/test/test/blob/abc123/src/utils/helper.ts',
      patch: '@@ -1,5 +1,15 @@\n+import { logger } from "./logger";\n function helper() {\n   return "test";\n }'
    },
    {
      sha: 'def456',
      filename: 'data/database.json',
      status: 'added',
      additions: 20,
      deletions: 0,
      changes: 20,
      blobUrl: 'https://github.com/test/test/blob/def456/data/database.json',
      patch: '@@ -0,0 +1,20 @@\n+{\n+  "host": "localhost",\n+  "port": 5432\n+}'
    },
    {
      sha: 'ghi789',
      filename: 'src/components/Button.tsx',
      status: 'modified',
      additions: 100,
      deletions: 20,
      changes: 120,
      blobUrl: 'https://github.com/test/test/blob/ghi789/src/components/Button.tsx',
      patch: '@@ -1,10 +1,30 @@\n+import React from "react";\n interface ButtonProps {\n   text: string;\n }'
    }
  ];

  const mockPREvent: GitHubPREvent = {
    action: 'opened',
    number: 123,
    pullRequest: {
      id: 456,
      number: 123,
      title: 'テスト用PRタイトル',
      body: 'このPRはテスト用のPRです。\n\n## 変更内容\n- ヘルパー関数の追加\n- データベース設定の追加',
      head: {
        ref: 'feature/test-branch',
        sha: 'abc123def456'
      },
      base: {
        ref: 'main',
        sha: 'main123456'
      },
      changedFiles: 3,
      additions: 170,
      deletions: 30
    },
    repository: {
      id: 789,
      name: 'test-repo',
      fullName: 'test-user/test-repo',
      owner: {
        login: 'test-user'
      }
    }
  };

  describe('categorizeFilesByType', () => {
    it('ファイルを拡張子別に正しく分類する', () => {
      const result = SupervisorAgentHelpers.categorizeFilesByType(mockFiles);

      expect(result).toEqual({
        'ts': 1,
        'json': 1,
        'tsx': 1
      });
    });

    it('拡張子がないファイルをunknownとして分類する', () => {
      const filesWithoutExtension: FileChange[] = [
        {
          ...mockFiles[0],
          filename: 'Dockerfile'
        }
      ];

      const result = SupervisorAgentHelpers.categorizeFilesByType(filesWithoutExtension);

      expect(result).toEqual({
        'unknown': 1
      });
    });
  });

  describe('calculateImpactLevel', () => {
    it('設定ファイルがある場合はcriticalを返す', () => {
      const configFiles: FileChange[] = [
        {
          ...mockFiles[0],
          filename: 'package.json',
          changes: 10
        }
      ];

      const result = SupervisorAgentHelpers.calculateImpactLevel(configFiles);

      expect(result).toBe('critical');
    });

    it('変更行数が1000行を超える場合はcriticalを返す', () => {
      const largeChangeFiles: FileChange[] = [
        {
          ...mockFiles[0],
          changes: 1500
        }
      ];

      const result = SupervisorAgentHelpers.calculateImpactLevel(largeChangeFiles);

      expect(result).toBe('critical');
    });

    it('変更行数が500-1000行の場合はhighを返す', () => {
      const mediumChangeFiles: FileChange[] = [
        {
          ...mockFiles[0],
          changes: 700
        }
      ];

      const result = SupervisorAgentHelpers.calculateImpactLevel(mediumChangeFiles);

      expect(result).toBe('high');
    });

    it('変更行数が100-500行の場合はmediumを返す', () => {
      const result = SupervisorAgentHelpers.calculateImpactLevel(mockFiles);
      const totalChanges = mockFiles.reduce((sum, file) => sum + file.changes, 0);

      expect(totalChanges).toBe(200); // 60 + 20 + 120
      expect(result).toBe('medium');
    });

    it('変更行数が100行未満の場合はlowを返す', () => {
      const smallChangeFiles: FileChange[] = [
        {
          ...mockFiles[0],
          changes: 50
        }
      ];

      const result = SupervisorAgentHelpers.calculateImpactLevel(smallChangeFiles);

      expect(result).toBe('low');
    });
  });

  describe('calculateReviewPriority', () => {
    it('セキュリティ関連ファイルがある場合はcriticalを返す', () => {
      const securityFiles: FileChange[] = [
        {
          ...mockFiles[0],
          filename: 'src/auth/security.ts'
        }
      ];

      const result = SupervisorAgentHelpers.calculateReviewPriority(securityFiles);

      expect(result).toBe('critical');
    });

    it('認証関連ファイルがある場合はcriticalを返す', () => {
      const authFiles: FileChange[] = [
        {
          ...mockFiles[0],
          filename: 'src/middleware/auth.ts'
        }
      ];

      const result = SupervisorAgentHelpers.calculateReviewPriority(authFiles);

      expect(result).toBe('critical');
    });

    it('セキュリティファイルがない場合はimpactLevelに従う', () => {
      const result = SupervisorAgentHelpers.calculateReviewPriority(mockFiles);
      const expectedImpact = SupervisorAgentHelpers.calculateImpactLevel(mockFiles);

      expect(result).toBe(expectedImpact);
    });
  });

  describe('formatPRForAnalysis', () => {
    it('PR情報を解析用形式に正しく変換する', () => {
      const result = SupervisorAgentHelpers.formatPRForAnalysis(mockPREvent, mockFiles);
      const parsed = JSON.parse(result);

      expect(parsed.prNumber).toBe(123);
      expect(parsed.title).toBe('テスト用PRタイトル');
      expect(parsed.totalFiles).toBe(3);
      expect(parsed.totalAdditions).toBe(170);
      expect(parsed.totalDeletions).toBe(30);
      expect(parsed.impactLevel).toBe('medium');
      expect(parsed.reviewPriority).toBe('medium');
      expect(parsed.files).toHaveLength(3);
    });

    it('パッチを2000文字に制限する', () => {
      const longPatchFile: FileChange = {
        ...mockFiles[0],
        patch: 'a'.repeat(3000)
      };
      const filesWithLongPatch = [longPatchFile];

      const result = SupervisorAgentHelpers.formatPRForAnalysis(mockPREvent, filesWithLongPatch);
      const parsed = JSON.parse(result);

      expect(parsed.files[0].patch).toHaveLength(2000);
    });

    it('bodyがnullの場合も正常に処理する', () => {
      const prWithoutBody = {
        ...mockPREvent,
        pullRequest: {
          ...mockPREvent.pullRequest,
          body: null
        }
      };

      const result = SupervisorAgentHelpers.formatPRForAnalysis(prWithoutBody, mockFiles);
      const parsed = JSON.parse(result);

      expect(parsed.body).toBe('');
    });
  });

  describe('parseReviewResult', () => {
    it('有効なJSONレスポンスを正しくパースする', () => {
      const mockResponse = `
レビュー結果です。

\`\`\`json
{
  "prNumber": 123,
  "summary": "テストレビュー",
  "issues": [
    {
      "filename": "test.ts",
      "line": 10,
      "severity": "warning",
      "category": "codeQuality",
      "title": "テスト問題",
      "description": "テスト説明",
      "suggestion": "テスト提案"
    }
  ],
  "recommendations": ["推奨事項1"],
  "overallScore": 8.5
}
\`\`\`

以上です。
`;

      const result = SupervisorAgentHelpers.parseReviewResult(mockResponse);

      expect(result).toBeDefined();
      expect(result?.prNumber).toBe(123);
      expect(result?.agentResults[0].agentName).toBe('supervisor');
      expect(result?.agentResults[0].comments).toHaveLength(1);
      expect(result?.summary.totalComments).toBe(1);
      expect(result?.summary.bySeverity.warning).toBe(1);
      expect(result?.summary.overallScore).toBe(8.5);
    });

    it('JSON部分がないレスポンスでnullを返す', () => {
      const invalidResponse = 'これはJSONを含まないレスポンスです。';

      const result = SupervisorAgentHelpers.parseReviewResult(invalidResponse);

      expect(result).toBeNull();
    });

    it('不正なJSONでnullを返す', () => {
      const invalidJsonResponse = `
\`\`\`json
{
  "prNumber": 123
  "invalidJson": true
}
\`\`\`
`;

      const result = SupervisorAgentHelpers.parseReviewResult(invalidJsonResponse);

      expect(result).toBeNull();
    });

    it('issuesがない場合も正常に処理する', () => {
      const responseWithoutIssues = `
\`\`\`json
{
  "prNumber": 123,
  "summary": "問題なし",
  "overallScore": 10.0
}
\`\`\`
`;

      const result = SupervisorAgentHelpers.parseReviewResult(responseWithoutIssues);

      expect(result).toBeDefined();
      expect(result?.summary.totalComments).toBe(0);
      expect(result?.agentResults[0].comments).toEqual([]);
    });

    it('severityごとの集計が正しく動作する', () => {
      const responseWithMultipleSeverities = `
\`\`\`json
{
  "prNumber": 123,
  "issues": [
    {"severity": "error"},
    {"severity": "warning"},
    {"severity": "warning"},
    {"severity": "info"},
    {"severity": "critical"}
  ]
}
\`\`\`
`;

      const result = SupervisorAgentHelpers.parseReviewResult(responseWithMultipleSeverities);

      expect(result?.summary.bySeverity.error).toBe(1);
      expect(result?.summary.bySeverity.warning).toBe(2);
      expect(result?.summary.bySeverity.info).toBe(1);
      expect(result?.summary.bySeverity.critical).toBe(1);
    });
  });
});
