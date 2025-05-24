import { openai } from "@ai-sdk/openai";
import { Agent, type Tool } from "@voltagent/core";
import { VercelAIProvider } from "@voltagent/vercel-ai";
import type { SecurityAgent } from "../types/agents.js";
import type { FileChange } from "../types/github.js";
import type { ReviewCategory, ReviewComment, ReviewSeverity } from "../types/review.js";

/**
 * SecurityAgentの作成
 *
 * 責任:
 * - セキュリティ脆弱性の検出
 * - 認証・認可の問題の特定
 * - データ漏洩リスクの評価
 * - セキュリティベストプラクティスの確認
 */
// biome-ignore lint/suspicious/noExplicitAny: VoltAgent Tool型の制約によりanyが必要
export function createSecurityAgent(tools: Tool<any>[] = []): SecurityAgent {
  return new Agent({
    name: "security-agent",
    instructions: `あなたはサイバーセキュリティの専門家です。コードのセキュリティ脆弱性を検出し、改善提案を行います。

## 専門分野
- **認証・認可**: パスワード管理、JWT、OAuth、権限制御
- **データ保護**: 暗号化、ハッシュ化、機密情報の取り扱い
- **インジェクション攻撃**: SQL、NoSQL、XSS、CSRF、コマンドインジェクション
- **設定セキュリティ**: 安全でないデフォルト設定、環境変数の露出
- **依存関係**: 既知の脆弱性を持つライブラリ、アップデート

## 重要な検出項目
1. **認証・認可の脆弱性**
   - ハードコードされたパスワード・API키
   - 弱いパスワードポリシー
   - 不適切なセッション管理
   - 権限昇格の可能性

2. **インジェクション攻撃**
   - SQLインジェクション
   - NoSQLインジェクション
   - XSS（クロスサイトスクリプティング）
   - コマンドインジェクション
   - パストラバーサル

3. **データ露出**
   - 機密情報のログ出力
   - エラーメッセージでの情報漏洩
   - 暗号化されていないデータ転送
   - 不適切なCORS設定

4. **設定とライブラリ**
   - 安全でないHTTPSの使用
   - デバッグモードの本番環境使用
   - 古い・脆弱なライブラリ
   - 不適切な環境変数管理

## 出力形式
以下のJSON形式で出力してください：
\`\`\`json
{
  "agentName": "security",
  "securityFindings": [
    {
      "filename": "ファイル名",
      "line": 行番号,
      "severity": "critical|error|warning|info",
      "category": "security",
      "vulnerabilityType": "injection|authentication|authorization|dataExposure|configuration|cryptography",
      "title": "脆弱性のタイトル",
      "description": "詳細説明と攻撃シナリオ",
      "impact": "攻撃が成功した場合の影響",
      "suggestion": "具体的な修正方法",
      "codeSnippet": "該当するコード",
      "suggestedFix": "修正後のコード例",
      "references": ["参考URL1", "参考URL2"]
    }
  ],
  "summary": {
    "riskLevel": "critical|high|medium|low",
    "totalVulnerabilities": 3,
    "criticalCount": 1,
    "highCount": 1,
    "mediumCount": 1,
    "recommendations": ["重要な推奨事項1", "重要な推奨事項2"]
  }
}
\`\`\`

日本語で分析し、具体的で実行可能なセキュリティ改善提案を提供してください。攻撃シナリオと影響を明確に説明してください。`,
    llm: new VercelAIProvider(),
    model: openai("gpt-4o-mini"),
    tools,
  });
}

/**
 * SecurityAgentのヘルパークラス
 */
export class SecurityHelpers {
  /**
   * SQLインジェクション脆弱性の検出
   */
  static detectSQLInjection(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // 文字列連結によるSQLクエリ
      const sqlConcatenationPatterns = [
        /['"`]\s*\+\s*\w+\s*\+\s*['"`]/, // "SELECT * FROM " + table + " WHERE"
        /\$\{\w+\}/, // `SELECT * FROM ${table}`
        /query\s*=\s*['"`].*\+/, // query = "SELECT * FROM " +
        /sql\s*=\s*['"`].*\+/, // sql = "SELECT * FROM " +
      ];

      for (const pattern of sqlConcatenationPatterns) {
        if (
          pattern.test(content) &&
          (content.toLowerCase().includes("select") ||
            content.toLowerCase().includes("insert") ||
            content.toLowerCase().includes("update") ||
            content.toLowerCase().includes("delete"))
        ) {
          issues.push({
            id: `sql-injection-${lineNumber}`,
            filename,
            line: lineNumber,
            category: "security" as ReviewCategory,
            severity: "critical" as ReviewSeverity,
            title: "SQLインジェクション脆弱性",
            description:
              "文字列連結によるSQLクエリの構築はSQLインジェクション攻撃を可能にします。攻撃者は任意のSQLコードを実行し、データベースを操作できる可能性があります。",
            suggestion: "プリペアドステートメントまたはパラメータ化クエリを使用してください。",
            codeSnippet: content,
            suggestedFix:
              'プリペアドステートメント: db.prepare("SELECT * FROM users WHERE id = ?").get(userId)',
          });
        }
      }
    });

    return issues;
  }

  /**
   * XSS脆弱性の検出
   */
  static detectXSS(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // innerHTML、outerHTMLの不安全な使用
      if (
        (content.includes("innerHTML") || content.includes("outerHTML")) &&
        !content.includes("textContent") &&
        !content.includes("escape") &&
        !content.includes("sanitize")
      ) {
        issues.push({
          id: `xss-innerhtml-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "error" as ReviewSeverity,
          title: "XSS（クロスサイトスクリプティング）脆弱性",
          description:
            "innerHTML/outerHTMLに未サニタイズのデータを設定するとXSS攻撃が可能になります。攻撃者は任意のJavaScriptコードを実行できます。",
          suggestion: "textContentを使用するか、DOMPurifyなどでサニタイズしてください。",
          codeSnippet: content,
          suggestedFix: content.replace("innerHTML", "textContent"),
        });
      }

      // React dangerouslySetInnerHTMLの使用
      if (content.includes("dangerouslySetInnerHTML") && !content.includes("sanitize")) {
        issues.push({
          id: `xss-dangerous-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "error" as ReviewSeverity,
          title: "XSS脆弱性 - dangerouslySetInnerHTML",
          description:
            "dangerouslySetInnerHTMLに未サニタイズのデータを渡すとXSS攻撃が可能になります。",
          suggestion: "データをサニタイズするか、代替手段を検討してください。",
          codeSnippet: content,
        });
      }

      // eval()の使用
      if (content.includes("eval(") && !content.includes("//")) {
        issues.push({
          id: `xss-eval-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "critical" as ReviewSeverity,
          title: "コードインジェクション - eval使用",
          description:
            "eval()は任意のJavaScriptコードを実行するため、コードインジェクション攻撃の温床となります。",
          suggestion: "eval()の使用を避け、JSON.parse()や他の安全な代替手段を使用してください。",
          codeSnippet: content,
        });
      }
    });

    return issues;
  }

  /**
   * 認証・認可の問題検出
   */
  static detectAuthenticationIssues(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // ハードコードされたパスワード・API키
      const secretPatterns = [
        /password\s*[:=]\s*['"`][^'"`]{3,}['"`]/i,
        /api[_-]?key\s*[:=]\s*['"`][^'"`]{10,}['"`]/i,
        /secret\s*[:=]\s*['"`][^'"`]{8,}['"`]/i,
        /token\s*[:=]\s*['"`][^'"`]{10,}['"`]/i,
      ];

      for (const pattern of secretPatterns) {
        if (pattern.test(content)) {
          issues.push({
            id: `auth-hardcoded-${lineNumber}`,
            filename,
            line: lineNumber,
            category: "security" as ReviewCategory,
            severity: "critical" as ReviewSeverity,
            title: "ハードコードされた認証情報",
            description:
              "パスワード、APIキー、トークンがソースコードに直接記述されています。これらはバージョン管理システムに保存され、機密情報が漏洩する可能性があります。",
            suggestion: "環境変数またはシークレット管理システムを使用してください。",
            codeSnippet: content.replace(/['"`][^'"`]{3,}['"`]/, "***REDACTED***"),
            suggestedFix: "process.env.API_KEY または設定ファイルから読み込み",
          });
        }
      }

      // 弱いパスワードハッシュ化
      if (content.includes("md5") || content.includes("sha1")) {
        issues.push({
          id: `auth-weak-hash-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "error" as ReviewSeverity,
          title: "弱いハッシュアルゴリズム",
          description:
            "MD5やSHA1は暗号学的に脆弱で、レインボーテーブル攻撃や衝突攻撃に対して脆弱です。",
          suggestion:
            "bcrypt、scrypt、またはArgon2などの強力なパスワードハッシュ関数を使用してください。",
          codeSnippet: content,
        });
      }

      // JWT秘密鍵の問題
      if (content.includes("jwt") && content.includes("secret") && content.length < 50) {
        issues.push({
          id: `auth-jwt-weak-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "弱いJWT秘密鍵",
          description:
            "JWT秘密鍵が短すぎる可能性があります。短い秘密鍵はブルートフォース攻撃に対して脆弱です。",
          suggestion: "最低でも256ビット（32文字）以上の強力な秘密鍵を使用してください。",
          codeSnippet: content,
        });
      }
    });

    return issues;
  }

  /**
   * 機密データ露出の検出
   */
  static detectDataExposure(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // ログでの機密情報出力
      const logPatterns = /console\.(log|info|warn|error|debug)/;
      const sensitivePatterns = /(password|token|secret|key|auth)/i;

      if (logPatterns.test(content) && sensitivePatterns.test(content)) {
        issues.push({
          id: `data-log-exposure-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "ログでの機密情報露出",
          description:
            "パスワード、トークン、キーなどの機密情報がログに出力される可能性があります。ログファイルから機密情報が漏洩する危険があります。",
          suggestion:
            "機密情報をログに出力しないよう修正するか、マスキング処理を追加してください。",
          codeSnippet: content,
        });
      }

      // エラーメッセージでの詳細情報露出
      if (
        content.includes("throw new Error") &&
        (content.includes("password") ||
          content.includes("database") ||
          content.includes("internal"))
      ) {
        issues.push({
          id: `data-error-exposure-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "エラーメッセージでの情報露出",
          description:
            "エラーメッセージに内部情報が含まれており、攻撃者にシステムの詳細を提供する可能性があります。",
          suggestion:
            "ユーザーには一般的なエラーメッセージを表示し、詳細はサーバーログのみに記録してください。",
          codeSnippet: content,
        });
      }

      // HTTPでの機密データ送信
      if (content.includes("http://") && !content.includes("localhost")) {
        // HTTPの行を検出し、パッチ全体で機密データが含まれているかチェック
        const patchLower = patch.toLowerCase();
        if (
          patchLower.includes("password") ||
          patchLower.includes("token") ||
          patchLower.includes("secret") ||
          patchLower.includes("key")
        ) {
          issues.push({
            id: `data-http-exposure-${lineNumber}`,
            filename,
            line: lineNumber,
            category: "security" as ReviewCategory,
            severity: "error" as ReviewSeverity,
            title: "HTTP経由での機密データ送信",
            description: "HTTPは暗号化されていないため、機密データが盗聴される可能性があります。",
            suggestion: "HTTPSを使用して通信を暗号化してください。",
            codeSnippet: content,
            suggestedFix: content.replace("http://", "https://"),
          });
        }
      }
    });

    return issues;
  }

  /**
   * 設定とライブラリの問題検出
   */
  static detectConfigurationIssues(patch: string, filename: string): ReviewComment[] {
    const issues: ReviewComment[] = [];
    const lines = patch.split("\n");

    lines.forEach((line, index) => {
      if (!line.startsWith("+")) return;

      const content = line.substring(1).trim();
      const lineNumber = index + 1;

      // CORS設定の問題
      if (content.includes("cors") && content.includes("*")) {
        issues.push({
          id: `config-cors-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "過度に許可的なCORS設定",
          description:
            "すべてのオリジンを許可するCORS設定（*）は、CSRF攻撃やデータ漏洩のリスクを高めます。",
          suggestion: "必要な特定のオリジンのみを許可するよう設定を制限してください。",
          codeSnippet: content,
        });
      }

      // デバッグモードの本番使用
      if (
        (content.includes("debug") || content.includes("DEBUG")) &&
        content.includes("true") &&
        filename.includes("prod")
      ) {
        issues.push({
          id: `config-debug-prod-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "error" as ReviewSeverity,
          title: "本番環境でのデバッグモード有効化",
          description:
            "本番環境でデバッグモードが有効になっており、内部情報が露出する可能性があります。",
          suggestion: "本番環境ではデバッグモードを無効にしてください。",
          codeSnippet: content,
        });
      }

      // 安全でないランダム性
      if (
        content.includes("Math.random()") &&
        (content.includes("token") || content.includes("id") || content.includes("session"))
      ) {
        issues.push({
          id: `config-weak-random-${lineNumber}`,
          filename,
          line: lineNumber,
          category: "security" as ReviewCategory,
          severity: "warning" as ReviewSeverity,
          title: "弱い乱数生成",
          description:
            "Math.random()は暗号学的に安全ではないため、セキュリティに関連する値の生成には適していません。",
          suggestion: "crypto.randomBytes()またはcrypto.getRandomValues()を使用してください。",
          codeSnippet: content,
          suggestedFix: 'crypto.randomBytes(32).toString("hex")',
        });
      }
    });

    return issues;
  }

  /**
   * セキュリティ分析用のフォーマット
   */
  static formatFilesForSecurityAnalysis(files: FileChange[]): string {
    const securityData = {
      totalFiles: files.length,
      filesByType: SecurityHelpers.categorizeBySecurityRisk(files),
      highRiskFiles: files.filter((file) => SecurityHelpers.isHighRiskFile(file.filename)),
      files: files.map((file) => ({
        filename: file.filename,
        status: file.status,
        additions: file.additions,
        deletions: file.deletions,
        securityRisk: SecurityHelpers.assessFileSecurityRisk(file.filename),
        patch: file.patch?.substring(0, 2500), // セキュリティ分析用に2500文字制限
      })),
    };

    return JSON.stringify(securityData, null, 2);
  }

  /**
   * ファイルをセキュリティリスク別に分類
   */
  private static categorizeBySecurityRisk(files: FileChange[]): Record<string, number> {
    const categories = {
      "high-risk": 0,
      "medium-risk": 0,
      "low-risk": 0,
    };

    for (const file of files) {
      const risk = SecurityHelpers.assessFileSecurityRisk(file.filename);
      categories[risk]++;
    }

    return categories;
  }

  /**
   * ファイルのセキュリティリスクレベルを評価
   */
  private static assessFileSecurityRisk(
    filename: string
  ): "high-risk" | "medium-risk" | "low-risk" {
    const highRiskPatterns = [
      /auth/i,
      /login/i,
      /password/i,
      /security/i,
      /crypto/i,
      /token/i,
      /session/i,
      /admin/i,
      /api/i,
      /database/i,
      /config/i,
      /env/i,
      /.env/,
      /middleware/i,
    ];

    const mediumRiskPatterns = [
      /user/i,
      /account/i,
      /profile/i,
      /settings/i,
      /server/i,
      /client/i,
      /utils/i,
      /helpers/i,
    ];

    if (highRiskPatterns.some((pattern) => pattern.test(filename))) {
      return "high-risk";
    }
    if (mediumRiskPatterns.some((pattern) => pattern.test(filename))) {
      return "medium-risk";
    }
    return "low-risk";
  }

  /**
   * 高リスクファイルかどうか判定
   */
  private static isHighRiskFile(filename: string): boolean {
    return SecurityHelpers.assessFileSecurityRisk(filename) === "high-risk";
  }
}
