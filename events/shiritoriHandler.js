const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 環境変数の読み込み
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const dbKey = `shiritori_${message.guild.id}_${message.channel.id}`;
        
        try {
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

            // 2. 文字形式チェック
            if (!/^[ぁ-んァ-ヶー]+$/.test(input) || input.length < 2) return;

            // 3. ルール判定 (頭文字・既出)
            const lastChar = lastWord.slice(-1) === 'ー' ? lastWord.slice(-2, -1) : lastWord.slice(-1);
            const isFirstMatch = input[0].localeCompare(lastChar, 'ja', { sensitivity: 'accent' }) === 0;
            if (!isFirstMatch) return;
            if (usedWords.includes(input)) return message.reply(`⚠️ **「${input}」** は既に出ています！`);

            // 難易度制限
            if (difficulty === 'normal' && input.length < 3) return message.reply('⚠️ 3文字以上！');
            if (difficulty === 'hard' && (input.length < 4 || input.includes('ー'))) return message.reply('⚠️ HARDルール違反！');

            // 4. AIによる一括判定＆単語生成（ここを高速化）
            const nextChar = input.slice(-1) === 'ー' ? input.slice(-2, -1) : input.slice(-1);
            
            // 「ん」で終わった場合はAIを呼ばずに終了
            if (input.endsWith('ん') || input.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`💀 **「${input}」** ……「ん」がつきました！あなたの負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            const prompt = `日本語のしりとりをしています。
            1. ユーザーの単語「${input}」は実在する一般的な名詞ですか？ (YES/NO)
            2. もしYESなら、「${nextChar}」から始まる名詞を1つ答えてください。
            
            条件：
            - AIの回答は「ん」で終わらないこと。
            - 過去の単語【${usedWords.join(', ')}, ${input}】は使わないこと。
            - 回答形式は必ず「判定:YES/NO, 単語:○○」という形式で、余計な説明は省いてください。`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            // 5. 判定の解析
            const isExist = responseText.includes("判定:YES");
            const aiWordMatch = responseText.match(/単語:([ぁ-んァ-ヶー]+)/);
            const aiWord = aiWordMatch ? aiWordMatch[1] : null;

            if (!isExist) {
                return message.reply(`🤔 **「${input}」** という言葉は存在しないようです。ちゃんとした言葉を打ってください！`);
            }

            if (!aiWord || aiWord.endsWith('ん') || aiWord.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`🏳️ **AIの降参！** 言葉が見つかりませんでした。私の負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 6. 成功・報酬計算
            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            const multiplier = (count + 1) >= 10 ? 1 + (Math.floor((count + 1) / 10) * 0.5) : 1;
            const finalReward = Math.floor(baseReward * multiplier);
            const newTotal = (totalGained || 0) + finalReward;

            // ユーザーのコイン更新
            await DataModel.findOneAndUpdate({ id: `money_${message.guild.id}_${message.author.id}` }, { $inc: { value: finalReward } }, { upsert: true });

            // 7. DB更新
            await DataModel.findOneAndUpdate({ id: dbKey }, {
                value: {
                    lastWord: aiWord,
                    usedWords: [...usedWords, input, aiWord],
                    difficulty,
                    count: count + 2,
                    totalGained: newTotal,
                    lastTimestamp: Date.now()
                },
                returnDocument: 'after'
            });

            // 8. AIの回答表示
            const aiEmbed = new EmbedBuilder()
                .setTitle(`🤖 AIのターン: 「${aiWord}」`)
                .setDescription(`次は **「${aiWord.slice(-1).replace('ー', aiWord.slice(-1) === 'ー' ? aiWord.slice(-2, -1) : '')}」** から始めてください！\n(判定: ✅実在確認 / 報酬: +${finalReward}💰)`)
                .setColor('Blue');

            await message.reply({ embeds: [aiEmbed] });

        } catch (error) {
            console.error('AI Shiritori Error:', error);
            // エラーが出た場合も「ん」で終わらない限り続行させるため、メッセージだけ出す
            if (error.message.includes("blocked")) {
                message.reply("⚠️ 不適切な言葉としてAIにブロックされました。別の言葉にしてください。");
            }
        }
    },
};
};