import { z } from "zod";
import type { FileChange } from "../types/github.js";

/**
 * ファイル解析結果の型定義
 */
export interface FileAnalysisResult {
  filename: string;
  language: string;
  size: number;
  complexity: number;
  linesOfCode: number;
  functions: FunctionInfo[];
  imports: ImportInfo[];
  exports: ExportInfo[];
  issues: AnalysisIssue[];
}

export interface FunctionInfo {
  name: string;
  line: number;
  parameters: number;
  complexity: number;
  isAsync: boolean;
  isExported: boolean;
}

export interface ImportInfo {
  module: string;
  items: string[];
  line: number;
  isTypeOnly: boolean;
}

export interface ExportInfo {
  name: string;
  line: number;
  type: "function" | "class" | "variable" | "type" | "interface" | "default";
}

export interface AnalysisIssue {
  type: "warning" | "error" | "info";
  message: string;
  line: number;
  column?: number;
  suggestion?: string;
}

/**
 * 差分解析結果の型定義
 */
export interface DiffAnalysisResult {
  filename: string;
  totalChanges: number;
  addedLines: string[];
  removedLines: string[];
  modifiedLines: Array<{
    line: number;
    before: string;
    after: string;
  }>;
  impactLevel: "low" | "medium" | "high" | "critical";
  affectedFunctions: string[];
}

/**
 * ファイル解析ツール
 *
 * 機能:
 * - ファイルタイプの判定
 * - 構文解析
 * - コードメトリクスの計算
 * - 差分解析
 */
export class FileAnalyzerTool {
  /**
   * ファイルタイプを判定
   */
  static getFileType(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();

    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      java: "java",
      go: "go",
      rs: "rust",
      cpp: "cpp",
      c: "c",
      cs: "csharp",
      php: "php",
      rb: "ruby",
      kt: "kotlin",
      swift: "swift",
      md: "markdown",
      json: "json",
      yaml: "yaml",
      yml: "yaml",
      xml: "xml",
      html: "html",
      css: "css",
      scss: "scss",
      sass: "sass",
      sql: "sql",
      sh: "shell",
      bash: "shell",
    };

    return languageMap[ext || ""] || "unknown";
  }

  /**
   * ファイルの重要度を判定
   */
  static getFileImportance(filename: string): "low" | "medium" | "high" | "critical" {
    const lowerFilename = filename.toLowerCase();

    // 設定ファイルや重要なファイル
    if (
      lowerFilename.includes("config") ||
      lowerFilename.includes("package.json") ||
      lowerFilename.includes(".env") ||
      lowerFilename.includes("dockerfile") ||
      lowerFilename.includes("security") ||
      lowerFilename.includes("auth")
    ) {
      return "critical";
    }

    // エントリーポイントやルートファイル
    if (
      lowerFilename.includes("index.") ||
      lowerFilename.includes("main.") ||
      lowerFilename.includes("app.") ||
      lowerFilename.includes("server.")
    ) {
      return "high";
    }

    // ライブラリやユーティリティ
    if (
      lowerFilename.includes("utils") ||
      lowerFilename.includes("lib") ||
      lowerFilename.includes("helper")
    ) {
      return "medium";
    }

    return "low";
  }

  /**
   * TypeScript/JavaScriptファイルを解析
   */
  static analyzeJavaScriptFile(content: string, filename: string): FileAnalysisResult {
    const lines = content.split("\n");
    const functions: FunctionInfo[] = [];
    const imports: ImportInfo[] = [];
    const exports: ExportInfo[] = [];
    const issues: AnalysisIssue[] = [];

    let totalComplexity = 0;
    let linesOfCode = 0;

    lines.forEach((line, index) => {
      const trimmedLine = line.trim();
      const lineNumber = index + 1;

      // 空行やコメント行をスキップ
      if (!trimmedLine || trimmedLine.startsWith("//") || trimmedLine.startsWith("*")) {
        return;
      }
      linesOfCode++;

      // インポート文の解析
      const importMatch = trimmedLine.match(/^import\s+(.+?)\s+from\s+['"`](.+?)['"`]/);
      if (importMatch) {
        const importItems = importMatch[1]
          .replace(/[{}]/g, "")
          .split(",")
          .map((s) => s.trim());
        imports.push({
          module: importMatch[2],
          items: importItems,
          line: lineNumber,
          isTypeOnly: trimmedLine.includes("import type"),
        });
      }

      // 関数定義の解析
      const functionMatch = trimmedLine.match(
        /(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+)?(\w+)\s*(?:=\s*)?(?:async\s+)?\(([^)]*)\)/
      );
      if (functionMatch && (trimmedLine.includes("function") || trimmedLine.includes("=>"))) {
        const name = functionMatch[1];
        const params = functionMatch[2] ? functionMatch[2].split(",").length : 0;
        const isAsync = trimmedLine.includes("async");
        const isExported = trimmedLine.includes("export");

        // シンプルな複雑度計算
        let complexity = 1; // 基本複雑度
        if (trimmedLine.includes("if") || trimmedLine.includes("?")) complexity++;
        if (trimmedLine.includes("for") || trimmedLine.includes("while")) complexity++;

        functions.push({
          name,
          line: lineNumber,
          parameters: params,
          complexity,
          isAsync,
          isExported,
        });

        totalComplexity += complexity;
      }

      // エクスポート文の解析
      if (trimmedLine.startsWith("export")) {
        let exportType: ExportInfo["type"] = "variable";
        let exportName = "default";

        if (trimmedLine.includes("export default")) {
          exportType = "default";
          const match = trimmedLine.match(/export\s+default\s+(?:class\s+|function\s+)?(\w+)/);
          if (match) exportName = match[1];
        } else if (trimmedLine.includes("function")) {
          exportType = "function";
          const match = trimmedLine.match(/export\s+(?:async\s+)?function\s+(\w+)/);
          if (match) exportName = match[1];
        } else if (trimmedLine.includes("class")) {
          exportType = "class";
          const match = trimmedLine.match(/export\s+class\s+(\w+)/);
          if (match) exportName = match[1];
        } else if (trimmedLine.includes("interface")) {
          exportType = "interface";
          const match = trimmedLine.match(/export\s+interface\s+(\w+)/);
          if (match) exportName = match[1];
        } else if (trimmedLine.includes("type")) {
          exportType = "type";
          const match = trimmedLine.match(/export\s+type\s+(\w+)/);
          if (match) exportName = match[1];
        }

        exports.push({
          name: exportName,
          line: lineNumber,
          type: exportType,
        });
      }

      // 潜在的な問題の検出
      if (trimmedLine.includes("console.log")) {
        issues.push({
          type: "warning",
          message: "console.logが残っています",
          line: lineNumber,
          suggestion: "プロダクション環境では適切なロガーを使用してください",
        });
      }

      if (trimmedLine.includes("any")) {
        issues.push({
          type: "info",
          message: "any型が使用されています",
          line: lineNumber,
          suggestion: "より具体的な型を指定することを検討してください",
        });
      }

      if (trimmedLine.length > 120) {
        issues.push({
          type: "warning",
          message: "行が長すぎます",
          line: lineNumber,
          suggestion: "行を分割することを検討してください",
        });
      }
    });

    return {
      filename,
      language: FileAnalyzerTool.getFileType(filename),
      size: content.length,
      complexity: totalComplexity,
      linesOfCode,
      functions,
      imports,
      exports,
      issues,
    };
  }

  /**
   * 差分を解析
   */
  static analyzeDiff(patch: string, filename: string): DiffAnalysisResult {
    const lines = patch.split("\n");
    const addedLines: string[] = [];
    const removedLines: string[] = [];
    const modifiedLines: Array<{ line: number; before: string; after: string }> = [];
    const affectedFunctions: string[] = [];

    let currentLine = 0;

    lines.forEach((line) => {
      if (line.startsWith("@@")) {
        // 行番号情報を抽出
        const match = line.match(/@@ -(\d+),?\d* \+(\d+),?\d* @@/);
        if (match) {
          currentLine = Number.parseInt(match[2]);
        }
        return;
      }

      if (line.startsWith("+") && !line.startsWith("+++")) {
        addedLines.push(line.substring(1));

        // 関数定義の変更を検出
        if (line.includes("function") || line.includes("=>")) {
          const functionMatch = line.match(/(?:function\s+|const\s+)(\w+)/);
          if (functionMatch) {
            affectedFunctions.push(functionMatch[1]);
          }
        }
        currentLine++;
      } else if (line.startsWith("-") && !line.startsWith("---")) {
        removedLines.push(line.substring(1));
      } else if (!line.startsWith("\\")) {
        currentLine++;
      }
    });

    // 影響レベルを計算
    const totalChanges = addedLines.length + removedLines.length;
    let impactLevel: "low" | "medium" | "high" | "critical" = "low";

    if (totalChanges > 100 || affectedFunctions.length > 5) {
      impactLevel = "critical";
    } else if (totalChanges > 50 || affectedFunctions.length > 2) {
      impactLevel = "high";
    } else if (totalChanges > 10 || affectedFunctions.length > 0) {
      impactLevel = "medium";
    }

    return {
      filename,
      totalChanges,
      addedLines,
      removedLines,
      modifiedLines,
      impactLevel,
      affectedFunctions,
    };
  }

  /**
   * 複数ファイルを一括解析
   */
  static async analyzeFiles(files: FileChange[]): Promise<FileAnalysisResult[]> {
    const results: FileAnalysisResult[] = [];

    for (const file of files) {
      if (!file.patch) continue;

      const language = FileAnalyzerTool.getFileType(file.filename);

      // サポートされている言語のみ詳細解析
      if (language === "typescript" || language === "javascript") {
        try {
          // パッチから実際のコンテンツを再構築（簡易版）
          const content = FileAnalyzerTool.reconstructContentFromPatch(file.patch);
          const analysis = FileAnalyzerTool.analyzeJavaScriptFile(content, file.filename);
          results.push(analysis);
        } catch (error) {
          // エラーが発生した場合は基本的な解析のみ
          results.push({
            filename: file.filename,
            language,
            size: file.patch.length,
            complexity: 1,
            linesOfCode: file.additions - file.deletions,
            functions: [],
            imports: [],
            exports: [],
            issues: [
              {
                type: "warning",
                message: `ファイル解析中にエラーが発生: ${error}`,
                line: 1,
              },
            ],
          });
        }
      }
    }

    return results;
  }

  /**
   * パッチから簡易的にコンテンツを再構築
   */
  private static reconstructContentFromPatch(patch: string): string {
    const lines = patch.split("\n");
    const content: string[] = [];

    lines.forEach((line) => {
      if (line.startsWith("+") && !line.startsWith("+++")) {
        content.push(line.substring(1));
      } else if (!line.startsWith("-") && !line.startsWith("@@") && !line.startsWith("\\")) {
        content.push(line);
      }
    });

    return content.join("\n");
  }

  /**
   * ファイルの変更リスクを評価
   */
  static assessChangeRisk(file: FileChange): "low" | "medium" | "high" | "critical" {
    const importance = FileAnalyzerTool.getFileImportance(file.filename);
    const changeRatio = file.changes / Math.max(file.additions + file.deletions, 1);

    // 重要ファイルの大幅変更は危険
    if (importance === "critical" && changeRatio > 0.5) return "critical";
    if (importance === "high" && changeRatio > 0.7) return "high";

    // 変更量による評価
    if (file.changes > 500) return "high";
    if (file.changes > 100) return "medium";

    return "low";
  }
}
