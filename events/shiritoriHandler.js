const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 環境変数の読み込み (.envからAPIキーを取得)
require('dotenv').config();

// Geminiの初期化 (最新のモデル名とAPIバージョンを指定)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ 
    model: "gemini-1.5-flash-latest" 
});

// MongoDBのスキーマ設定
const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Botのメッセージ、またはDMは無視
        if (message.author.bot || !message.guild) return;

        const dbKey = `shiritori_${message.guild.id}_${message.channel.id}`;
        
        try {
            // 現在の進行状況をDBから取得
            const record = await DataModel.findOne({ id: dbKey });
            if (!record || !record.value) return;

            const { lastWord, usedWords, difficulty, count, totalGained, lastTimestamp } = record.value;
            const input = message.content.trim();
            const now = Date.now();

            // 1. 時間制限チェック
            const timeLimits = { easy: 60, normal: 30, hard: 10 };
            const limitSeconds = timeLimits[difficulty] || 60;
            if ((now - lastTimestamp) / 1000 > limitSeconds) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`⏰ **時間切れ！**\n**最終記録:** ${count}回 / **獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 2. 文字形式チェック (ひらがな・カタカナのみ)
            if (!/^[ぁ-んァ-ヶー]+$/.test(input) || input.length < 2) return;

            // 3. ルール判定 (頭文字一致・既出チェック)
            const lastChar = lastWord.slice(-1) === 'ー' ? lastWord.slice(-2, -1) : lastWord.slice(-1);
            const isFirstMatch = input[0].localeCompare(lastChar, 'ja', { sensitivity: 'accent' }) === 0;
            if (!isFirstMatch) return;
            if (usedWords.includes(input)) return message.reply(`⚠️ **「${input}」** は既に出ています！`);

            // 4. 「ん」終了判定
            if (input.endsWith('ん') || input.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`💀 **「${input}」** ……「ん」がつきました！あなたの負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 5. AIによる判定と単語生成 (一括リクエストで高速化)
            const nextChar = input.slice(-1) === 'ー' ? input.slice(-2, -1) : input.slice(-1);
            const prompt = `日本語のしりとり対決です。
            1.「${input}」は実在する一般的な名詞ですか？ (YES/NOで判定)
            2.「${nextChar}」から始まる名詞を1つ答えてください。
            条件:「ん」で終わらない、過去の単語【${usedWords.join(', ')}】は使わない。
            形式:「判定:YES, 単語:○○」という形式で答えてください。`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            // AIの応答を解析
            const isExist = responseText.includes("判定:YES");
            const aiWordMatch = responseText.match(/単語:([ぁ-んァ-ヶー]+)/);
            const aiWord = aiWordMatch ? aiWordMatch[1] : null;

            // 実在しない言葉への対応
            if (!isExist) {
                return message.reply(`🤔 **「${input}」** という言葉は存在しないようです！デタラメはダメですよ！`);
            }

            // AIが言葉に詰まった、または「ん」を出した場合
            if (!aiWord || aiWord.endsWith('ん') || aiWord.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`🏳️ **AIの降参！** 適切な言葉が見つかりませんでした。私の負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 6. 報酬計算と更新
            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            const multiplier = 1 + (Math.floor(count / 10) * 0.5);
            const finalReward = Math.floor(baseReward * multiplier);
            const newTotal = (totalGained || 0) + finalReward;

            // ユーザーのお金データを更新 (Warning回避のオプション付き)
            await DataModel.findOneAndUpdate(
                { id: `money_${message.guild.id}_${message.author.id}` }, 
                { $inc: { value: finalReward } }, 
                { upsert: true, returnDocument: 'after' }
            );

            // しりとり進行データを更新
            await DataModel.findOneAndUpdate(
                { id: dbKey }, 
                {
                    value: {
                        lastWord: aiWord,
                        usedWords: [...usedWords, input, aiWord],
                        difficulty,
                        count: count + 2,
                        totalGained: newTotal,
                        lastTimestamp: Date.now()
                    }
                },
                { returnDocument: 'after' }
            );

            // AIが言った単語の次の文字を特定
            const aiNextChar = aiWord.slice(-1) === 'ー' ? aiWord.slice(-2, -1) : aiWord.slice(-1);

            // 7. 結果を表示
            const aiEmbed = new EmbedBuilder()
                .setTitle(`🤖 AIのターン: 「${aiWord}」`)
                .setDescription(`次は **「${aiNextChar}」** から始めてください！\n(判定: ✅実在確認 / 報酬: +${finalReward}💰)`)
                .setColor('Blue')
                .setFooter({ text: `現在の合計獲得: ${newTotal.toLocaleString()} 💰` });

            await message.reply({ embeds: [aiEmbed] });

        } catch (error) {
            console.error('AI Shiritori Error:', error);
            if (error.message.includes("blocked")) {
                return message.reply("⚠️ その言葉はAIの安全フィルターによってブロックされました。別の言葉にしてください。");
            }
        }
    }
};