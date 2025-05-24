import { Tool } from "@voltagent/core";
import { z } from "zod";
import type { FileChange } from "../types/github.js";
import { SecurityScannerTool } from "./security-scanner.js";

/**
 * セキュリティスキャンを実行するツール
 */
export const scanSecurityIssuesTool = new Tool({
  name: "scan_security_issues",
  description: "ファイルのセキュリティ脆弱性、機密情報漏洩、認証問題などを検出します",
  parameters: z.object({
    files: z
      .array(
        z.object({
          filename: z.string(),
          patch: z.string().optional(),
        })
      )
      .describe("検査対象のファイル配列"),
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

      const securityResults = SecurityScannerTool.scanFiles(fileChanges);

      return {
        success: true,
        securityFindings: securityResults.map((result) => ({
          filename: result.filename,
          riskScore: result.riskScore,
          totalIssues: result.totalIssues,
          issues: result.issues.map((issue) => ({
            category: issue.category,
            severity: issue.severity,
            line: issue.line,
            title: issue.title,
            description: issue.description,
            evidence: issue.evidence,
            recommendation: issue.recommendation,
          })),
          bySeverity: result.bySeverity,
        })),
        summary: {
          totalFiles: securityResults.length,
          totalIssues: securityResults.reduce((sum, r) => sum + r.totalIssues, 0),
          averageRiskScore:
            securityResults.reduce((sum, r) => sum + r.riskScore, 0) /
            Math.max(securityResults.length, 1),
          highRiskFiles: securityResults.filter((r) => r.riskScore > 70).length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `セキュリティスキャンエラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * 認証・認可のセキュリティ問題を検出するツール
 */
export const detectAuthSecurityIssuesTool = new Tool({
  name: "detect_auth_security_issues",
  description: "認証、認可、セッション管理に関するセキュリティ問題を検出します",
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

          // ハードコードされたパスワード/APIキー
          if (/password\s*=\s*['"`][^'"`]+['"`]|api_?key\s*=\s*['"`][^'"`]+['"`]/i.test(content)) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "critical",
              category: "authentication",
              title: "ハードコードされた認証情報",
              description: "パスワードやAPIキーがコード内にハードコードされています。",
              suggestion: "環境変数またはセキュアな設定ファイルを使用してください。",
              codeSnippet: content.replace(/(['"`])[^'"`]+\1/g, "$1***$1"),
            });
          }

          // 弱いパスワード検証
          if (/password.*length.*[<>=].*[1-5][^0-9]/i.test(content)) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "warning",
              category: "authentication",
              title: "弱いパスワード要件",
              description: "パスワードの最小長が短すぎます。",
              suggestion: "最低8文字以上のパスワード要件を設定してください。",
              codeSnippet: content,
            });
          }

          // SQLインジェクション脆弱性
          if (/query.*\+.*req\.|SELECT.*\+|INSERT.*\+|UPDATE.*\+|DELETE.*\+/i.test(content)) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "critical",
              category: "injection",
              title: "SQLインジェクション脆弱性",
              description: "SQLクエリに動的な値が直接挿入されています。",
              suggestion: "パラメータ化クエリまたはORMを使用してください。",
              codeSnippet: content,
            });
          }

          // XSS脆弱性
          if (/innerHTML.*req\.|innerHTML.*params|innerHTML.*query/i.test(content)) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "high",
              category: "xss",
              title: "XSS脆弱性の可能性",
              description: "ユーザー入力がサニタイズされずにDOM操作に使用されています。",
              suggestion: "入力値をサニタイズするか、textContentを使用してください。",
              codeSnippet: content,
            });
          }

          // 安全でないランダム関数
          if (
            /Math\.random\(\)|new Date\(\)\.getTime\(\)/i.test(content) &&
            (content.includes("token") ||
              content.includes("session") ||
              content.includes("password"))
          ) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "warning",
              category: "cryptography",
              title: "安全でないランダム値生成",
              description: "セキュリティ用途に予測可能な乱数生成器が使用されています。",
              suggestion:
                "crypto.randomBytes()などの暗号学的に安全な乱数生成器を使用してください。",
              codeSnippet: content,
            });
          }

          // 安全でないHTTP通信
          if (/http:\/\/(?!localhost|127\.0\.0\.1)/i.test(content)) {
            issues.push({
              filename: file.filename,
              line: lineNumber,
              severity: "warning",
              category: "communication",
              title: "安全でないHTTP通信",
              description: "HTTPSではなくHTTPが使用されています。",
              suggestion: "機密データの通信にはHTTPSを使用してください。",
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
            critical: issues.filter((i) => i.severity === "critical").length,
            high: issues.filter((i) => i.severity === "high").length,
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
        error: `認証セキュリティ検出エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * 機密情報漏洩を検出するツール
 */
export const detectSecretsLeakageTool = new Tool({
  name: "detect_secrets_leakage",
  description: "APIキー、パスワード、トークンなどの機密情報の漏洩を検出します",
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
      const secrets = [];

      // 一般的なシークレットパターン
      const secretPatterns = [
        { name: "API Key", pattern: /api[_-]?key\s*[:=]\s*['"`]?[a-zA-Z0-9]{20,}['"`]?/gi },
        { name: "AWS Access Key", pattern: /AKIA[0-9A-Z]{16}/g },
        { name: "JWT Token", pattern: /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g },
        { name: "GitHub Token", pattern: /gh[pousr]_[A-Za-z0-9_]{36,255}/g },
        { name: "Private Key", pattern: /-----BEGIN [A-Z ]+PRIVATE KEY-----/g },
        { name: "Password", pattern: /password\s*[:=]\s*['"`][^'"`]{8,}['"`]/gi },
      ];

      for (const file of files) {
        const lines = file.patch.split("\n");
        let lineNumber = 0;

        for (const line of lines) {
          if (!line.startsWith("+")) continue;

          lineNumber++;
          const content = line.substring(1);

          for (const { name, pattern } of secretPatterns) {
            const matches = content.match(pattern);
            if (matches) {
              for (const match of matches) {
                secrets.push({
                  filename: file.filename,
                  line: lineNumber,
                  type: name,
                  severity: "critical",
                  description: `${name}が検出されました`,
                  evidence: match.replace(/[a-zA-Z0-9]/g, "*"),
                  suggestion: "機密情報は環境変数やシークレット管理システムに移動してください。",
                });
              }
            }
          }
        }
      }

      return {
        success: true,
        secrets,
        summary: {
          totalSecrets: secrets.length,
          byType: secrets.reduce(
            (acc, secret) => {
              acc[secret.type] = (acc[secret.type] || 0) + 1;
              return acc;
            },
            {} as Record<string, number>
          ),
          affectedFiles: [...new Set(secrets.map((s) => s.filename))].length,
        },
      };
    } catch (error) {
      return {
        success: false,
        error: `シークレット検出エラー: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * SecurityAgent用のツール配列
 */
export const securityAnalysisTools = [
  scanSecurityIssuesTool,
  detectAuthSecurityIssuesTool,
  detectSecretsLeakageTool,
];
