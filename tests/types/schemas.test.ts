import { describe, expect, it } from "vitest";
import { FileChangeSchema, GitHubPREventSchema, PRInfoSchema } from "../../src/types/github.js";
import {
  AgentResultSchema,
  ReviewCategoryHelpers,
  ReviewCategorySchema,
  ReviewCommentSchema,
  ReviewResultSchema,
  ReviewSeverityHelpers,
  ReviewSeveritySchema,
} from "../../src/types/review.js";

describe("review.ts スキーマ", () => {
  describe("ReviewSeveritySchema", () => {
    it("有効なseverityレベルを受け入れる", () => {
      const validSeverities = ["info", "warning", "error", "critical"];

      for (const severity of validSeverities) {
        const result = ReviewSeveritySchema.safeParse(severity);
        expect(result.success).toBe(true);
      }
    });

    it("無効なseverityレベルを拒否する", () => {
      const result = ReviewSeveritySchema.safeParse("invalid-severity");
      expect(result.success).toBe(false);
    });
  });

  describe("ReviewCategorySchema", () => {
    it("有効なカテゴリを受け入れる", () => {
      const validCategories = [
        "codeQuality",
        "security",
        "performance",
        "style",
        "bestPractices",
        "bugs",
        "maintainability",
      ];

      for (const category of validCategories) {
        const result = ReviewCategorySchema.safeParse(category);
        expect(result.success).toBe(true);
      }
    });

    it("無効なカテゴリを拒否する", () => {
      const result = ReviewCategorySchema.safeParse("invalid-category");
      expect(result.success).toBe(false);
    });
  });

  describe("ReviewCommentSchema", () => {
    it("有効なレビューコメントを正しく解析する", () => {
      const validData = {
        id: "comment-1",
        filename: "src/index.ts",
        line: 42,
        category: "style",
        severity: "warning",
        title: "スタイル改善",
        description: "constを使用することを推奨します",
        suggestion: "letの代わりにconstを使用してください",
        codeSnippet: 'let value = "test";',
        suggestedFix: 'const value = "test";',
      };

      const result = ReviewCommentSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filename).toBe("src/index.ts");
        expect(result.data.severity).toBe("warning");
        expect(result.data.category).toBe("style");
      }
    });

    it("必須フィールドが不足している場合エラーを返す", () => {
      const invalidData = {
        filename: "src/index.ts",
        // id が不足
        category: "style",
        severity: "warning",
        title: "テスト",
        description: "テスト説明",
      };

      const result = ReviewCommentSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });

    it("オプショナルフィールドなしでも解析できる", () => {
      const validData = {
        id: "comment-1",
        filename: "src/index.ts",
        category: "codeQuality",
        severity: "info",
        title: "情報",
        description: "一般的な情報",
      };

      const result = ReviewCommentSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.line).toBeUndefined();
        expect(result.data.suggestion).toBeUndefined();
      }
    });
  });

  describe("AgentResultSchema", () => {
    it("有効なエージェント結果を正しく解析する", () => {
      const validData = {
        agentName: "CodeAnalysisAgent",
        executionTimeMs: 1500,
        success: true,
        comments: [
          {
            id: "comment-1",
            filename: "src/index.ts",
            category: "codeQuality",
            severity: "warning",
            title: "テスト",
            description: "テスト説明",
          },
        ],
        metadata: { linesAnalyzed: 100 },
      };

      const result = AgentResultSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.agentName).toBe("CodeAnalysisAgent");
        expect(result.data.success).toBe(true);
        expect(result.data.comments).toHaveLength(1);
      }
    });

    it("エラー時のエージェント結果を正しく解析する", () => {
      const validData = {
        agentName: "FailedAgent",
        executionTimeMs: 500,
        success: false,
        errorMessage: "API呼び出しに失敗しました",
        comments: [],
      };

      const result = AgentResultSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.success).toBe(false);
        expect(result.data.errorMessage).toBe("API呼び出しに失敗しました");
      }
    });
  });

  describe("ReviewResultSchema", () => {
    it("有効なレビュー結果を正しく解析する", () => {
      const validData = {
        prNumber: 123,
        repository: "owner/repo",
        reviewId: "review-456",
        createdAt: "2024-01-01T00:00:00Z",
        agentResults: [
          {
            agentName: "TestAgent",
            executionTimeMs: 1000,
            success: true,
            comments: [],
          },
        ],
        summary: {
          totalComments: 5,
          bySeverity: {
            info: 2,
            warning: 2,
            error: 1,
            critical: 0,
          },
          byCategory: {
            codeQuality: 3,
            security: 2,
          },
          overallScore: 7.5,
          recommendation: "requestChanges",
        },
        executionStats: {
          totalTimeMs: 5000,
          filesAnalyzed: 10,
          linesAnalyzed: 500,
        },
      };

      const result = ReviewResultSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.prNumber).toBe(123);
        expect(result.data.summary.overallScore).toBe(7.5);
        expect(result.data.summary.recommendation).toBe("requestChanges");
      }
    });

    it("無効なoverallScoreを拒否する", () => {
      const invalidData = {
        prNumber: 123,
        repository: "owner/repo",
        reviewId: "review-456",
        createdAt: "2024-01-01T00:00:00Z",
        agentResults: [],
        summary: {
          totalComments: 0,
          bySeverity: { info: 0, warning: 0, error: 0, critical: 0 },
          byCategory: {},
          overallScore: 15, // 範囲外の値
          recommendation: "approve",
        },
        executionStats: {
          totalTimeMs: 1000,
          filesAnalyzed: 0,
          linesAnalyzed: 0,
        },
      };

      const result = ReviewResultSchema.safeParse(invalidData);

      expect(result.success).toBe(false);
    });
  });
});

describe("github.ts スキーマ", () => {
  describe("GitHubPREventSchema", () => {
    it("有効なPRイベントを正しく解析する", () => {
      const validData = {
        action: "opened",
        number: 123,
        pullRequest: {
          id: 456,
          number: 123,
          title: "Add new feature",
          body: "This PR adds a new feature.",
          head: {
            sha: "abc123",
            ref: "feature-branch",
          },
          base: {
            sha: "def456",
            ref: "main",
          },
          changedFiles: 5,
          additions: 100,
          deletions: 20,
        },
        repository: {
          id: 789,
          name: "test-repo",
          fullName: "owner/test-repo",
          owner: {
            login: "owner",
          },
        },
      };

      const result = GitHubPREventSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.action).toBe("opened");
        expect(result.data.number).toBe(123);
        expect(result.data.pullRequest.title).toBe("Add new feature");
      }
    });

    it("有効なactionを受け入れる", () => {
      const validActions = ["opened", "synchronize", "reopened"];

      for (const action of validActions) {
        const data = {
          action,
          number: 1,
          pullRequest: {
            id: 1,
            number: 1,
            title: "Test",
            body: null,
            head: { sha: "abc", ref: "feature" },
            base: { sha: "def", ref: "main" },
          },
          repository: {
            id: 1,
            name: "test",
            fullName: "owner/test",
            owner: { login: "owner" },
          },
        };

        const result = GitHubPREventSchema.safeParse(data);
        expect(result.success).toBe(true);
      }
    });

    it("無効なactionを拒否する", () => {
      const invalidData = {
        action: "invalid-action",
        number: 1,
        pullRequest: {
          id: 1,
          number: 1,
          title: "Test",
          body: null,
          head: { sha: "abc", ref: "feature" },
          base: { sha: "def", ref: "main" },
        },
        repository: {
          id: 1,
          name: "test",
          fullName: "owner/test",
          owner: { login: "owner" },
        },
      };

      const result = GitHubPREventSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("FileChangeSchema", () => {
    it("有効なファイル変更を正しく解析する", () => {
      const validData = {
        filename: "src/index.ts",
        status: "modified",
        additions: 10,
        deletions: 5,
        changes: 15,
        patch: "@@ -1,3 +1,3 @@\n-old line\n+new line",
        sha: "abc123",
        blobUrl: "https://github.com/owner/repo/blob/abc123/src/index.ts",
      };

      const result = FileChangeSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.filename).toBe("src/index.ts");
        expect(result.data.status).toBe("modified");
        expect(result.data.additions).toBe(10);
      }
    });

    it("有効なstatusを受け入れる", () => {
      const validStatuses = ["added", "modified", "removed", "renamed"];

      for (const status of validStatuses) {
        const data = {
          filename: "test.ts",
          status,
          additions: 1,
          deletions: 0,
          changes: 1,
          sha: "abc123",
          blobUrl: "https://example.com/blob",
        };

        const result = FileChangeSchema.safeParse(data);
        expect(result.success).toBe(true);
      }
    });
  });

  describe("PRInfoSchema", () => {
    it("有効なPR情報を正しく解析する", () => {
      const validData = {
        owner: "test-owner",
        repo: "test-repo",
        number: 123,
        title: "Add new feature",
        body: "This PR adds a new feature.",
        headSha: "abc123",
        baseSha: "def456",
        files: [
          {
            filename: "src/index.ts",
            status: "modified",
            additions: 10,
            deletions: 5,
            changes: 15,
            sha: "abc123",
            blobUrl: "https://example.com/blob",
          },
        ],
      };

      const result = PRInfoSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.owner).toBe("test-owner");
        expect(result.data.number).toBe(123);
        expect(result.data.files).toHaveLength(1);
      }
    });

    it("bodyがnullでも正しく解析する", () => {
      const validData = {
        owner: "test-owner",
        repo: "test-repo",
        number: 123,
        title: "Add new feature",
        body: null,
        headSha: "abc123",
        baseSha: "def456",
        files: [],
      };

      const result = PRInfoSchema.safeParse(validData);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.body).toBeNull();
      }
    });
  });
});

describe("ヘルパー関数", () => {
  describe("ReviewSeverityHelpers", () => {
    it("すべての重要度レベルを含む", () => {
      expect(ReviewSeverityHelpers.all).toEqual(["info", "warning", "error", "critical"]);
    });

    it("重要度の優先度を正しく計算する", () => {
      expect(ReviewSeverityHelpers.getPriority("info")).toBe(1);
      expect(ReviewSeverityHelpers.getPriority("warning")).toBe(2);
      expect(ReviewSeverityHelpers.getPriority("error")).toBe(3);
      expect(ReviewSeverityHelpers.getPriority("critical")).toBe(4);
    });

    it("重要度を正しく比較する", () => {
      expect(ReviewSeverityHelpers.isMoreSevere("error", "warning")).toBe(true);
      expect(ReviewSeverityHelpers.isMoreSevere("warning", "error")).toBe(false);
      expect(ReviewSeverityHelpers.isMoreSevere("critical", "info")).toBe(true);
    });

    it("日本語表示名を正しく返す", () => {
      expect(ReviewSeverityHelpers.getDisplayName("info")).toBe("情報");
      expect(ReviewSeverityHelpers.getDisplayName("warning")).toBe("警告");
      expect(ReviewSeverityHelpers.getDisplayName("error")).toBe("エラー");
      expect(ReviewSeverityHelpers.getDisplayName("critical")).toBe("重大");
    });
  });

  describe("ReviewCategoryHelpers", () => {
    it("すべてのカテゴリを含む", () => {
      expect(ReviewCategoryHelpers.all).toEqual([
        "codeQuality",
        "security",
        "performance",
        "style",
        "bestPractices",
        "bugs",
        "maintainability",
      ]);
    });

    it("カテゴリの日本語表示名を正しく返す", () => {
      expect(ReviewCategoryHelpers.getDisplayName("codeQuality")).toBe("コード品質");
      expect(ReviewCategoryHelpers.getDisplayName("security")).toBe("セキュリティ");
      expect(ReviewCategoryHelpers.getDisplayName("performance")).toBe("パフォーマンス");
      expect(ReviewCategoryHelpers.getDisplayName("style")).toBe("スタイル");
      expect(ReviewCategoryHelpers.getDisplayName("bestPractices")).toBe("ベストプラクティス");
      expect(ReviewCategoryHelpers.getDisplayName("bugs")).toBe("バグ");
      expect(ReviewCategoryHelpers.getDisplayName("maintainability")).toBe("保守性");
    });
  });
});
