#!/usr/bin/env tsx

import "dotenv/config";
import { createCodeAnalysisAgent } from "../src/agents/code-analysis.js";
import { createSecurityAgent } from "../src/agents/security.js";
import { createStyleAgent } from "../src/agents/style.js";
import { createSummaryAgent } from "../src/agents/summary.js";
import { logger } from "../src/utils/logger.js";

/**
 * エージェントの基本動作確認スクリプト
 */
async function testAgents() {
  console.log("🤖 PR Review Agent 動作確認テスト開始\n");

  // 環境変数チェック
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY が設定されていません");
    console.log("💡 .env ファイルに OPENAI_API_KEY=your_api_key を設定してください");
    process.exit(1);
  }

  try {
    // 1. エージェント作成テスト
    console.log("📋 1. エージェント作成テスト");
    const codeAgent = createCodeAnalysisAgent();
    const securityAgent = createSecurityAgent();
    const styleAgent = createStyleAgent();
    const summaryAgent = createSummaryAgent();
    console.log("✅ 全エージェントの作成成功\n");

    // 2. 簡単なテストデータでエージェント実行
    console.log("📋 2. エージェント実行テスト");

    const testCodeData = {
      files: [
        {
          filename: "test.ts",
          status: "modified",
          additions: 5,
          deletions: 2,
          patch: `@@ -1,3 +1,6 @@
+const userPassword = "hardcoded123";
+const query = "SELECT * FROM users WHERE id = " + userId;
+element.innerHTML = userInput;
+var oldVar = getValue();
+console.log(userPassword);
 export function testFunction() {
   return "Hello World";
 }`,
        },
      ],
    };

    console.log("🔍 コード解析エージェント実行中...");
    const codeResponse = await codeAgent.generateText(JSON.stringify(testCodeData));
    console.log("✅ コード解析完了");
    console.log("📄 レスポンス例:", `${codeResponse.text.substring(0, 200)}...\n`);

    console.log("🔒 セキュリティエージェント実行中...");
    const securityResponse = await securityAgent.generateText(JSON.stringify(testCodeData));
    console.log("✅ セキュリティ分析完了");
    console.log("📄 レスポンス例:", `${securityResponse.text.substring(0, 200)}...\n`);

    console.log("🎨 スタイルエージェント実行中...");
    const styleResponse = await styleAgent.generateText(JSON.stringify(testCodeData));
    console.log("✅ スタイル分析完了");
    console.log("📄 レスポンス例:", `${styleResponse.text.substring(0, 200)}...\n`);

    // 3. 統合テスト
    console.log("📋 3. サマリーエージェントテスト");
    const mockAgentResults = [
      {
        agentName: "test-code-analysis",
        executionTimeMs: 1500,
        success: true,
        comments: [
          {
            id: "test-1",
            filename: "test.ts",
            line: 1,
            category: "security" as const,
            severity: "critical" as const,
            title: "ハードコードされたパスワード",
            description: "パスワードがソースコードに直接記述されています",
          },
        ],
        metadata: { testMode: true },
      },
    ];

    console.log("📋 サマリーエージェント実行中...");
    const summaryResponse = await summaryAgent.generateText(
      JSON.stringify({
        timestamp: new Date().toISOString(),
        agentResults: mockAgentResults,
      })
    );
    console.log("✅ サマリー生成完了");
    console.log("📄 レスポンス例:", `${summaryResponse.text.substring(0, 200)}...\n`);

    console.log("🎉 全ての動作確認が完了しました！");
    console.log("\n📝 次のステップ:");
    console.log("  1. GitHub リポジトリの Settings > Secrets で環境変数を設定");
    console.log("  2. PR を作成して GitHub Actions でのテスト");
    console.log("  3. 実際の PR レビューコメントを確認");
  } catch (error) {
    console.error("❌ エラーが発生しました:", error);
    console.log("\n🔧 トラブルシューティング:");
    console.log("  - API キーが正しく設定されているか確認");
    console.log("  - インターネット接続を確認");
    console.log("  - npm run build が成功しているか確認");
    process.exit(1);
  }
}

// TypeScript実行環境での条件チェック
if (import.meta.url === `file://${process.argv[1]}`) {
  testAgents();
}
