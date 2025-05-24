import { Tool } from "@voltagent/core";
import { z } from "zod";

/**
 * エージェント結果を統合するツール
 */
export const consolidateAgentResultsTool = new Tool({
  name: "consolidate_agent_results",
  description: "複数のエージェントの分析結果を統合し、包括的なレポートを生成します",
  parameters: z.object({
    agentResults: z
      .array(
        z.object({
          agentName: z.string(),
          executionTimeMs: z.number(),
          success: z.boolean(),
          comments: z.array(
            z.object({
              id: z.string(),
              filename: z.string(),
              line: z.number().optional(),
              category: z.string(),
              severity: z.string(),
              title: z.string(),
              description: z.string(),
              suggestion: z.string().optional(),
              codeSnippet: z.string().optional(),
            })
          ),
          metadata: z.record(z.any()).optional(),
          errorMessage: z.string().optional(),
        })
      )
      .describe("統合対象のエージェント結果配列"),
  }),
  execute: async ({ agentResults }) => {
    try {
      const allComments = agentResults.flatMap((result) => result.comments);

      // ファイル別の影響度分析
      const fileImpactAnalysis = new Map<
        string,
        {
          comments: number;
          severityBreakdown: Record<string, number>;
          categories: Set<string>;
          riskScore: number;
        }
      >();

      for (const comment of allComments) {
        const fileAnalysis = fileImpactAnalysis.get(comment.filename) || {
          comments: 0,
          severityBreakdown: {},
          categories: new Set(),
          riskScore: 0,
        };

        fileAnalysis.comments++;
        fileAnalysis.severityBreakdown[comment.severity] =
          (fileAnalysis.severityBreakdown[comment.severity] || 0) + 1;
        fileAnalysis.categories.add(comment.category);

        // リスクスコア計算（重大度による重み付け）
        const severityWeights = { critical: 10, error: 7, warning: 4, info: 1 };
        fileAnalysis.riskScore +=
          severityWeights[comment.severity as keyof typeof severityWeights] || 1;

        fileImpactAnalysis.set(comment.filename, fileAnalysis);
      }

      // 全体統計の計算
      const totalStats = {
        totalComments: allComments.length,
        bySeverity: allComments.reduce(
          (acc, comment) => {
            acc[comment.severity] = (acc[comment.severity] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        byCategory: allComments.reduce(
          (acc, comment) => {
            acc[comment.category] = (acc[comment.category] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ),
        byAgent: agentResults.reduce(
          (acc, result) => {
            acc[result.agentName] = result.comments.length;
            return acc;
          },
          {} as Record<string, number>
        ),
      };

      // ファイル影響度ランキング
      const fileImpactRanking = Array.from(fileImpactAnalysis.entries())
        .map(([filename, analysis]) => ({
          filename,
          ...analysis,
          categories: Array.from(analysis.categories),
        }))
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 10); // トップ10

      // 重要な発見事項を抽出
      const criticalFindings = allComments
        .filter((comment) => comment.severity === "critical" || comment.severity === "error")
        .sort((a, b) => {
          const severityOrder = { critical: 3, error: 2, warning: 1, info: 0 };
          return (
            severityOrder[b.severity as keyof typeof severityOrder] -
            severityOrder[a.severity as keyof typeof severityOrder]
          );
        })
        .slice(0, 5);

      return {
        success: true,
        consolidatedReport: {
          totalStats,
          fileImpactAnalysis: fileImpactRanking,
          criticalFindings: criticalFindings.map((finding) => ({
            filename: finding.filename,
            line: finding.line,
            severity: finding.severity,
            category: finding.category,
            title: finding.title,
            description: finding.description,
            agent: allComments.find((c) => c.id === finding.id)
              ? agentResults.find((r) => r.comments.some((c) => c.id === finding.id))?.agentName
              : "unknown",
          })),
          agentPerformance: agentResults.map((result) => ({
            agentName: result.agentName,
            executionTimeMs: result.executionTimeMs,
            success: result.success,
            commentCount: result.comments.length,
            errorMessage: result.errorMessage,
          })),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `結果統合エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * 優先度付きレコメンデーションを生成するツール
 */
export const generateRecommendationsTool = new Tool({
  name: "generate_recommendations",
  description: "分析結果に基づいて優先度付きの改善推奨事項を生成します",
  parameters: z.object({
    consolidatedReport: z
      .object({
        totalStats: z.object({
          totalComments: z.number(),
          bySeverity: z.record(z.number()),
          byCategory: z.record(z.number()),
        }),
        fileImpactAnalysis: z.array(
          z.object({
            filename: z.string(),
            comments: z.number(),
            riskScore: z.number(),
            categories: z.array(z.string()),
          })
        ),
        criticalFindings: z.array(
          z.object({
            filename: z.string(),
            severity: z.string(),
            category: z.string(),
            title: z.string(),
            description: z.string(),
          })
        ),
      })
      .describe("統合されたレポートデータ"),
  }),
  execute: async ({ consolidatedReport }) => {
    try {
      const recommendations = [];
      const { totalStats, fileImpactAnalysis, criticalFindings } = consolidatedReport;

      // 緊急対応が必要な項目
      if (totalStats.bySeverity.critical > 0) {
        recommendations.push({
          priority: "critical",
          category: "immediate_action",
          title: "重大なセキュリティ問題への対応",
          description: `${totalStats.bySeverity.critical}件の重大な問題が検出されました。即座に対応してください。`,
          action: "特にセキュリティ関連の脆弱性、機密情報漏洩を最優先で修正してください。",
          estimatedEffort: "高",
        });
      }

      // 高リスクファイルの優先対応
      const highRiskFiles = fileImpactAnalysis.filter((file) => file.riskScore > 20);
      if (highRiskFiles.length > 0) {
        recommendations.push({
          priority: "high",
          category: "risk_mitigation",
          title: "高リスクファイルの優先的修正",
          description: `${highRiskFiles.length}個のファイルが高リスクと判定されました。`,
          action: `特に ${highRiskFiles
            .slice(0, 3)
            .map((f) => f.filename)
            .join(", ")} の修正を優先してください。`,
          estimatedEffort: "中",
        });
      }

      // カテゴリ別の改善提案
      const topCategories = Object.entries(totalStats.byCategory)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3);

      for (const [category, count] of topCategories) {
        const categoryRecommendations = {
          style: {
            title: "コーディングスタイルの統一",
            description: "コーディングスタイルを統一することで可読性と保守性が向上します。",
            action: "リンター設定の見直しとフォーマッターの導入を検討してください。",
          },
          security: {
            title: "セキュリティ強化",
            description: "セキュリティ問題の解決は最優先事項です。",
            action: "セキュリティ監査とペネトレーションテストの実施を推奨します。",
          },
          codeQuality: {
            title: "コード品質の向上",
            description: "コード品質の向上により長期的な保守性が改善されます。",
            action: "リファクタリングとユニットテストの充実を検討してください。",
          },
        };

        const recommendation =
          categoryRecommendations[category as keyof typeof categoryRecommendations];
        if (recommendation) {
          recommendations.push({
            priority: count > 10 ? "high" : count > 5 ? "medium" : "low",
            category: "quality_improvement",
            title: recommendation.title,
            description: `${count}件の${category}関連の問題が検出されました。${recommendation.description}`,
            action: recommendation.action,
            estimatedEffort: count > 10 ? "高" : count > 5 ? "中" : "低",
          });
        }
      }

      // 総合的な推奨事項
      const overallScore = Math.max(0, 100 - totalStats.totalComments * 2);
      let overallRecommendation = "approve";

      if (totalStats.bySeverity.critical > 0 || totalStats.bySeverity.error > 5) {
        overallRecommendation = "request_changes";
      } else if (totalStats.totalComments > 10) {
        overallRecommendation = "comment";
      }

      return {
        success: true,
        recommendations: recommendations.sort((a, b) => {
          const priorityOrder = { critical: 4, high: 3, medium: 2, low: 1 };
          return (
            priorityOrder[b.priority as keyof typeof priorityOrder] -
            priorityOrder[a.priority as keyof typeof priorityOrder]
          );
        }),
        overallAssessment: {
          score: overallScore,
          recommendation: overallRecommendation,
          summary:
            overallScore > 80
              ? "優秀"
              : overallScore > 60
                ? "良好"
                : overallScore > 40
                  ? "改善要"
                  : "要改善",
        },
        nextSteps: [
          "重大な問題から順次対応してください",
          "高リスクファイルの修正を優先してください",
          "継続的なコード品質監視の導入を検討してください",
        ],
      };
    } catch (error) {
      return {
        success: false,
        error: `推奨事項生成エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * レポート形式でサマリーを生成するツール
 */
export const generateSummaryReportTool = new Tool({
  name: "generate_summary_report",
  description: "最終的な包括的サマリーレポートをMarkdown形式で生成します",
  parameters: z.object({
    consolidatedReport: z.any().describe("統合されたレポートデータ"),
    recommendations: z.any().describe("推奨事項データ"),
    overallAssessment: z
      .object({
        score: z.number(),
        recommendation: z.string(),
        summary: z.string(),
      })
      .describe("総合評価"),
  }),
  execute: async ({ consolidatedReport, recommendations, overallAssessment }) => {
    try {
      const report = `# 🤖 AI コードレビューサマリー

## 📊 総合評価
**スコア**: ${overallAssessment.score}/100 (${overallAssessment.summary})
**推奨アクション**: ${overallAssessment.recommendation === "approve" ? "承認" : overallAssessment.recommendation === "request_changes" ? "変更要求" : "コメント"}

## 📈 統計情報
- **総問題数**: ${consolidatedReport.totalStats.totalComments}件
- **重大度別**:
  - 🔴 Critical: ${consolidatedReport.totalStats.bySeverity.critical || 0}件
  - 🟠 Error: ${consolidatedReport.totalStats.bySeverity.error || 0}件
  - 🟡 Warning: ${consolidatedReport.totalStats.bySeverity.warning || 0}件
  - ℹ️ Info: ${consolidatedReport.totalStats.bySeverity.info || 0}件

## 🎯 重要な推奨事項
${recommendations
  .slice(0, 5)
  .map(
    (rec: any, index: number) =>
      `${index + 1}. **${rec.title}** (${rec.priority})\n   ${rec.description}\n   💡 ${rec.action}`
  )
  .join("\n\n")}

## 📁 高リスクファイル
${consolidatedReport.fileImpactAnalysis
  .slice(0, 5)
  .map(
    (file: any, index: number) =>
      `${index + 1}. \`${file.filename}\` - リスクスコア: ${file.riskScore} (${file.comments}件の問題)`
  )
  .join("\n")}

## 🔍 重要な発見事項
${consolidatedReport.criticalFindings
  .slice(0, 3)
  .map(
    (finding: any, index: number) =>
      `${index + 1}. **${finding.title}** in \`${finding.filename}\`\n   ${finding.description}`
  )
  .join("\n\n")}

---
*このレポートは AI によって自動生成されました。詳細な分析結果は個別のコメントをご確認ください。*`;

      return {
        success: true,
        markdownReport: report,
        keyMetrics: {
          totalIssues: consolidatedReport.totalStats.totalComments,
          overallScore: overallAssessment.score,
          recommendation: overallAssessment.recommendation,
          criticalIssues: consolidatedReport.totalStats.bySeverity.critical || 0,
          highRiskFiles: consolidatedReport.fileImpactAnalysis.filter((f: any) => f.riskScore > 20)
            .length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `サマリーレポート生成エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * SummaryAgent用のツール配列
 */
export const summaryAnalysisTools = [
  consolidateAgentResultsTool,
  generateRecommendationsTool,
  generateSummaryReportTool,
];
