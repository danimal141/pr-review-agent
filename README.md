# 🤖 PR Review Agent

VoltAgent を使用した AI 駆動の GitHub Pull Request レビューエージェント

## 📝 概要

このプロジェクトは、AI エージェントを使用してGitHub Pull Requestの自動レビューを行うシステムです。複数の専門エージェントが協力して、コード品質、セキュリティ、スタイルなどの観点から包括的なレビューを提供します。

### 🎯 主な機能

- **マルチエージェント分析**: 専門性の異なる複数のAIエージェントによる詳細な分析
- **包括的レビュー**: コード品質、セキュリティ、パフォーマンス、スタイルを総合評価
- **自動コメント投稿**: GitHub PRに直接レビューコメントを投稿
- **リアルタイム分析**: PR作成・更新時の自動トリガー
- **詳細レポート**: GitHub Actions Job Summary での詳細な分析結果表示

### 🤖 エージェント構成

1. **スーパーバイザーエージェント** (`supervisor`) - 全体の調整と品質管理
2. **コード解析エージェント** (`code-analysis`) - コード品質とメトリクス分析
3. **セキュリティエージェント** (`security`) - セキュリティ脆弱性とベストプラクティス
4. **スタイルエージェント** (`style`) - コーディングスタイルと規約
5. **サマリーエージェント** (`summary`) - 結果統合と最終レポート生成

## 🚀 セットアップ

### 必要な環境

- Node.js 21.0.0 以上
- GitHub Actions 環境（自動レビュー用）
- AIプロバイダーAPIキー（OpenAI、Anthropic、Googleのいずれか）

### 1. インストール

```bash
# リポジトリをクローン
git clone https://github.com/your-username/pr-review-agent.git
cd pr-review-agent

# 依存関係をインストール
npm install

# TypeScriptをビルド
npm run build
```

### 2. 環境変数の設定

`.env` ファイルを作成し、以下の環境変数を設定：

```bash
# GitHub API
GITHUB_TOKEN=your_github_token_here

# AI Provider (いずれか一つ以上を設定)
OPENAI_API_KEY=your_openai_api_key_here
# ANTHROPIC_API_KEY=your_anthropic_api_key_here
# GOOGLE_AI_API_KEY=your_google_ai_api_key_here

# ログ設定
LOG_LEVEL=info

# レビュー設定 (オプション)
AI_REVIEW_MAX_FILES=20
AI_REVIEW_MAX_LINES=5000
```

### 3. GitHub Secrets の設定

リポジトリの Settings > Secrets and variables > Actions で以下のシークレットを追加：

- `OPENAI_API_KEY` (またはその他のAIプロバイダーキー)
- `GITHUB_TOKEN` は自動で設定されます

## 📖 使用方法

### GitHub Actions での自動レビュー

プロジェクトには以下のGitHub Actionsワークフローが含まれています：

#### ワークフロー設定 (`.github/workflows/pr-review.yml`)

```yaml
name: PR Review Agent

on:
  pull_request:
    types: [opened, synchronize, reopened]
    branches: [main, master]

permissions:
  contents: read
  pull-requests: write
  issues: write
```

#### 必要なシークレット

リポジトリの **Settings > Secrets and variables > Actions** で以下を設定：

| シークレット名      | 必須 | 説明                     |
| ------------------- | ---- | ------------------------ |
| `ANTHROPIC_API_KEY` | ❌    | Anthropic Claude APIキー |
| `OPENAI_API_KEY`    | ❌    | OpenAI GPT APIキー       |
| `GOOGLE_AI_API_KEY` | ❌    | Google Gemini APIキー    |

**注意**: 少なくとも1つのAI APIキーが必要です。`GITHUB_TOKEN`は自動で提供されます。

#### 動作フロー

1. Pull Request が作成・更新されると自動でトリガー
2. Node.js 21環境をセットアップ
3. 依存関係をインストールしプロジェクトをビルド
4. PR情報を環境変数として渡してレビューエージェントを実行
5. レビュー結果をPRコメントとして自動投稿

#### ワークフロー実行結果の確認

- **Actions タブ**: 実行ログとJob Summaryで詳細分析結果を確認
- **Pull Request**: AIレビューコメントが自動投稿
- **Checks セクション**: PRページでレビュー状況を確認

### ローカルでの実行

```bash
# 開発モードで実行
npm run dev

# テストを実行
npm test

# 本番モードで実行
npm start
```

### CLI での使用

```bash
# 特定のPRをレビュー
node dist/index.js --pr 123 --repo owner/repository

# 設定のテスト
node dist/index.js --test-config
```

## 🛠️ 設定

### AI プロバイダーの選択

複数のAIプロバイダーに対応しています：

- **OpenAI GPT-4**: 高い精度の分析（推奨）
- **Anthropic Claude**: 安全性重視の分析
- **Google Gemini**: コスト効率の良い分析

### レビュー設定のカスタマイズ

`src/utils/config.ts` でレビューの詳細設定が可能：

```typescript
export const config = {
  review: {
    maxFiles: 20,           // 分析する最大ファイル数
    maxLines: 5000,         // 分析する最大行数
    skipDraftPR: true,      // ドラフトPRをスキップ
    languages: ['ts', 'js', 'py', 'java'], // 対象言語
  },
  agents: {
    timeout: 30000,         // エージェント実行タイムアウト
    retries: 3,             // リトライ回数
  },
};
```

## 📊 レビュー結果の見方

### レビューコメント

各問題に対して以下の情報を提供：

- 🔴 **重大**: 即座に修正が必要
- 🟠 **エラー**: 修正を強く推奨
- 🟡 **警告**: 改善を推奨
- ℹ️ **情報**: 参考情報や学習機会

### スコアリング

- **全体スコア**: 0-100のコード品質スコア
- **推奨事項**: Approve / Request Changes / Comment
- **カテゴリ別分析**: セキュリティ、品質、パフォーマンス等

## ✅ 動作確認

### 1. ローカルでの基本動作確認

```bash
# 1. 環境変数を設定
cp .env.example .env
# .envファイルにOPENAI_API_KEYを設定

# 2. ビルドとテスト
npm run build
npm test

# 3. エージェントの動作確認
npm run test:agents
```

### 2. GitHub Actionsでの統合テスト

#### 2.1 リポジトリの設定
```bash
# GitHub Secretsに以下の環境変数を設定:
# OPENAI_API_KEY: OpenAI APIキー
# GITHUB_TOKEN: GitHubトークン（自動設定）
```

#### 2.2 テスト用PRの作成
```bash
# テスト用ブランチを作成
git checkout -b test/pr-review-demo
echo 'const password = "test123";' > demo-file.ts
git add demo-file.ts
git commit -m "test: demo PR for AI review"
git push origin test/pr-review-demo
```

#### 2.3 レビュー結果の確認
- GitHub ActionsのJob Summaryで詳細な分析結果を確認
- PRコメントで自動レビューを確認
- 各エージェントの分析結果を確認

### 3. ローカルでのワークフローテスト

```bash
# 環境変数を設定してワークフローを直接実行
GITHUB_TOKEN="your_token" \
GITHUB_REPOSITORY="owner/repo" \
node dist/index.js
```

### 4. 期待される結果

正常に動作している場合、以下のような結果が期待されます：

#### セキュリティエージェント
- ハードコードされたパスワードの検出
- SQLインジェクション脆弱性の検出
- XSS脆弱性の検出

#### コード解析エージェント
- コード品質の評価
- 複雑度の分析
- パフォーマンス問題の検出

#### スタイルエージェント
- 命名規則の確認
- フォーマットの問題検出
- ベストプラクティスの評価

#### サマリーエージェント
- 統合されたレビュー結果
- 重要度別の問題整理
- 建設的な改善提案

### 5. トラブルシューティング

#### API接続エラー
```bash
# APIキーの確認
echo $OPENAI_API_KEY

# インターネット接続の確認
curl -I https://api.openai.com/v1/models

# 権限の確認
curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
```

#### GitHub Actions エラー
- Secrets設定の確認
- ワークフローファイルの構文確認
- ログの詳細確認

#### ローカル実行エラー
```bash
# 依存関係の再インストール
rm -rf node_modules package-lock.json
npm install

# TypeScriptビルドエラーの確認
npm run type-check

# Lintエラーの確認
npm run lint
```

## 🧪 開発とテスト

### テストの実行

```bash
# 全テストを実行
npm test

# ウォッチモードでテスト
npm run test:watch

# エージェント動作確認テスト
npm run test:agents

# TypeScript型チェック
npm run type-check
```

### コード品質チェック

このプロジェクトでは [Biome](https://biomejs.dev/) を使用してlintとformatを行っています。

```bash
# Linting（lint、format、import整理を一括チェック）
npm run check

# 自動修正
npm run check:fix

# Lintのみ
npm run lint
npm run lint:fix

# Formatのみ
npm run format
npm run format:fix
```

**VSCode での使用:**
- [Biome VSCode拡張](https://marketplace.visualstudio.com/items?itemName=biomejs.biome)をインストール
- 保存時の自動フォーマットが有効になります
- 設定ファイル（`.vscode/settings.json`）で設定済み

### デバッグ

詳細なログを有効にする：

```bash
LOG_LEVEL=debug npm run dev
```

## 🤝 コントリビューション

1. このリポジトリをフォーク
2. フィーチャーブランチを作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. Pull Request を作成

### 開発ガイドライン

- TypeScript を使用
- テストを含める
- ESLint ルールに従う
- コミットメッセージは日本語OK

## 📄 ライセンス

このプロジェクトは MIT ライセンスの下で公開されています。詳細は [LICENSE](LICENSE) ファイルを参照してください。

## 🙏 謝辞

- [VoltAgent](https://github.com/voltagent/voltagent) - AIエージェントフレームワーク
- [Octokit](https://github.com/octokit/octokit.js) - GitHub API クライアント
- OpenAI、Anthropic、Google - AIプロバイダー

## 📞 サポート

問題や質問がある場合：

1. [Issues](https://github.com/your-username/pr-review-agent/issues) で報告
2. [Discussions](https://github.com/your-username/pr-review-agent/discussions) で議論
3. プロジェクトをスターして応援 ⭐
