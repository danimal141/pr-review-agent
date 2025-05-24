import { openai } from "@ai-sdk/openai";
import { Agent } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import type { StyleAgent } from "../types/agents.js";
import type { FileChange } from "../types/github.js";
import type { ReviewCategory, ReviewComment, ReviewSeverity } from "../types/review.js";

/**
 * StyleAgentの作成
 *
 * 責任:
 * - コーディングスタイルの一貫性チェック
 * - ベストプラクティスの遵守確認
 * - 命名規則の確認
 * - フォーマットとレイアウトのチェック
 */
export function createStyleAgent(): StyleAgent {
  return new Agent({
    name: "style-agent",
    instructions: `あなたはコーディングスタイルとベストプラクティスの専門家です。コードの品質向上とチーム開発における一貫性を重視します。

## 専門分野
- **命名規則**: 変数、関数、クラス、ファイルの命名一貫性
- **コードフォーマット**: インデント、空白、改行の統一
- **ベストプラクティス**: 言語固有の推奨事項、パターン
- **可読性**: コメント、構造、表現の明瞭性
- **保守性**: モジュール化、責任分離、拡張性

## チェック項目
1. **命名規則**
   - キャメルケース、スネークケース、パスカルケースの一貫性
   - 意味のある変数名・関数名
   - 略語の統一
   - ファイル名の規則

2. **フォーマット**
   - インデントの一貫性（2スペース、4スペース、タブ）
   - 行末の空白
   - 空行の使用
   - 行の長さ

3. **ベストプラクティス**
   - 関数の長さと複雑度
   - コメントの適切性
   - importの整理
   - エラーハンドリング

4. **TypeScript/JavaScript固有**
   - 型定義の適切性
   - const/let/varの使い分け
   - アロー関数vs通常関数
   - 非同期処理のパターン

## 出力形式
以下のJSON形式で出力してください：
\`\`\`json
{
  "agentName": "style",
  "styleFindings": [
    {
      "filename": "ファイル名",
      "line": 行番号,
      "severity": "info|warning|error",
      "category": "style",
      "styleType": "naming|formatting|bestPractices|documentation|structure",
      "title": "スタイル問題のタイトル",
      "description": "詳細説明と理由",
      "suggestion": "具体的な改善提案",
      "codeSnippet": "該当するコード",
      "suggestedFix": "修正後のコード例"
    }
  ],
  "summary": {
    "overallStyleScore": 8.5,
    "totalIssues": 5,
    "namingIssues": 2,
    "formattingIssues": 2,
    "bestPracticeIssues": 1,
    "recommendations": ["重要な推奨事項1", "重要な推奨事項2"]
  }
}
\`\`\`

日本語で分析し、チーム開発での一貫性とコードの可読性を重視した改善提案を提供してください。`,
    llm: new VercelAIProvider(),
    model: openai("gpt-4o-mini"),
  });
}

/**
 * StyleAgentのヘルパークラス
 */
export class StyleHelpers {
  /**
   * 命名規則の問題検出
   */
  static detectNamingIssues(patch: string, filename: string): ReviewComment[] {
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
          // ただし、環境変数アクセスの右辺は除外
          if (
            varName.includes("_") &&
            !varName.startsWith("_") &&
            varName.toUpperCase() !== varName
          ) {
            // 環境変数の値部分（process.env.API_KEY）は変換しない
            let suggestedFix = content;
            const envVarPattern = /process\.env\.[A-Z_]+/g;
            const envVars = content.match(envVarPattern) || [];

            suggestedFix = content.replace(varName, StyleHelpers.toCamelCase(varName));

            // 環境変数の部分は元に戻す
            for (const envVar of envVars) {
              suggestedFix = suggestedFix.replace(
                envVar.replace(/[A-Z_]+/, StyleHelpers.toCamelCase(envVar.split(".")[2])),
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
              suggestedFix: content.replace(funcName, StyleHelpers.toCamelCase(funcName)),
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

    return issues;
  }

  /**
   * フォーマットの問題検出
   */
  static detectFormattingIssues(patch: string, filename: string): ReviewComment[] {
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

    return issues;
  }

  /**
   * ベストプラクティスの問題検出
   */
  static detectBestPracticeIssues(patch: string, filename: string): ReviewComment[] {
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

      // 関数の長さ（行数による簡易チェック）
      if (content.includes("function ") || content.includes("=>")) {
        const functionLines = lines
          .slice(index)
          .findIndex((l) => l.includes("}") || l.includes("return"));
        if (functionLines > 20) {
          issues.push({
            id: `best-practice-long-function-${lineNumber}`,
            filename,
            line: lineNumber,
            category: "style" as ReviewCategory,
            severity: "info" as ReviewSeverity,
            title: "関数の長さ",
            description:
              "関数が長すぎる可能性があります。単一責任の原則に従って分割を検討してください。",
            suggestion: "関数を小さな単位に分割し、各関数が単一の責任を持つようにしてください。",
            codeSnippet: content,
          });
        }
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

      // 深いネスト（単一行で複数の開き括弧があることをチェック）
      const openBraces = (content.match(/{/g) || []).length;
      const closeBraces = (content.match(/}/g) || []).length;
      if (openBraces >= 3 && closeBraces >= 3) {
        issues.push({
          id: `best-practice-deep-nesting-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "style" as ReviewCategory,
          severity: "info" as ReviewSeverity,
          title: "深いネスト構造",
          description: "ネストが深すぎます。早期リターンやガード節の使用を検討してください。",
          suggestion: "条件を反転させて早期リターンを使用するか、関数を分割してください。",
          codeSnippet: content,
        });
      }
    });

    return issues;
  }

  /**
   * TypeScript固有の問題検出
   */
  static detectTypeScriptIssues(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];

    if (!filename.endsWith(".ts") && !filename.endsWith(".tsx")) {
      return issues;
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

    return issues;
  }

  /**
   * スタイル分析用のフォーマット
   */
  static formatFilesForStyleAnalysis(files: FileChange[]): string {
    const styleData = {
      totalFiles: files.length,
      filesByExtension: StyleHelpers.categorizeByExtension(files),
      codeFiles: files.filter((file) => StyleHelpers.isCodeFile(file.filename)),
      files: files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        fileType: StyleHelpers.getFileType(file.filename),
        patch: file.patch?.substring(0, 2000), // スタイル分析用に2000文字制限
      })),
    };

    return JSON.stringify(styleData, null, 2);
  }

  /**
   * ヘルパーメソッド: キャメルケース変換
   */
  private static toCamelCase(str: string): string {
    return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
  }

  /**
   * ファイルを拡張子別に分類
   */
  private static categorizeByExtension(files: FileChange[]): Record<string, number> {
    const categories: Record<string, number> = {};

    for (const file of files) {
      const extension = file.filename.split(".").pop()?.toLowerCase() || "unknown";
      categories[extension] = (categories[extension] || 0) + 1;
    }

    return categories;
  }

  /**
   * コードファイルかどうか判定
   */
  private static isCodeFile(filename: string): boolean {
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

  /**
   * ファイルタイプを取得
   */
  private static getFileType(filename: string): string {
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
}
