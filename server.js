require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require("fs");
const app = express();

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, 'pages')));

// ルートパスへのアクセス
app.get("/", (req, res) => {
    const indexPath = path.join(__dirname, 'pages', 'index.html');
    
    // ファイルの存在確認をしてから読み込む（エラー落ち防止）
    if (fs.existsSync(indexPath)) {
        fs.readFile(indexPath, (err, data) => {
            if (err) {
                res.status(500).send("Internal Server Error");
                return;
            }
            res.writeHead(200, { "Content-Type": "text/html" });
            res.write(data);
            res.end();
        });
    } else {
        res.status(404).send("index.htmlが見つかりません。pagesフォルダを確認してください。");
    }
});

// ポート番号は環境変数（PORT）を優先（ホスティングサービス対策）
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`-----------------------------------------`);
    console.log(`🌐 Webサーバーがポート ${PORT} で起動しました`);
    console.log(`-----------------------------------------`);
});

// トークンチェック
if (!process.env.TOKEN) {
    console.error("❌ ERROR: TOKENが設定されていません。.envファイルを確認してください。");
    process.exit(1); // トークンがない場合は起動させない
}

// ボットのメイン処理を読み込み
try {
    require('./main.js');
    console.log("🤖 Discordボットのメインプロセスを読み込みました");
} catch (error) {
    console.error("❌ main.jsの読み込み中にエラーが発生しました:", error);
}