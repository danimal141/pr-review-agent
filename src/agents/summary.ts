import { openai } from "@ai-sdk/openai";
import { Agent, type Tool } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import type { SummaryAgent } from "../types/agents.js";
import type { AgentResult, ReviewComment, ReviewSummary } from "../types/review.js";
import { logger } from "../utils/logger.js";

/**
 * SummaryAgentの作成
 *
 * 責任:
 * - 各専門エージェントの結果を統合
 * - 総合的なレビュー要約の生成
 * - 優先度別の問題の整理
 * - 最終的な推奨事項の提示
 */
// biome-ignore lint/suspicious/noExplicitAny: VoltAgent Tool型の制約によりanyが必要
export function createSummaryAgent(tools: Tool<any>[] = []): SummaryAgent {
  return new Agent({
    name: "summary-agent",
    instructions: `あなたはPRレビューの結果を統合・要約するSummaryAgentです。

役割:
- 複数の専門エージェント（コード解析、セキュリティ、スタイル）の結果を統合
- 重要度と影響度に基づいて問題を優先度付け
- 開発者にとって実用的で建設的なレビュー要約を生成
- 全体的な推奨事項（Approve/Request Changes/Comment）を決定

分析観点:
1. セキュリティ問題の重要度評価
2. コード品質とメンテナビリティの影響度
3. パフォーマンスへの影響
4. ベストプラクティスの遵守状況
5. 学習機会としての価値

出力は必ず日本語で、以下の方針で生成してください：
- 建設的で具体的なフィードバック
- 問題の背景と解決策の説明
- 学習につながる情報の提供
- 緊急度に応じた優先順位付け

## 入力形式
各エージェントの分析結果をJSON形式で受け取ります。

## 出力形式
以下のJSON形式で統合された要約を出力してください：
\`\`\`json
{
  "summary": {
    "overallScore": 8.5,
    "recommendation": "comment",
    "keyFindings": ["主要な発見1", "主要な発見2"],
    "totalIssues": 15,
    "bySeverity": {
      "critical": 0,
      "high": 2,
      "medium": 8,
      "low": 5
    },
    "byCategory": {
      "security": 3,
      "codeQuality": 7,
      "performance": 2,
      "style": 3
    }
  },
  "prioritizedIssues": [
    {
      "priority": "high",
      "category": "security",
      "title": "セキュリティの問題",
      "description": "詳細な説明",
      "files": ["file1.ts", "file2.ts"],
      "recommendation": "修正提案"
    }
  ],
  "positiveAspects": [
    "良い点1",
    "良い点2"
  ],
  "learningOpportunities": [
    "学習機会1",
    "学習機会2"
  ],
  "nextSteps": [
    "次のステップ1",
    "次のステップ2"
  ]
}
\`\`\``,
    llm: new VercelAIProvider(),
    model: openai("gpt-4o-mini"),
    tools,
  });
}

/**
 * SummaryAgentのヘルパークラス
 */
export class SummaryAgentHelpers {
  /**
   * 複数のエージェント結果を統合してサマリー用データを作成
   */
  static consolidateResults(agentResults: AgentResult[]): string {
    const consolidatedData = {
      timestamp: new Date().toISOString(),
      totalAgents: agentResults.length,
      overallSuccess: agentResults.every((result) => result.success),

      // エージェント別の結果要約
      agentSummaries: agentResults.map((result) => ({
        agentName: result.agentName,
        success: result.success,
        executionTime: result.executionTimeMs,
        commentCount: result.comments.length,
        severityBreakdown: SummaryAgentHelpers.calculateSeverityBreakdown(result.comments),
        keyIssues: result.comments
          .filter((comment) => comment.severity === "critical" || comment.severity === "error")
          .slice(0, 3)
          .map((comment) => ({
            filename: comment.filename,
            title: comment.title,
            severity: comment.severity,
            category: comment.category,
          })),
        metadata: result.metadata,
      })),

      // 統合メトリクス
      aggregatedMetrics: SummaryAgentHelpers.calculateAggregatedMetrics(agentResults),

      // カテゴリ別の問題分布
      categoryDistribution: SummaryAgentHelpers.calculateCategoryDistribution(agentResults),

      // ファイル別の問題集約
      fileImpact: SummaryAgentHelpers.calculateFileImpact(agentResults),
    };

    return JSON.stringify(consolidatedData, null, 2);
  }

  /**
   * 重要度別の集計を計算
   */
  private static calculateSeverityBreakdown(comments: ReviewComment[]) {
    return {
      critical: comments.filter((c) => c.severity === "critical").length,
      error: comments.filter((c) => c.severity === "error").length,
      warning: comments.filter((c) => c.severity === "warning").length,
      info: comments.filter((c) => c.severity === "info").length,
    };
  }

  /**
   * 統合メトリクスを計算
   */
  private static calculateAggregatedMetrics(agentResults: AgentResult[]) {
    const allComments = agentResults.flatMap((result) => result.comments);

    return {
      totalComments: allComments.length,
      averageIssuesPerFile: SummaryAgentHelpers.calculateAverageIssuesPerFile(allComments),
      mostProblematicFiles: SummaryAgentHelpers.findMostProblematicFiles(allComments, 5),
      securityRiskScore: SummaryAgentHelpers.calculateSecurityRiskScore(allComments),
      codeQualityScore: SummaryAgentHelpers.calculateCodeQualityScore(allComments),
      maintainabilityScore: SummaryAgentHelpers.calculateMaintainabilityScore(agentResults),
    };
  }

  /**
   * カテゴリ別の問題分布を計算
   */
  private static calculateCategoryDistribution(agentResults: AgentResult[]) {
    const allComments = agentResults.flatMap((result) => result.comments);
    const categoryCount: Record<string, number> = {};

    for (const comment of allComments) {
      categoryCount[comment.category] = (categoryCount[comment.category] || 0) + 1;
    }

    return categoryCount;
  }

  /**
   * ファイル別の影響度を計算
   */
  private static calculateFileImpact(agentResults: AgentResult[]) {
    const allComments = agentResults.flatMap((result) => result.comments);
    const fileImpact: Record<
      string,
      {
        totalIssues: number;
        bySeverity: { critical: number; error: number; warning: number; info: number };
        categories: Set<string>;
        riskLevel: string;
      }
    > = {};

    for (const comment of allComments) {
      if (!fileImpact[comment.filename]) {
        fileImpact[comment.filename] = {
          totalIssues: 0,
          bySeverity: { critical: 0, error: 0, warning: 0, info: 0 },
          categories: new Set(),
          riskLevel: "low",
        };
      }

      fileImpact[comment.filename].totalIssues++;
      fileImpact[comment.filename].bySeverity[comment.severity]++;
      fileImpact[comment.filename].categories.add(comment.category);
    }

    // リスクレベルを計算
    for (const filename of Object.keys(fileImpact)) {
      const impact = fileImpact[filename];
      impact.riskLevel = SummaryAgentHelpers.calculateFileRiskLevel(impact.bySeverity);
    }

    return fileImpact;
  }

  /**
   * ファイルあたりの平均問題数を計算
   */
  private static calculateAverageIssuesPerFile(comments: ReviewComment[]): number {
    const fileSet = new Set(comments.map((c) => c.filename));
    return fileSet.size > 0 ? comments.length / fileSet.size : 0;
  }

  /**
   * 最も問題の多いファイルを特定
   */
  private static findMostProblematicFiles(comments: ReviewComment[], limit: number) {
    const fileCounts: Record<string, number> = {};

    for (const comment of comments) {
      fileCounts[comment.filename] = (fileCounts[comment.filename] || 0) + 1;
    }

    return Object.entries(fileCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, limit)
      .map(([filename, count]) => ({ filename, issueCount: count }));
  }

  /**
   * セキュリティリスクスコアを計算
   */
  private static calculateSecurityRiskScore(comments: ReviewComment[]): number {
    const securityComments = comments.filter(
      (c) =>
        c.category === "security" ||
        c.title.toLowerCase().includes("security") ||
        c.title.toLowerCase().includes("vulnerability")
    );

    if (securityComments.length === 0) return 0;

    const weights = { critical: 10, error: 5, warning: 2, info: 1 };
    const totalScore = securityComments.reduce((score, comment) => {
      return score + (weights[comment.severity] || 0);
    }, 0);

    return Math.min(100, totalScore);
  }

  /**
   * コード品質スコアを計算
   */
  private static calculateCodeQualityScore(comments: ReviewComment[]): number {
    const qualityComments = comments.filter(
      (c) =>
        c.category === "codeQuality" ||
        c.category === "maintainability" ||
        c.category === "performance"
    );

    if (qualityComments.length === 0) return 100;

    const weights = { critical: 15, error: 8, warning: 3, info: 1 };
    const penalty = qualityComments.reduce((score, comment) => {
      return score + (weights[comment.severity] || 0);
    }, 0);

    return Math.max(0, 100 - penalty);
  }

  /**
   * 保守性スコアを計算
   */
  private static calculateMaintainabilityScore(agentResults: AgentResult[]): number {
    // コードメトリクスエージェントのメタデータから保守性指標を取得
    const metricsResult = agentResults.find(
      (result) => result.agentName.includes("metrics") || result.agentName.includes("quality")
    );

    if (metricsResult?.metadata?.maintainabilityIndex) {
      return metricsResult.metadata.maintainabilityIndex;
    }

    // フォールバック: コメント数から推定
    const totalComments = agentResults.reduce((sum, result) => sum + result.comments.length, 0);
    return Math.max(0, 100 - totalComments * 2);
  }

  /**
   * ファイルのリスクレベルを計算
   */
  private static calculateFileRiskLevel(bySeverity: Record<string, number>): string {
    if (bySeverity.critical > 0) return "critical";
    if (bySeverity.error > 2) return "high";
    if (bySeverity.error > 0 || bySeverity.warning > 5) return "medium";
    return "low";
  }

  /**
   * レビュー結果をパース
   */
  static parseSummaryResult(response: string, agentResults: AgentResult[]): ReviewSummary {
    try {
      const jsonMatch = response.match(/```json\n([\s\S]*?)\n```/);
      if (jsonMatch?.[1]) {
        const parsed = JSON.parse(jsonMatch[1]);

        return {
          totalComments: parsed.summary.totalIssues || 0,
          bySeverity: parsed.summary.bySeverity || {
            info: 0,
            warning: 0,
            error: 0,
            critical: 0,
          },
          byCategory: parsed.summary.byCategory || {},
          overallScore: parsed.summary.overallScore || 0,
          recommendation: SummaryAgentHelpers.mapRecommendation(parsed.summary.recommendation),
          keyFindings: parsed.summary.keyFindings || [],
          positiveAspects: parsed.positiveAspects || [],
          learningOpportunities: parsed.learningOpportunities || [],
          nextSteps: parsed.nextSteps || [],
        };
      }

      // フォールバック: 基本的な要約を生成
      return SummaryAgentHelpers.generateFallbackSummary(agentResults);
    } catch (error) {
      logger.error("SummaryAgent", `要約結果のパースに失敗: ${error}`);
      return SummaryAgentHelpers.generateFallbackSummary(agentResults);
    }
  }

  /**
   * 推奨事項をマッピング
   */
  private static mapRecommendation(
    recommendation: string
  ): "approve" | "request_changes" | "comment" {
    switch (recommendation?.toLowerCase()) {
      case "approve":
        return "approve";
      case "request_changes":
      case "request-changes":
        return "request_changes";
      default:
        return "comment";
    }
  }

  /**
   * フォールバック用の基本要約を生成
   */
  private static generateFallbackSummary(agentResults: AgentResult[]): ReviewSummary {
    const allComments = agentResults.flatMap((result) => result.comments);
    const bySeverity = SummaryAgentHelpers.calculateSeverityBreakdown(allComments);
    const byCategory = SummaryAgentHelpers.calculateCategoryDistribution(agentResults);

    let recommendation: "approve" | "request_changes" | "comment" = "comment";
    if (bySeverity.critical > 0 || bySeverity.error > 3) {
      recommendation = "request_changes";
    } else if (allComments.length === 0) {
      recommendation = "approve";
    }

    return {
      totalComments: allComments.length,
      bySeverity,
      byCategory,
      overallScore: SummaryAgentHelpers.calculateCodeQualityScore(allComments),
      recommendation,
      keyFindings: [`${allComments.length}件の問題が見つかりました`],
      positiveAspects: [],
      learningOpportunities: [],
      nextSteps: allComments.length > 0 ? ["指摘された問題を確認してください"] : [],
    };
  }
}
