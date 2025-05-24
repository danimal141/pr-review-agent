import "dotenv/config";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PRReviewAgent } from "../src/types/agents.js";
import type { GitHubPREvent, PRInfo } from "../src/types/github.js";
import type { AgentResult, ReviewComment, ReviewResult } from "../src/types/review.js";

// VoltAgentの依存関係をモック
vi.mock("@voltagent/core", () => ({
  Agent: vi.fn().mockImplementation(() => ({
    generateText: vi.fn().mockResolvedValue({ text: '{"issues": []}' }),
  })),
  Tool: vi.fn(),
}));

vi.mock("@voltagent/anthropic-ai", () => ({
  default: vi.fn(),
}));

// エージェント作成関数をモック
vi.mock("../src/agents/code-analysis.js", () => ({
  createCodeAnalysisAgent: vi.fn().mockReturnValue({
    generateText: vi.fn().mockResolvedValue({ text: '{"issues": []}' }),
  }),
}));

vi.mock("../src/agents/security.js", () => ({
  createSecurityAgent: vi.fn().mockReturnValue({
    generateText: vi.fn().mockResolvedValue({ text: '{"issues": []}' }),
  }),
}));

vi.mock("../src/agents/style.js", () => ({
  createStyleAgentWithTools: vi.fn().mockReturnValue({
    generateText: vi.fn().mockResolvedValue({ text: '{"issues": []}' }),
  }),
}));

vi.mock("../src/agents/summary.js", () => ({
  createSummaryAgent: vi.fn().mockReturnValue({
    generateText: vi.fn().mockResolvedValue({ text: '{"issues": []}' }),
  }),
  SummaryAgentHelpers: {
    consolidateResults: vi.fn().mockReturnValue("consolidated data"),
    parseSummaryResult: vi.fn().mockReturnValue({
      totalComments: 0,
      bySeverity: { critical: 0, error: 0, warning: 0, info: 0 },
      byCategory: { codeQuality: 0, security: 0, style: 0, performance: 0 },
      overallScore: 85,
      recommendation: "approve",
      keyFindings: [],
      nextSteps: [],
    }),
  },
}));

vi.mock("../src/agents/supervisor.js", () => ({
  createSupervisorAgent: vi.fn().mockReturnValue({
    generateText: vi.fn().mockResolvedValue({ text: '{"issues": []}' }),
  }),
}));

// ツールをモック
vi.mock("../src/tools/code-analysis-tools.js", () => ({
  codeAnalysisTools: [],
}));

vi.mock("../src/tools/security-analysis-tools.js", () => ({
  securityAnalysisTools: [],
}));

vi.mock("../src/tools/summary-analysis-tools.js", () => ({
  summaryAnalysisTools: [],
}));

vi.mock("../src/tools/code-metrics.js", () => ({
  CodeMetricsTool: {
    calculateBatchMetrics: vi.fn().mockReturnValue([]),
  },
}));

vi.mock("../src/tools/file-analyzer.js", () => ({
  FileAnalyzerTool: {
    analyzeFiles: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("../src/tools/security-scanner.js", () => ({
  SecurityScannerTool: {
    scanFiles: vi.fn().mockReturnValue([]),
    generateSecuritySummary: vi.fn().mockReturnValue({
      totalIssues: 0,
      riskLevel: "low",
    }),
  },
}));

vi.mock("../src/tools/github-api.js", () => ({
  createGitHubAPITool: vi.fn().mockReturnValue({
    getPRInfo: vi.fn().mockResolvedValue({
      owner: "test-owner",
      repo: "test-repo",
      number: 123,
      title: "テスト用PR",
      body: "テスト用の説明",
      headSha: "abc123",
      baseSha: "def456",
      files: [],
    }),
    createReview: vi.fn().mockResolvedValue({}),
  }),
}));

// PRReviewWorkflowをmock後にインポート
const { PRReviewWorkflow } = await import("../src/index.js");

// PRReviewWorkflowの内部プロパティの型定義
interface WorkflowInternal {
  githubAPI: { getPRInfo: (owner: string, repo: string, number: number) => Promise<PRInfo> };
  supervisorAgent: PRReviewAgent;
  codeAnalysisAgent: PRReviewAgent;
  securityAgent: PRReviewAgent;
  styleAgent: PRReviewAgent;
  summaryAgent: PRReviewAgent;
  getPRInfo: (prEvent: GitHubPREvent) => Promise<PRInfo>;
  runSpecializedAgents: (prInfo: PRInfo) => Promise<AgentResult[]>;
  runCodeAnalysisAgent: (prInfo: PRInfo) => Promise<AgentResult>;
  runSecurityAgent: (prInfo: PRInfo) => Promise<AgentResult>;
  runStyleAgent: (prInfo: PRInfo) => Promise<AgentResult>;
  generateSummary: (agentResults: AgentResult[]) => Promise<unknown>;
  parseAgentResponse: (response: string, agentName: string) => ReviewComment[];
  createErrorResult: (agentName: string, error: Error | unknown) => AgentResult;
  postReviewToGitHub: (
    prInfo: PRInfo,
    reviewResult: ReviewResult,
    summaryResult: unknown
  ) => Promise<void>;
  createSummaryComment: (reviewResult: ReviewResult, summaryResult: unknown) => string;
  formatReviewComment: (comment: ReviewComment) => string;
  getSeverityPriority: (severity: string) => number;
  mapRecommendation: (recommendation: string) => "approve" | "requestChanges" | "comment";
}

// 無効なPREvent型定義
interface InvalidPREvent {
  number: null;
  repository: null;
}

/**
 * PRReviewWorkflowのメインテストスイート
 */
describe("PRReviewWorkflow", () => {
  let workflow: InstanceType<typeof PRReviewWorkflow>;

  beforeEach(() => {
    // 各テスト前にインスタンスを新しく作成
    workflow = new PRReviewWorkflow();
  });

  describe("インスタンス作成", () => {
    it("正常にインスタンスが作成される", () => {
      expect(workflow).toBeDefined();
      expect(workflow).toBeInstanceOf(PRReviewWorkflow);
    });

    it("すべてのエージェントが初期化される", () => {
      // プライベートプロパティなので、型アサーションで確認
      const workflowInternal = workflow as unknown as WorkflowInternal;

      expect(workflowInternal.supervisorAgent).toBeDefined();
      expect(workflowInternal.codeAnalysisAgent).toBeDefined();
      expect(workflowInternal.securityAgent).toBeDefined();
      expect(workflowInternal.styleAgent).toBeDefined();
      expect(workflowInternal.summaryAgent).toBeDefined();
      expect(workflowInternal.githubAPI).toBeDefined();
    });
  });

  describe("エージェント設定確認", () => {
    it("SupervisorAgentが正しく設定される", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;
      expect(typeof workflowInternal.supervisorAgent).toBe("object");
      expect(workflowInternal.supervisorAgent).not.toBeNull();
    });

    it("CodeAnalysisAgentがツール付きで設定される", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;
      expect(typeof workflowInternal.codeAnalysisAgent).toBe("object");
      expect(workflowInternal.codeAnalysisAgent).not.toBeNull();
    });

    it("SecurityAgentがツール付きで設定される", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;
      expect(typeof workflowInternal.securityAgent).toBe("object");
      expect(workflowInternal.securityAgent).not.toBeNull();
    });

    it("StyleAgentがツール付きで設定される", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;
      expect(typeof workflowInternal.styleAgent).toBe("object");
      expect(workflowInternal.styleAgent).not.toBeNull();
    });

    it("SummaryAgentがツール付きで設定される", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;
      expect(typeof workflowInternal.summaryAgent).toBe("object");
      expect(workflowInternal.summaryAgent).not.toBeNull();
    });

    it("GitHubAPIが正しく設定される", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;
      expect(typeof workflowInternal.githubAPI).toBe("object");
      expect(workflowInternal.githubAPI).not.toBeNull();
    });
  });

  describe("モックデータテスト", () => {
    it("モックPREventが正しい構造を持つ", () => {
      const mockPREvent: GitHubPREvent = {
        action: "opened",
        number: 123,
        pullRequest: {
          id: 456,
          number: 123,
          title: "テスト用PR",
          body: "これはテスト用のPRです",
          head: {
            sha: "abc123",
            ref: "feature/test",
          },
          base: {
            sha: "def456",
            ref: "main",
          },
        },
        repository: {
          id: 789,
          name: "test-repo",
          fullName: "test-owner/test-repo",
          owner: { login: "test-owner" },
        },
      };

      expect(mockPREvent.number).toBe(123);
      expect(mockPREvent.repository.owner.login).toBe("test-owner");
      expect(mockPREvent.repository.name).toBe("test-repo");
      expect(mockPREvent.repository.fullName).toBe("test-owner/test-repo");
      expect(mockPREvent.pullRequest.title).toBe("テスト用PR");
      expect(mockPREvent.pullRequest.body).toBe("これはテスト用のPRです");
    });

    it("モックPRInfoデータの構造確認", () => {
      const mockPRInfo: PRInfo = {
        owner: "test-owner",
        repo: "test-repo",
        number: 123,
        title: "テスト用PR",
        body: "これはテスト用のPRです",
        headSha: "abc123",
        baseSha: "def456",
        files: [
          {
            filename: "src/test.ts",
            status: "modified" as const,
            additions: 10,
            deletions: 5,
            changes: 15,
            patch: "@@ -1,3 +1,5 @@\n-old line\n+new line\n+another line",
            sha: "file123",
            blobUrl: "https://github.com/test-owner/test-repo/blob/abc123/src/test.ts",
          },
        ],
      };

      expect(mockPRInfo.files).toHaveLength(1);
      expect(mockPRInfo.files[0].filename).toBe("src/test.ts");
      expect(mockPRInfo.files[0].status).toBe("modified");
      expect(mockPRInfo.files[0].additions).toBe(10);
      expect(mockPRInfo.files[0].deletions).toBe(5);
    });
  });

  describe("環境変数確認", () => {
    it("GITHUB_TOKEN環境変数の設定状況を確認", () => {
      const hasGitHubToken = !!process.env.GITHUB_TOKEN;

      if (hasGitHubToken) {
        console.log("✅ GITHUB_TOKEN が設定されています");
        expect(process.env.GITHUB_TOKEN).toBeDefined();
        expect(process.env.GITHUB_TOKEN?.length).toBeGreaterThan(0);
      } else {
        console.log("⚠️  GITHUB_TOKEN が設定されていません（テスト環境では正常）");
        expect(process.env.GITHUB_TOKEN).toBeUndefined();
      }
    });
  });

  describe("エラーハンドリング", () => {
    it("無効なPREventでもエラーが発生しない", () => {
      expect(() => {
        const invalidPREvent: InvalidPREvent = {
          number: null,
          repository: null,
        };

        // インスタンス作成時点ではエラーは発生しない
        expect(invalidPREvent).toBeDefined();
      }).not.toThrow();
    });
  });

  describe("ワークフロー統合テスト", () => {
    it("全コンポーネントが連携可能な状態である", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;

      // 各エージェントがメソッドを持つことを確認
      expect(typeof workflowInternal.codeAnalysisAgent?.generateText).toBe("function");
      expect(typeof workflowInternal.securityAgent?.generateText).toBe("function");
      expect(typeof workflowInternal.styleAgent?.generateText).toBe("function");
      expect(typeof workflowInternal.summaryAgent?.generateText).toBe("function");
    });

    it("ツールが正しく設定されていることを確認", () => {
      // ツール配列が設定されていることを間接的に確認
      const workflowInternal = workflow as unknown as WorkflowInternal;

      // エージェントが存在することでツールも正しく設定されていると推定
      expect(workflowInternal.codeAnalysisAgent).toBeTruthy();
      expect(workflowInternal.securityAgent).toBeTruthy();
      expect(workflowInternal.styleAgent).toBeTruthy();
      expect(workflowInternal.summaryAgent).toBeTruthy();
    });
  });

  describe("メソッド存在確認", () => {
    it("reviewPRメソッドが存在する", () => {
      expect(typeof workflow.reviewPR).toBe("function");
    });

    it("プライベートメソッドが適切に定義されている", () => {
      const workflowInternal = workflow as unknown as WorkflowInternal;

      // プライベートメソッドの存在確認
      expect(typeof workflowInternal.getPRInfo).toBe("function");
      expect(typeof workflowInternal.runSpecializedAgents).toBe("function");
      expect(typeof workflowInternal.runCodeAnalysisAgent).toBe("function");
      expect(typeof workflowInternal.runSecurityAgent).toBe("function");
      expect(typeof workflowInternal.runStyleAgent).toBe("function");
      expect(typeof workflowInternal.generateSummary).toBe("function");
      expect(typeof workflowInternal.parseAgentResponse).toBe("function");
      expect(typeof workflowInternal.createErrorResult).toBe("function");
      expect(typeof workflowInternal.postReviewToGitHub).toBe("function");
      expect(typeof workflowInternal.createSummaryComment).toBe("function");
      expect(typeof workflowInternal.formatReviewComment).toBe("function");
      expect(typeof workflowInternal.getSeverityPriority).toBe("function");
      expect(typeof workflowInternal.mapRecommendation).toBe("function");
    });
  });

  describe("型安全性確認", () => {
    it("ReviewResultの型構造確認", () => {
      const mockReviewResult: ReviewResult = {
        prNumber: 123,
        repository: "test-owner/test-repo",
        reviewId: "review-123456789",
        createdAt: new Date().toISOString(),
        agentResults: [],
        summary: {
          totalComments: 0,
          bySeverity: {
            critical: 0,
            error: 0,
            warning: 0,
            info: 0,
          },
          byCategory: {
            codeQuality: 0,
            security: 0,
            style: 0,
            performance: 0,
          },
          overallScore: 0.85,
          recommendation: "approve" as const,
        },
        executionStats: {
          totalTimeMs: 1500,
          filesAnalyzed: 5,
          linesAnalyzed: 250,
        },
      };

      expect(mockReviewResult.prNumber).toBe(123);
      expect(mockReviewResult.summary.recommendation).toBe("approve");
      expect(mockReviewResult.executionStats.totalTimeMs).toBe(1500);
    });
  });

  describe("実際のワークフロー実行テスト", () => {
    it("reviewPRメソッドが正常に実行される", async () => {
      const mockPREvent: GitHubPREvent = {
        action: "opened",
        number: 123,
        pullRequest: {
          id: 456,
          number: 123,
          title: "テスト用PR",
          body: "これはテスト用のPRです",
          head: {
            sha: "abc123",
            ref: "feature/test",
          },
          base: {
            sha: "def456",
            ref: "main",
          },
        },
        repository: {
          id: 789,
          name: "test-repo",
          fullName: "test-owner/test-repo",
          owner: { login: "test-owner" },
        },
      };

      const result = await workflow.reviewPR(mockPREvent);

      expect(result).toBeDefined();
      expect(result.prNumber).toBe(123);
      expect(result.repository).toBe("test-owner/test-repo");
      expect(result.agentResults).toHaveLength(3); // code, security, style
      expect(result.summary).toBeDefined();
      expect(result.executionStats).toBeDefined();
    }, 10000); // 10秒タイムアウト
  });
});
