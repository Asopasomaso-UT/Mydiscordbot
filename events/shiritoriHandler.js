require('dotenv').config(); // これがないと .env を読み込めません

const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// Geminiの初期化 (.envにGEMINI_API_KEYを入れておいてください)
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
                return message.reply(`⏰ **時間切れ！**\n**最終記録:** ${count}回 / **獲得:** ${totalGained.toLocaleString()} 💰`);
            }

            // 2. 文字種・形式チェック
            if (!/^[ぁ-んァ-ヶー]+$/.test(input) || input.length < 2) return;

            // 3. ルール判定 (頭文字・既出)
            const lastChar = lastWord.slice(-1) === 'ー' ? lastWord.slice(-2, -1) : lastWord.slice(-1);
            if (input[0].localeCompare(lastChar, 'ja', { sensitivity: 'accent' }) !== 0) return;
            if (usedWords.includes(input)) return message.reply(`⚠️ **「${input}」** は既に出ています！`);

            // 難易度別文字制限
            if (difficulty === 'normal' && input.length < 3) return message.reply('⚠️ 3文字以上！');
            if (difficulty === 'hard' && (input.length < 4 || input.includes('ー'))) return message.reply('⚠️ HARDルール違反！');

            // 4. AIによる「実在チェック」
            const checkPrompt = `しりとりをしています。「${input}」という言葉は、日本語として実在する一般的な名詞ですか？
            返答は必ず「YES」か「NO」のどちらか一言だけで答えてください。`;
            const checkResult = await model.generateContent(checkPrompt);
            const isExist = checkResult.response.text().trim().toUpperCase();

            if (isExist.includes("NO")) {
                return message.reply(`🤔 **「${input}」** という言葉は存在しないようです。ちゃんとした言葉を打ってください！`);
            }

            // 5. 「ん」終了判定
            if (input.endsWith('ん') || input.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`💀 **「${input}」** ……「ん」がつきました！あなたの負けです！\n**獲得:** ${totalGained.toLocaleString()} 💰`);
            }

            // 6. 報酬計算 (ユーザーが正解した分)
            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            const multiplier = (count + 1) >= 10 ? 1 + (Math.floor((count + 1) / 10) * 0.5) : 1;
            const finalReward = Math.floor(baseReward * multiplier);
            const updatedTotal = (totalGained || 0) + finalReward;

            // ユーザーにコイン付与
            await DataModel.findOneAndUpdate({ id: `money_${message.guild.id}_${message.author.id}` }, { $inc: { value: finalReward } }, { upsert: true });

            // 7. AIのターン！
            const nextChar = input.slice(-1) === 'ー' ? input.slice(-2, -1) : input.slice(-1);
            const aiPrompt = `しりとりをしています。「${nextChar}」から始まる、実在する一般的な日本語の名詞を1つだけ答えてください。
            条件：
            - 「ん」で終わらないこと
            - 今まで出た単語リスト【${usedWords.join(', ')}, ${input}】以外の言葉にすること
            - 返答は単語のみ。余計な解説は不要。`;

            const aiResult = await model.generateContent(aiPrompt);
            const aiWord = aiResult.response.text().trim().replace(/[^\u3040-\u309F\u30A0-\u30FFー]/g, "");

            if (!aiWord || aiWord.endsWith('ん') || aiWord.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`🏳️ **AIの降参！** 「${aiWord || "思いつきません"}」...私の負けです！\n**ボーナス獲得！**`);
            }

            // 8. DB更新
            await DataModel.findOneAndUpdate({ id: dbKey }, {
                value: {
                    lastWord: aiWord,
                    usedWords: [...usedWords, input, aiWord],
                    difficulty,
                    count: count + 2, // ユーザーとAIの2手分
                    totalGained: updatedTotal,
                    lastTimestamp: Date.now()
                }
            });

            // AIの回答を表示
            const aiEmbed = new EmbedBuilder()
                .setTitle(`🤖 AIのターン: 「${aiWord}」`)
                .setDescription(`次は **「${aiWord.slice(-1).replace('ー', aiWord.slice(-2, -1))}」** から始めてください！\n(判定: ✅実在確認済み / 報酬: +${finalReward}💰)`)
                .setColor('Blue');

            await message.reply({ embeds: [aiEmbed] });

        } catch (error) {
            console.error('AI Shiritori Error:', error);
        }
    },
};