import { z } from "zod";
import type { FileChange } from "../types/github.js";

/**
 * コードメトリクスの型定義
 */
export interface CodeMetrics {
  filename: string;
  language: string;
  // 基本メトリクス
  linesOfCode: number;
  logicalLinesOfCode: number;
  commentLines: number;
  blankLines: number;

  // 複雑度メトリクス
  cyclomaticComplexity: number;
  cognitiveComplexity: number;
  nestingDepth: number;

  // 関数メトリクス
  functionCount: number;
  averageFunctionLength: number;
  longestFunction: number;

  // クラス/モジュールメトリクス
  classCount: number;
  methodCount: number;

  // 保守性指標
  maintainabilityIndex: number;
  duplicateCodeRatio: number;

  // 品質スコア（0-100）
  qualityScore: number;

  // 問題のある関数
  problematicFunctions: ProblematicFunction[];

  // 改善提案
  suggestions: QualitySuggestion[];
}

export interface ProblematicFunction {
  name: string;
  line: number;
  issue: "too-complex" | "too-long" | "too-many-params" | "deeply-nested";
  value: number;
  suggestion: string;
}

export interface QualitySuggestion {
  type: "complexity" | "length" | "duplication" | "naming" | "structure";
  priority: "low" | "medium" | "high" | "critical";
  message: string;
  filename: string;
  line?: number;
}

/**
 * ファイル情報の型定義
 */
interface FunctionInfo {
  name: string;
  line: number;
  endLine: number;
  complexity: number;
  length: number;
  parameterCount: number;
  nestingDepth: number;
}

/**
 * コードメトリクス計算ツール
 *
 * 機能:
 * - サイクロマティック複雑度の計算
 * - 認知的複雑度の計算
 * - 保守性指標の計算
 * - コード品質スコアの算出
 */
export class CodeMetricsTool {
  /**
   * ファイルのメトリクスを計算
   */
  static calculateMetrics(content: string, filename: string): CodeMetrics {
    const language = CodeMetricsTool.detectLanguage(filename);
    const lines = content.split("\n");

    // 基本メトリクス
    const basicMetrics = CodeMetricsTool.calculateBasicMetrics(lines);

    // 関数解析
    const functions = CodeMetricsTool.analyzeFunctions(content, language);

    // 複雑度計算
    const complexityMetrics = CodeMetricsTool.calculateComplexityMetrics(content, functions);

    // クラス/モジュールメトリクス
    const structureMetrics = CodeMetricsTool.calculateStructureMetrics(content, language);

    // 保守性指標
    const maintainabilityIndex = CodeMetricsTool.calculateMaintainabilityIndex(
      basicMetrics.linesOfCode,
      complexityMetrics.cyclomaticComplexity,
      basicMetrics.commentLines / basicMetrics.linesOfCode
    );

    // 重複コード比率（簡易版）
    const duplicateCodeRatio = CodeMetricsTool.estimateDuplicateCode(lines);

    // 問題のある関数を特定
    const problematicFunctions = CodeMetricsTool.identifyProblematicFunctions(functions);

    // 改善提案を生成
    const suggestions = CodeMetricsTool.generateSuggestions(
      filename,
      basicMetrics,
      complexityMetrics,
      functions,
      problematicFunctions
    );

    // 品質スコアを計算
    const qualityScore = CodeMetricsTool.calculateQualityScore({
      ...basicMetrics,
      ...complexityMetrics,
      ...structureMetrics,
      maintainabilityIndex,
      duplicateCodeRatio,
      problematicFunctionCount: problematicFunctions.length,
    });

    return {
      filename,
      language,
      ...basicMetrics,
      ...complexityMetrics,
      ...structureMetrics,
      maintainabilityIndex,
      duplicateCodeRatio,
      qualityScore,
      problematicFunctions,
      suggestions,
    };
  }

  /**
   * 複数ファイルのメトリクスを計算
   */
  static calculateBatchMetrics(files: FileChange[]): CodeMetrics[] {
    const results: CodeMetrics[] = [];

    for (const file of files) {
      if (!file.patch) continue;

      // パッチから新しく追加されたコンテンツを抽出
      const addedContent = CodeMetricsTool.extractAddedContent(file.patch);
      if (addedContent.trim().length === 0) continue;

      try {
        const metrics = CodeMetricsTool.calculateMetrics(addedContent, file.filename);
        results.push(metrics);
      } catch (error) {
        console.warn(`メトリクス計算エラー: ${file.filename}`, error);
      }
    }

    return results;
  }

  /**
   * 基本メトリクスを計算
   */
  private static calculateBasicMetrics(lines: string[]): {
    linesOfCode: number;
    logicalLinesOfCode: number;
    commentLines: number;
    blankLines: number;
  } {
    const linesOfCode = lines.length;
    let logicalLinesOfCode = 0;
    let commentLines = 0;
    let blankLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed === "") {
        blankLines++;
      } else if (trimmed.startsWith("//") || trimmed.startsWith("*") || trimmed.startsWith("/*")) {
        commentLines++;
      } else {
        logicalLinesOfCode++;
      }
    }

    return {
      linesOfCode,
      logicalLinesOfCode,
      commentLines,
      blankLines,
    };
  }

  /**
   * 関数を解析
   */
  private static analyzeFunctions(content: string, language: string): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    const lines = content.split("\n");

    if (language === "typescript" || language === "javascript") {
      return CodeMetricsTool.analyzeJavaScriptFunctions(lines);
    }

    return functions;
  }

  /**
   * JavaScript/TypeScript関数を解析
   */
  private static analyzeJavaScriptFunctions(lines: string[]): FunctionInfo[] {
    const functions: FunctionInfo[] = [];
    let currentFunction: Partial<FunctionInfo> | null = null;
    let braceCount = 0;
    let currentNestingDepth = 0;

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const lineNumber = index + 1;

      // 関数定義を検出
      const functionMatch = trimmed.match(
        /(?:async\s+)?(?:function\s+|const\s+|let\s+|var\s+)?(\w+)\s*(?:=\s*)?(?:async\s+)?\(([^)]*)\)|(\w+)\s*:\s*(?:async\s+)?\([^)]*\)\s*=>/
      );

      if (functionMatch && (trimmed.includes("function") || trimmed.includes("=>"))) {
        const functionName = functionMatch[1] || functionMatch[3] || "anonymous";
        const parameters = functionMatch[2] || "";
        const paramCount = parameters ? parameters.split(",").length : 0;

        currentFunction = {
          name: functionName,
          line: lineNumber,
          complexity: 1, // 基本複雑度
          parameterCount: paramCount,
          nestingDepth: 0,
        };
        braceCount = 0;
        currentNestingDepth = 0;
      }

      if (currentFunction) {
        // 複雑度を増加させる構造
        if (trimmed.includes("if") || trimmed.includes("else if")) {
          currentFunction.complexity = (currentFunction.complexity || 1) + 1;
        }
        if (trimmed.includes("for") || trimmed.includes("while") || trimmed.includes("do")) {
          currentFunction.complexity = (currentFunction.complexity || 1) + 1;
        }
        if (trimmed.includes("switch")) {
          currentFunction.complexity = (currentFunction.complexity || 1) + 1;
        }
        if (trimmed.includes("catch")) {
          currentFunction.complexity = (currentFunction.complexity || 1) + 1;
        }

        // ネスト深度を追跡
        const openBraces = (line.match(/\{/g) || []).length;
        const closeBraces = (line.match(/\}/g) || []).length;
        braceCount += openBraces - closeBraces;
        currentNestingDepth = Math.max(currentNestingDepth, braceCount);

        // 関数の終了を検出
        if (braceCount === 0 && openBraces === 0 && closeBraces > 0) {
          currentFunction.endLine = lineNumber;
          currentFunction.length = lineNumber - (currentFunction.line || 0) + 1;
          currentFunction.nestingDepth = currentNestingDepth;

          functions.push(currentFunction as FunctionInfo);
          currentFunction = null;
        }
      }
    });

    return functions;
  }

  /**
   * 複雑度メトリクスを計算
   */
  private static calculateComplexityMetrics(
    content: string,
    functions: FunctionInfo[]
  ): {
    cyclomaticComplexity: number;
    cognitiveComplexity: number;
    nestingDepth: number;
    functionCount: number;
    averageFunctionLength: number;
    longestFunction: number;
  } {
    const cyclomaticComplexity = functions.reduce((sum, fn) => sum + fn.complexity, 0);

    // 認知的複雑度（簡易版）
    const cognitiveComplexity = CodeMetricsTool.calculateCognitiveComplexity(content);

    const nestingDepth = Math.max(...functions.map((fn) => fn.nestingDepth), 0);
    const functionCount = functions.length;
    const averageFunctionLength =
      functionCount > 0 ? functions.reduce((sum, fn) => sum + fn.length, 0) / functionCount : 0;
    const longestFunction = Math.max(...functions.map((fn) => fn.length), 0);

    return {
      cyclomaticComplexity,
      cognitiveComplexity,
      nestingDepth,
      functionCount,
      averageFunctionLength,
      longestFunction,
    };
  }

  /**
   * 認知的複雑度を計算（簡易版）
   */
  private static calculateCognitiveComplexity(content: string): number {
    let complexity = 0;
    let nestingLevel = 0;
    const lines = content.split("\n");

    for (const line of lines) {
      const trimmed = line.trim();

      // ネストレベルを追跡
      const openBraces = (line.match(/\{/g) || []).length;
      const closeBraces = (line.match(/\}/g) || []).length;
      nestingLevel += openBraces - closeBraces;

      // 複雑度を増加させる構造（ネストレベルを考慮）
      if (trimmed.includes("if") || trimmed.includes("else if")) {
        complexity += 1 + nestingLevel;
      }
      if (trimmed.includes("for") || trimmed.includes("while")) {
        complexity += 1 + nestingLevel;
      }
      if (trimmed.includes("switch")) {
        complexity += 1 + nestingLevel;
      }
      if (trimmed.includes("catch")) {
        complexity += 1 + nestingLevel;
      }
    }

    return complexity;
  }

  /**
   * 構造メトリクスを計算
   */
  private static calculateStructureMetrics(
    content: string,
    language: string
  ): {
    classCount: number;
    methodCount: number;
  } {
    const classMatches = content.match(/class\s+\w+/g) || [];
    const methodMatches = content.match(/\w+\s*\([^)]*\)\s*{/g) || [];

    return {
      classCount: classMatches.length,
      methodCount: methodMatches.length,
    };
  }

  /**
   * 保守性指標を計算
   */
  private static calculateMaintainabilityIndex(
    linesOfCode: number,
    cyclomaticComplexity: number,
    commentRatio: number
  ): number {
    // 簡易版の保守性指数計算
    const volume = linesOfCode * Math.log2(linesOfCode + 1);
    const complexity = cyclomaticComplexity || 1;

    let index = 171 - 5.2 * Math.log(volume) - 0.23 * complexity - 16.2 * Math.log(linesOfCode);

    // コメント比率によるボーナス
    index += commentRatio * 10;

    return Math.max(0, Math.min(100, index));
  }

  /**
   * 重複コード比率を推定（簡易版）
   */
  private static estimateDuplicateCode(lines: string[]): number {
    const lineMap = new Map<string, number>();
    let duplicateLines = 0;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length > 10) {
        // 短い行は無視
        const count = lineMap.get(trimmed) || 0;
        lineMap.set(trimmed, count + 1);
        if (count > 0) {
          duplicateLines++;
        }
      }
    }

    return lines.length > 0 ? duplicateLines / lines.length : 0;
  }

  /**
   * 問題のある関数を特定
   */
  private static identifyProblematicFunctions(functions: FunctionInfo[]): ProblematicFunction[] {
    const problematic: ProblematicFunction[] = [];

    for (const fn of functions) {
      // 複雑度が高い
      if (fn.complexity > 10) {
        problematic.push({
          name: fn.name,
          line: fn.line,
          issue: "too-complex",
          value: fn.complexity,
          suggestion: "関数を小さな関数に分割することを検討してください",
        });
      }

      // 関数が長い
      if (fn.length > 50) {
        problematic.push({
          name: fn.name,
          line: fn.line,
          issue: "too-long",
          value: fn.length,
          suggestion: "関数を小さな関数に分割することを検討してください",
        });
      }

      // パラメータが多い
      if (fn.parameterCount > 5) {
        problematic.push({
          name: fn.name,
          line: fn.line,
          issue: "too-many-params",
          value: fn.parameterCount,
          suggestion: "オブジェクトにパラメータをまとめることを検討してください",
        });
      }

      // ネストが深い
      if (fn.nestingDepth > 4) {
        problematic.push({
          name: fn.name,
          line: fn.line,
          issue: "deeply-nested",
          value: fn.nestingDepth,
          suggestion: "early return やガード句を使用してネストを減らしてください",
        });
      }
    }

    return problematic;
  }

  /**
   * 改善提案を生成
   */
  private static generateSuggestions(
    filename: string,
    basicMetrics: { linesOfCode: number; commentLines: number },
    complexityMetrics: { cyclomaticComplexity: number },
    functions: FunctionInfo[],
    problematicFunctions: ProblematicFunction[]
  ): QualitySuggestion[] {
    const suggestions: QualitySuggestion[] = [];

    // 複雑度に関する提案
    if (complexityMetrics.cyclomaticComplexity > 20) {
      suggestions.push({
        type: "complexity",
        priority: "high",
        message: "ファイル全体の複雑度が高すぎます。関数の分割を検討してください",
        filename,
      });
    }

    // ファイルサイズに関する提案
    if (basicMetrics.linesOfCode > 500) {
      suggestions.push({
        type: "length",
        priority: "medium",
        message: "ファイルが大きすぎます。複数のファイルに分割することを検討してください",
        filename,
      });
    }

    // コメント比率に関する提案
    const commentRatio = basicMetrics.commentLines / basicMetrics.linesOfCode;
    if (commentRatio < 0.1) {
      suggestions.push({
        type: "structure",
        priority: "low",
        message: "コメントが少なすぎます。コードの説明を追加してください",
        filename,
      });
    }

    return suggestions;
  }

  /**
   * 品質スコアを計算（0-100）
   */
  private static calculateQualityScore(metrics: {
    cyclomaticComplexity: number;
    linesOfCode: number;
    problematicFunctionCount: number;
    duplicateCodeRatio: number;
    maintainabilityIndex: number
  }): number {
    let score = 100;

    // 複雑度によるペナルティ
    if (metrics.cyclomaticComplexity > 20) score -= 20;
    else if (metrics.cyclomaticComplexity > 10) score -= 10;

    // ファイルサイズによるペナルティ
    if (metrics.linesOfCode > 1000) score -= 15;
    else if (metrics.linesOfCode > 500) score -= 10;

    // 問題のある関数によるペナルティ
    score -= metrics.problematicFunctionCount * 5;

    // 重複コードによるペナルティ
    score -= metrics.duplicateCodeRatio * 20;

    // 保守性指標によるボーナス/ペナルティ
    if (metrics.maintainabilityIndex > 80) score += 5;
    else if (metrics.maintainabilityIndex < 50) score -= 10;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * 言語を検出
   */
  private static detectLanguage(filename: string): string {
    const ext = filename.split(".").pop()?.toLowerCase();
    const languageMap: Record<string, string> = {
      ts: "typescript",
      tsx: "typescript",
      js: "javascript",
      jsx: "javascript",
      py: "python",
      java: "java",
      go: "go",
    };
    return languageMap[ext || ""] || "unknown";
  }

  /**
   * パッチから追加されたコンテンツを抽出
   */
  private static extractAddedContent(patch: string): string {
    const lines = patch.split("\n");
    const addedLines = lines
      .filter((line) => line.startsWith("+") && !line.startsWith("+++"))
      .map((line) => line.substring(1));

    return addedLines.join("\n");
  }
}
