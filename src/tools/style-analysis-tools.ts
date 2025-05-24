import { Tool } from "@voltagent/core";
import { z } from "zod";
import type { ReviewCategory, ReviewComment, ReviewSeverity } from "../types/review.js";

// 命名規則の問題検出ツール
export const detectNamingIssuesTool = new Tool({
  name: "detect_naming_issues",
  description: "コードの命名規則に関する問題を検出します",
  parameters: z.object({
    patch: z.string().describe("分析対象のパッチ内容"),
    filename: z.string().describe("分析対象のファイル名"),
  }),
  execute: async ({ patch, filename }) => {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // 変数宣言の命名規則チェック
      const variableDeclarations = content.match(/(const|let|var)\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
      if (variableDeclarations) {
        for (const declaration of variableDeclarations) {
          const varName = declaration.split(/\s+/)[1];

          // スネークケースの使用（JavaScriptではキャメルケースが推奨）
          if (
            varName.includes("_") &&
            !varName.startsWith("_") &&
            varName.toUpperCase() !== varName
          ) {
            let suggestedFix = content;
            const envVarPattern = /process\.env\.[A-Z_]+/g;
            const envVars = content.match(envVarPattern) || [];

            suggestedFix = content.replace(varName, toCamelCase(varName));

            // 環境変数の部分は元に戻す
            for (const envVar of envVars) {
              suggestedFix = suggestedFix.replace(
                envVar.replace(/[A-Z_]+/, toCamelCase(envVar.split(".")[2])),
                envVar
              );
            }

            issues.push({
              id: `naming-snake-case-${lineNumber}`,
              filename,
              line: lineNumber,
              category: "style" as ReviewCategory,
              severity: "info" as ReviewSeverity,
              title: "キャメルケース命名規則推奨",
              description: `変数名 '${varName}' にスネークケースが使用されています。JavaScriptではキャメルケースが推奨されます。`,
              suggestion: "キャメルケース（例: userName）を使用してください。",
              codeSnippet: content,
              suggestedFix: suggestedFix,
            });
          }

          // 短すぎる変数名
          if (
            varName.length <= 2 &&
            !["i", "j", "k", "x", "y", "z", "id"].includes(varName.toLowerCase())
          ) {
            issues.push({
              id: `naming-short-name-${lineNumber}`,
              filename,
              line: lineNumber,
              category: "style" as ReviewCategory,
              severity: "info" as ReviewSeverity,
              title: "意味のある変数名推奨",
              description: `変数名 '${varName}' が短すぎます。意味を理解しやすい名前を使用することを推奨します。`,
              suggestion: "変数の目的や内容を表す、より具体的な名前を使用してください。",
              codeSnippet: content,
            });
          }

          // 大文字のみの変数名（定数以外）
          if (
            varName === varName.toUpperCase() &&
            varName.length > 1 &&
            !content.includes("const")
          ) {
            issues.push({
              id: `naming-uppercase-${lineNumber}`,
              filename,
              line: lineNumber,
              category: "style" as ReviewCategory,
              severity: "info" as ReviewSeverity,
              title: "大文字定数の適切な使用",
              description: `'${varName}' は大文字のみの名前ですが、constで定義された定数ではありません。`,
              suggestion:
                "constで定義された定数のみ大文字を使用し、通常の変数はキャメルケースを使用してください。",
              codeSnippet: content,
            });
          }
        }
      }

      // 関数命名規則チェック
      const functionDeclarations = content.match(/function\s+([a-zA-Z_$][a-zA-Z0-9_$]*)/g);
      if (functionDeclarations) {
        for (const declaration of functionDeclarations) {
          const funcName = declaration.split(/\s+/)[1];

          if (funcName.includes("_")) {
            issues.push({
              id: `naming-function-snake-${lineNumber}`,
              filename,
              line: lineNumber,
              category: "style" as ReviewCategory,
              severity: "info" as ReviewSeverity,
              title: "関数名キャメルケース推奨",
              description: `関数名 '${funcName}' にスネークケースが使用されています。`,
              suggestion: "キャメルケース（例: getUserData）を使用してください。",
              codeSnippet: content,
              suggestedFix: content.replace(funcName, toCamelCase(funcName)),
            });
          }
        }
      }
    });

    // ファイル名の命名規則チェック
    if (filename.includes("_") && !filename.includes(".test.") && !filename.includes(".spec.")) {
      issues.push({
        id: "naming-filename-kebab",
        filename,
        line: 1,
        category: "style" as ReviewCategory,
        severity: "info" as ReviewSeverity,
        title: "ファイル名ケバブケース推奨",
        description:
          "ファイル名にアンダースコアが使用されています。ケバブケース（ハイフン区切り）が推奨されます。",
        suggestion:
          "ファイル名をケバブケース（例: user-profile.ts）に変更することを検討してください。",
        codeSnippet: filename,
      });
    }

    return {
      issues,
      summary: {
        totalIssues: issues.length,
        namingIssues: issues.length,
      },
    };
  },
});

// フォーマットの問題検出ツール
export const detectFormattingIssuesTool = new Tool({
  name: "detect_formatting_issues",
  description: "コードのフォーマットに関する問題を検出します",
  parameters: z.object({
    patch: z.string().describe("分析対象のパッチ内容"),
    filename: z.string().describe("分析対象のファイル名"),
  }),
  execute: async ({ patch, filename }) => {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1);
      const trimmedContent = content.trim();
      const lineNumber = index + 1;

      // 行末の余分な空白
      if ((content.endsWith(" ") || content.endsWith("\t")) && trimmedContent.length > 0) {
        issues.push({
          id: `format-trailing-space-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "行末の余分な空白",
          description: "行末に不要な空白文字があります。",
          suggestion:
            "行末の空白を削除してください。エディターの設定で自動削除を有効にすることを推奨します。",
          codeSnippet: `"${content}"`,
        });
      }

      // インデントの一貫性（2スペースが期待される場合）
      if (content.length > 0 && content.startsWith(" ")) {
        const leadingSpaces = content.match(/^ */)?.[0].length || 0;
        if (leadingSpaces % 2 !== 0) {
          issues.push({
            id: `format-indent-${lineNumber}`,
            filename,
            line: lineNumber,
            category: "style" as ReviewCategory,
            severity: "info" as ReviewSeverity,
            title: "インデント一貫性",
            description: `インデントが${leadingSpaces}スペースです。2スペースの倍数が推奨されます。`,
            suggestion: "2スペースまたは4スペースの一貫したインデントを使用してください。",
            codeSnippet: content,
          });
        }
      }

      // 長すぎる行
      if (trimmedContent.length > 120) {
        issues.push({
          id: `format-line-length-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "行の長さ超過",
          description: `行が${trimmedContent.length}文字です。120文字以下が推奨されます。`,
          suggestion: "行を分割するか、変数に代入して可読性を向上させてください。",
          codeSnippet: `${trimmedContent.substring(0, 100)}...`,
        });
      }

      // 括弧の前後のスペース
      if (
        trimmedContent.includes("if(") ||
        trimmedContent.includes("for(") ||
        trimmedContent.includes("while(") ||
        trimmedContent.includes("function(")
      ) {
        issues.push({
          id: `format-space-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "括弧前のスペース推奨",
          description: "キーワードと括弧の間にスペースがありません。",
          suggestion: "if (condition) のように、括弧の前にスペースを追加してください。",
          codeSnippet: trimmedContent,
          suggestedFix: trimmedContent.replace(/(\w)\(/g, "$1 ("),
        });
      }

      // セミコロンの一貫性
      if (
        (trimmedContent.includes("const ") ||
          trimmedContent.includes("let ") ||
          trimmedContent.includes("var ")) &&
        !trimmedContent.endsWith(";") &&
        !trimmedContent.endsWith("{") &&
        !trimmedContent.includes("//")
      ) {
        issues.push({
          id: `format-semicolon-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "セミコロン一貫性",
          description: "変数宣言の末尾にセミコロンがありません。",
          suggestion: "セミコロンの使用について一貫したスタイルを維持してください。",
          codeSnippet: trimmedContent,
          suggestedFix: `${trimmedContent};`,
        });
      }
    });

    return {
      issues,
      summary: {
        totalIssues: issues.length,
        formattingIssues: issues.length,
      },
    };
  },
});

// ベストプラクティスの問題検出ツール
export const detectBestPracticeIssuesTool = new Tool({
  name: "detect_best_practice_issues",
  description: "コードのベストプラクティスに関する問題を検出します",
  parameters: z.object({
    patch: z.string().describe("分析対象のパッチ内容"),
    filename: z.string().describe("分析対象のファイル名"),
  }),
  execute: async ({ patch, filename }) => {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // var の使用
      if (content.includes("var ") && !content.includes("//")) {
        issues.push({
          id: `best-practice-var-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "var使用非推奨",
          description:
            "varの使用は推奨されません。ブロックスコープを持つletまたはconstの使用が推奨されます。",
          suggestion: "再代入が必要な場合はlet、そうでなければconstを使用してください。",
          codeSnippet: content,
          suggestedFix: content.replace("var ", "const "),
        });
      }

      // コンソールログの残存
      if (
        (content.includes("console.log") || content.includes("console.error")) &&
        !filename.includes("test") &&
        !filename.includes("spec")
      ) {
        issues.push({
          id: `best-practice-console-log-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "console.logの残存",
          description: "デバッグ用のconsole.logが残存している可能性があります。",
          suggestion:
            "デバッグが完了したらconsole.logを削除するか、適切なロガーを使用してください。",
          codeSnippet: content,
        });
      }

      // TODO/FIXMEコメント
      if (content.includes("TODO") || content.includes("FIXME")) {
        issues.push({
          id: `best-practice-todo-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "TODO/FIXMEコメント",
          description: "TODO/FIXMEコメントが残存しています。",
          suggestion: "課題管理システムでタスクを作成し、コメントを削除または更新してください。",
          codeSnippet: content,
        });
      }

      // 複雑な三項演算子
      if (content.includes("?") && content.includes(":") && content.length > 80) {
        issues.push({
          id: `best-practice-complex-ternary-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "複雑な三項演算子",
          description: "三項演算子が複雑すぎる可能性があります。",
          suggestion: "if-else文または変数への代入を使用して可読性を向上させてください。",
          codeSnippet: content,
        });
      }
    });

    return {
      issues,
      summary: {
        totalIssues: issues.length,
        bestPracticeIssues: issues.length,
      },
    };
  },
});

// TypeScript固有の問題検出ツール
export const detectTypeScriptIssuesTool = new Tool({
  name: "detect_typescript_issues",
  description: "TypeScriptコードの問題を検出します",
  parameters: z.object({
    patch: z.string().describe("分析対象のパッチ内容"),
    filename: z.string().describe("分析対象のファイル名"),
  }),
  execute: async ({ patch, filename }) => {
    const issues: ReviewComment[] = [];

    if (!filename.endsWith(".ts") && !filename.endsWith(".tsx")) {
      return { issues, summary: { totalIssues: 0, typeScriptIssues: 0 } };
    }

    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // any型の使用
      if (content.includes(": any") || content.includes("<any>")) {
        issues.push({
          id: `ts-any-type-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "any型の使用",
          description: "any型の使用はTypeScriptの型安全性を損ないます。",
          suggestion: "具体的な型定義またはunion型を使用してください。",
          codeSnippet: content,
        });
      }

      // 型アサーションの過度な使用
      if (/\s+as\s+/.test(content) && !content.includes(" as const")) {
        issues.push({
          id: `ts-type-assertion-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "型アサーションの使用",
          description: "型アサーションの使用は最小限に留めることを推奨します。",
          suggestion: "型ガードや適切な型定義で型安全性を確保してください。",
          codeSnippet: content,
        });
      }

      // インターフェース vs タイプエイリアス
      if (content.includes("type ") && content.includes("=") && content.includes("{")) {
        issues.push({
          id: `ts-type-vs-interface-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "interface vs type alias",
          description: "オブジェクト形状の定義にはinterfaceの使用が推奨される場合があります。",
          suggestion: "拡張可能性が必要な場合はinterfaceを検討してください。",
          codeSnippet: content,
        });
      }
    });

    return {
      issues,
      summary: {
        totalIssues: issues.length,
        typeScriptIssues: issues.length,
      },
    };
  },
});

// スタイル分析用のファイルフォーマットツール
export const formatFilesForStyleAnalysisTool = new Tool({
  name: "format_files_for_style_analysis",
  description: "ファイル情報をスタイル分析用のフォーマットに変換します",
  parameters: z.object({
    files: z.array(
      z.object({
        filename: z.string(),
        status: z.string(),
        additions: z.number(),
        deletions: z.number(),
        changes: z.number(),
        patch: z.string().optional(),
      })
    ),
  }),
  execute: async ({ files }) => {
    const styleData = {
      totalFiles: files.length,
      filesByExtension: categorizeByExtension(files),
      codeFiles: files.filter((file) => isCodeFile(file.filename)),
      files: files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        fileType: getFileType(file.filename),
        patch: file.patch?.substring(0, 2000), // スタイル分析用に2000文字制限
      })),
    };

    return styleData;
  },
});

// ヘルパー関数
function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
}

// biome-ignore lint/suspicious/noExplicitAny: ファイル型の汎用性のためanyが適切
function categorizeByExtension(files: any[]): Record<string, number> {
  const categories: Record<string, number> = {};

  for (const file of files) {
    const extension = file.filename.split(".").pop()?.toLowerCase() || "unknown";
    categories[extension] = (categories[extension] || 0) + 1;
  }

  return categories;
}

function isCodeFile(filename: string): boolean {
  const codeExtensions = [
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".vue",
    ".py",
    ".java",
    ".cpp",
    ".c",
    ".cs",
  ];
  return codeExtensions.some((ext) => filename.endsWith(ext));
}

function getFileType(filename: string): string {
  const extension = filename.split(".").pop()?.toLowerCase();

  const typeMap: Record<string, string> = {
    ts: "TypeScript",
    tsx: "TypeScript React",
    js: "JavaScript",
    jsx: "JavaScript React",
    vue: "Vue",
    py: "Python",
    java: "Java",
    cpp: "C++",
    c: "C",
    cs: "C#",
    json: "JSON",
    md: "Markdown",
    yml: "YAML",
    yaml: "YAML",
  };

  return typeMap[extension || ""] || "Other";
}

// すべてのスタイル分析ツールを含む配列をエクスポート
export const styleAnalysisTools = [
  detectNamingIssuesTool,
  detectFormattingIssuesTool,
  detectBestPracticeIssuesTool,
  detectTypeScriptIssuesTool,
  formatFilesForStyleAnalysisTool,
];
