import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { CodeAnalyzer } from './code-analyzer.js';
import { logger } from './utils/logger';

// VoltAgentのデバッグログを無効化（「Agent not found」メッセージを非表示）
const originalDebug = console.debug;
console.debug = (...args) => {
  if (args[0] && typeof args[0] === 'string' && args[0].includes('[AgentEventEmitter]')) {
    return; // AgentEventEmitterのデバッグログを無視
  }
  originalDebug.apply(console, args);
};

// ES Module環境での__dirname代替
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// ミドルウェア設定
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// ヘルスチェック
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'PR Review Agent',
    version: '0.1.0',
    timestamp: new Date().toISOString()
  });
});

// PR分析エンドポイント（デモ用）
app.post('/api/analyze', async (req: any, res: any) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'コードが提供されていません' });
    }

    logger.info('WebServer', 'コード分析リクエスト');

    // 新しいCodeAnalyzerクラスを使用
    const analyzer = new CodeAnalyzer();

    // ファイル名を推測
    const filename = code.includes('function') ? 'code.js' :
                    code.includes('def ') ? 'code.py' :
                    code.includes('class ') && code.includes('interface') ? 'code.ts' :
                    code.includes('public class') ? 'Code.java' : 'code.txt';

    const analysisReport = await analyzer.analyzeCode(code, filename);

    logger.info('WebServer', 'コード分析完了');

    res.json({
      success: true,
      result: {
        reviewId: analysisReport.analysisId,
        summary: {
          overallScore: analysisReport.summary.overallScore,
          totalComments: analysisReport.summary.totalComments,
          recommendation: analysisReport.summary.recommendation
        },
        comments: analysisReport.agentResults.flatMap(agent => agent.comments),
        executionTime: analysisReport.executionStats.totalTimeMs
      }
    });

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('WebServer', `PR分析エラー: ${errorMessage}`);

    res.status(500).json({
      error: 'サーバーエラーが発生しました',
      details: errorMessage
    });
  }
});

// parseAgentComments関数は不要になったので削除

// フロントエンド用のHTMLページ
app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="ja">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Code Analyzer</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            max-width: 1200px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f8f9fa;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 2rem;
            border-radius: 12px;
            margin-bottom: 2rem;
            text-align: center;
        }
        .container {
            background: white;
            padding: 2rem;
            border-radius: 12px;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
            margin-bottom: 2rem;
        }
        .form-group {
            margin-bottom: 1.5rem;
        }
        label {
            display: block;
            margin-bottom: 0.5rem;
            font-weight: 600;
            color: #374151;
        }
        input[type="text"], textarea {
            width: 100%;
            padding: 0.75rem;
            border: 2px solid #e5e7eb;
            border-radius: 8px;
            font-size: 1rem;
            transition: border-color 0.2s;
        }
        input[type="text"]:focus, textarea:focus {
            outline: none;
            border-color: #667eea;
        }
        textarea {
            min-height: 200px;
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
        }
        .btn {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 0.75rem 2rem;
            border: none;
            border-radius: 8px;
            font-size: 1rem;
            cursor: pointer;
            transition: transform 0.2s;
        }
        .btn:hover {
            transform: translateY(-2px);
        }
        .btn:disabled {
            opacity: 0.6;
            cursor: not-allowed;
            transform: none;
        }
        .loading {
            display: none;
            text-align: center;
            padding: 2rem;
        }
        .results {
            display: none;
            background: #f8f9fa;
            padding: 1.5rem;
            border-radius: 8px;
            border-left: 4px solid #667eea;
        }
        .comment-item {
            background: white;
            padding: 1rem;
            margin: 0.5rem 0;
            border-radius: 6px;
            border-left: 3px solid #fbbf24;
        }
        .comment-item.error {
            border-left-color: #ef4444;
        }
        .comment-item.warning {
            border-left-color: #f59e0b;
        }
        .comment-item.info {
            border-left-color: #3b82f6;
        }
        .emoji {
            font-size: 1.2em;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🤖 AI Code Analyzer</h1>
        <p>VoltAgentを使用したAI駆動のコード分析ツール</p>
        <small style="opacity: 0.9;">セキュリティ、品質、スタイルの問題を自動検出</small>
    </div>

    <div class="container">
        <h2>📝 AI コード分析</h2>
        <div style="background: #e0f2fe; border: 1px solid #0284c7; border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem;">
            <strong>🔍 AI コード分析ツール:</strong>
            <ul style="margin: 0.5rem 0 0 0; padding-left: 1.5rem;">
                <li>下記のテキストエリアにコードを入力してください</li>
                <li>AI が セキュリティ、コード品質、スタイルの問題を検出します</li>
                <li>TypeScript、JavaScript、Python などの言語に対応</li>
            </ul>
        </div>
        <form id="analyzeForm">

            <div class="form-group">
                <label for="code">分析対象のコード:</label>
                <textarea id="code" name="code" placeholder="ここにコードを入力してください..." required>
// TypeScriptサンプルコード
interface User {
  id: string;
  name: string;
  email: string;
}

class UserService {
  // SQLインジェクション脆弱性あり
  async getUserData(userId: string): Promise<User> {
    const query = "SELECT * FROM users WHERE id = " + userId; // 危険
    return await this.database.query(query);
  }

  // XSS脆弱性あり
  displayUserInfo(user: User): void {
    document.getElementById('userInfo')!.innerHTML = user.name; // 危険
  }

  // ハードコードされた認証情報
  private readonly apiKey = "sk-1234567890abcdef"; // 危険

  // any型の使用（型安全性問題）
  processData(data: any): any { // 改善の余地
    return data;
  }
}</textarea>
            </div>

            <button type="submit" class="btn" id="analyzeBtn">
                <span class="emoji">🔍</span> コードを分析
            </button>
        </form>
    </div>

    <div class="loading" id="loading">
        <h3>🤖 AI分析中...</h3>
        <p>しばらくお待ちください。コードを詳細に分析しています。</p>
    </div>

    <div class="results" id="results">
        <h3>📊 分析結果</h3>
        <div id="resultContent"></div>
    </div>

    <script>
        document.getElementById('analyzeForm').addEventListener('submit', async (e) => {
            e.preventDefault();

            const btn = document.getElementById('analyzeBtn');
            const loading = document.getElementById('loading');
            const results = document.getElementById('results');
            const resultContent = document.getElementById('resultContent');

            // UI状態を更新
            btn.disabled = true;
            loading.style.display = 'block';
            results.style.display = 'none';

            try {
                const formData = new FormData(e.target);
                const response = await fetch('/api/analyze', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        code: formData.get('code')
                    })
                });

                const data = await response.json();

                if (data.success) {
                    // 結果を表示
                    let html = \`
                        <div style="background: #e0f2fe; border: 1px solid #0284c7; border-radius: 6px; padding: 1rem; margin-bottom: 1.5rem;">
                            <h4>🎯 AI分析結果</h4>
                            <p style="margin: 0.5rem 0; font-size: 0.9em; color: #0369a1;">入力されたコードを分析した結果です</p>
                        </div>
                        <div style="margin-bottom: 1.5rem;">
                            <h4>📋 サマリー</h4>
                            <p><strong>総合スコア:</strong> \${(data.result.summary.overallScore * 10).toFixed(1)}/10</p>
                            <p><strong>検出された問題:</strong> \${data.result.summary.totalComments}件</p>
                            <p><strong>実行時間:</strong> \${data.result.executionTime}ms</p>
                        </div>
                    \`;

                    if (data.result.comments && data.result.comments.length > 0) {
                        html += '<h4>🔍 詳細な問題</h4>';
                        data.result.comments.forEach(comment => {
                            const severityClass = comment.severity || 'info';
                            const severityEmoji = {
                                'critical': '🔴',
                                'error': '🟠',
                                'warning': '🟡',
                                'info': 'ℹ️'
                            }[severityClass] || 'ℹ️';

                            html += \`
                                <div class="comment-item \${severityClass}">
                                    <strong>\${severityEmoji} \${comment.category || 'General'}</strong>
                                    <p>\${comment.message}</p>
                                    \${comment.suggestion ? \`<p><em>💡 提案: \${comment.suggestion}</em></p>\` : ''}
                                </div>
                            \`;
                        });
                    }

                    resultContent.innerHTML = html;
                    results.style.display = 'block';
                } else {
                    throw new Error(data.error || '分析に失敗しました');
                }

            } catch (error) {
                resultContent.innerHTML = \`
                    <div class="comment-item error">
                        <strong>❌ エラー</strong>
                        <p>\${error.message}</p>
                    </div>
                \`;
                results.style.display = 'block';
            } finally {
                btn.disabled = false;
                loading.style.display = 'none';
            }
        });
    </script>
</body>
</html>
  `);
});

// サーバー起動
app.listen(PORT, () => {
  logger.info('WebServer', `🌐 PR Review Agent Web UI が起動しました`);
  logger.info('WebServer', `🔗 http://localhost:${PORT} でアクセスできます`);
  logger.info('WebServer', `📝 コード分析を試してみてください！`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('WebServer', 'サーバーを停止しています...');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('WebServer', 'サーバーを停止しています...');
  process.exit(0);
});
