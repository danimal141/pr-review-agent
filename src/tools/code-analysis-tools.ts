import { Tool } from "@voltagent/core";
import { z } from "zod";
import type { FileChange } from "../types/github.js";
import { CodeMetricsTool } from "./code-metrics.js";
import { FileAnalyzerTool } from "./file-analyzer.js";

/**
 * ファイルのコードメトリクスを計算するツール
 */
export const calculateCodeMetricsTool = new Tool({
  name: "calculate_code_metrics",
  description: "ファイルのコードメトリクス（複雑度、行数、品質スコアなど）を計算します",
  parameters: z.object({
    files: z
      .array(
        z.object({
          filename: z.string(),
          patch: z.string().optional(),
          additions: z.number().optional(),
          deletions: z.number().optional(),
        })
      )
      .describe("分析対象のファイル配列"),
  }),
  execute: async ({ files }) => {
    try {
      const fileChanges: FileChange[] = files.map((file) => ({
        filename: file.filename,
        patch: file.patch || "",
        additions: file.additions || 0,
        deletions: file.deletions || 0,
        status: "modified" as const,
        changes: (file.additions || 0) + (file.deletions || 0),
        sha: "",
        blobUrl: "",
      }));

      const metrics = CodeMetricsTool.calculateBatchMetrics(fileChanges);

      return {
        success: true,
        metrics: metrics.map((metric) => ({
          filename: metric.filename,
          linesOfCode: metric.linesOfCode,
          cyclomaticComplexity: metric.cyclomaticComplexity,
          cognitiveComplexity: metric.cognitiveComplexity,
          maintainabilityIndex: metric.maintainabilityIndex,
          qualityScore: metric.qualityScore,
          functionCount: metric.functionCount,
          duplicateCodeRatio: metric.duplicateCodeRatio,
        })),
        summary: {
          totalFiles: metrics.length,
          averageComplexity:
            metrics.reduce((sum, m) => sum + m.cyclomaticComplexity, 0) /
            Math.max(metrics.length, 1),
          averageQuality:
            metrics.reduce((sum, m) => sum + m.qualityScore, 0) / Math.max(metrics.length, 1),
          totalFunctions: metrics.reduce((sum, m) => sum + m.functionCount, 0),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `メトリクス計算エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * ファイルの詳細解析を実行するツール
 */
export const analyzeFilesTool = new Tool({
  name: "analyze_files",
  description: "ファイルの構造、関数、依存関係などを詳細に解析します",
  parameters: z.object({
    files: z
      .array(
        z.object({
          filename: z.string(),
          patch: z.string().optional(),
        })
      )
      .describe("分析対象のファイル配列"),
  }),
  execute: async ({ files }) => {
    try {
      const fileChanges: FileChange[] = files.map((file) => ({
        filename: file.filename,
        patch: file.patch || "",
        additions: 0,
        deletions: 0,
        status: "modified" as const,
        changes: 0,
        sha: "",
        blobUrl: "",
      }));

      const analysisResults = await FileAnalyzerTool.analyzeFiles(fileChanges);

      return {
        success: true,
        analyses: analysisResults.map((result) => ({
          filename: result.filename,
          language: result.language,
          imports: result.imports,
          exports: result.exports,
          functions: result.functions.map((func) => ({
            name: func.name,
            line: func.line,
            complexity: func.complexity,
            parameters: func.parameters,
            isAsync: func.isAsync,
            isExported: func.isExported,
          })),
          issueCount: result.issues.length,
          linesOfCode: result.linesOfCode,
        })),
        summary: {
          totalFiles: analysisResults.length,
          totalFunctions: analysisResults.reduce((sum, r) => sum + r.functions.length, 0),
          totalIssues: analysisResults.reduce((sum, r) => sum + r.issues.length, 0),
          averageComplexity:
            analysisResults.reduce((sum, r) => sum + r.complexity, 0) /
            Math.max(analysisResults.length, 1),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `ファイル解析エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * コード品質問題を検出するツール
 */
export const detectCodeQualityIssuesTool = new Tool({
  name: "detect_code_quality_issues",
  description: "コードの品質問題（複雑度、重複、保守性など）を検出します",
  parameters: z.object({
    files: z
      .array(
        z.object({
          filename: z.string(),
          patch: z.string(),
        })
      )
      .describe("検査対象のファイルのパッチ情報"),
  }),
  execute: async ({ files }) => {
    try {
      const issues = [];

      for (const file of files) {
        const lines = file.patch.split("\n");
        let lineNumber = 0;

        for (const line of lines) {
          if (!line.startsWith("+")) continue;

          lineNumber++;
          const content = line.substring(1).trim();

          // 長すぎる関数の検出
          if (content.includes("function") || content.includes("=>")) {
            const braceDepth =
              (content.match(/{/g) || []).length - (content.match(/}/g) || []).length;
            if (braceDepth > 3) {
              issues.push({
                filename: file.filename,
                line: lineNumber,
                severity: "warning",
                category: "complexity",
                title: "深いネスト構造",
                description: "関数のネストが深すぎます。リファクタリングを検討してください。",
                suggestion: "関数を小さな単位に分割し、早期リターンパターンを使用してください。",
                codeSnippet: content,
              });
            }
          }

          // 長すぎる行の検出
          if (content.length > 120) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "info",
              category: "readability",
              title: "長すぎる行",
              description: `行が${content.length}文字です。120文字以下が推奨されます。`,
              suggestion: "行を分割して可読性を向上させてください。",
              codeSnippet: `${content.substring(0, 100)}...`,
            });
          }

          // コメントの欠如チェック
          if (
            (content.includes("function") || content.includes("class")) &&
            !content.includes("//") &&
            !content.includes("/*")
          ) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "info",
              category: "documentation",
              title: "コメント不足",
              description: "複雑な関数やクラスにはコメントを追加することを推奨します。",
              suggestion: "目的や動作を説明するコメントを追加してください。",
              codeSnippet: content,
            });
          }
        }
      }

      return {
        success: true,
        issues,
        summary: {
          totalIssues: issues.length,
          bySeverity: {
            error: issues.filter((i) => i.severity === "error").length,
            warning: issues.filter((i) => i.severity === "warning").length,
            info: issues.filter((i) => i.severity === "info").length,
          },
          byCategory: issues.reduce(
            (acc, issue) => {
              acc[issue.category] = (acc[issue.category] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `品質問題検出エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * 依存関係分析ツール
 */
export const analyzeDependenciesTool = new Tool({
  name: "analyze_dependencies",
  description: "ファイル間の依存関係と循環依存を分析します",
  parameters: z.object({
    files: z
      .array(
        z.object({
          filename: z.string(),
          content: z.string().optional(),
        })
      )
      .describe("分析対象のファイル配列"),
  }),
  execute: async ({ files }) => {
    try {
      const dependencyMap = new Map<string, string[]>();

      for (const file of files) {
        if (!file.content) continue;

        const imports = [];
        const importLines = file.content.match(/import\s+.*?from\s+['"](.*?)['"];?/g) || [];

        for (const importLine of importLines) {
          const match = importLine.match(/from\s+['"](.*?)['"];?/);
          if (match?.[1] && !match[1].startsWith(".")) {
            imports.push(match[1]);
          }
        }

        dependencyMap.set(file.filename, imports);
      }

      // 循環依存の検出（簡易版）
      const circularDeps = [];
      for (const [file, deps] of dependencyMap) {
        for (const dep of deps) {
          const depDeps = dependencyMap.get(dep) || [];
          if (depDeps.includes(file)) {
            circularDeps.push({ file1: file, file2: dep });
          }
        }
      }

      return {
        success: true,
        dependencies: Array.from(dependencyMap.entries()).map(([file, deps]) => ({
          filename: file,
          dependencies: deps,
          dependencyCount: deps.length,
        })),
        circularDependencies: circularDeps,
        summary: {
          totalFiles: dependencyMap.size,
          averageDependencies:
            Array.from(dependencyMap.values()).reduce((sum, deps) => sum + deps.length, 0) /
            Math.max(dependencyMap.size, 1),
          circularDependencyCount: circularDeps.length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `依存関係分析エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * CodeAnalysisAgent用のツール配列
 */
export const codeAnalysisTools = [
  calculateCodeMetricsTool,
  analyzeFilesTool,
  detectCodeQualityIssuesTool,
  analyzeDependenciesTool,
];
