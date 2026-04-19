const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");

// 環境変数の読み込み
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" });

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

            // 3. ルール判定 (頭文字一致・既出)
            const lastChar = lastWord.slice(-1) === 'ー' ? lastWord.slice(-2, -1) : lastWord.slice(-1);
            const isFirstMatch = input[0].localeCompare(lastChar, 'ja', { sensitivity: 'accent' }) === 0;
            if (!isFirstMatch) return;
            if (usedWords.includes(input)) return message.reply(`⚠️ **「${input}」** は既に出ています！`);

            // 4. 「ん」終了判定
            if (input.endsWith('ん') || input.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`💀 **「${input}」** ……「ん」がつきました！あなたの負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 5. AI判定と単語生成
            const nextChar = input.slice(-1) === 'ー' ? input.slice(-2, -1) : input.slice(-1);
            const prompt = `日本語のしりとりです。
            1.「${input}」は実在する名詞？ (YES/NO)
            2.「${nextChar}」から始まる名詞を1つ。
            条件:「ん」不可、既出【${usedWords.join(', ')}】不可。
            形式:「判定:YES, 単語:○○」`;

            const result = await model.generateContent(prompt);
            const responseText = result.response.text().trim();

            const isExist = responseText.includes("判定:YES");
            const aiWordMatch = responseText.match(/単語:([ぁ-んァ-ヶー]+)/);
            const aiWord = aiWordMatch ? aiWordMatch[1] : null;

            if (!isExist) return message.reply(`🤔 **「${input}」** は存在しないようです！`);

            if (!aiWord || aiWord.endsWith('ん') || aiWord.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`🏳️ **AIの降参！** 適切な言葉が見つかりませんでした。私の負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 6. 報酬計算
            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            const finalReward = Math.floor(baseReward * (1 + Math.floor(count / 10) * 0.5));
            const newTotal = (totalGained || 0) + finalReward;

            // ユーザーのお金を増やす
            await DataModel.findOneAndUpdate(
                { id: `money_${message.guild.id}_${message.author.id}` }, 
                { $inc: { value: finalReward } }, 
                { upsert: true }
            );

            // しりとりデータを更新
            await DataModel.findOneAndUpdate({ id: dbKey }, {
                value: {
                    lastWord: aiWord,
                    usedWords: [...usedWords, input, aiWord],
                    difficulty,
                    count: count + 2,
                    totalGained: newTotal,
                    lastTimestamp: Date.now()
                }
            });

            // 次の文字を取得 (末尾がーならその前)
            const aiNextChar = aiWord.slice(-1) === 'ー' ? aiWord.slice(-2, -1) : aiWord.slice(-1);

            const aiEmbed = new EmbedBuilder()
                .setTitle(`🤖 AI: 「${aiWord}」`)
                .setDescription(`次は **「${aiNextChar}」** から始めてください！ (+${finalReward}💰)`)
                .setColor('Blue');

            await message.reply({ embeds: [aiEmbed] });

        } catch (error) {
            console.error('AI Error:', error);
        }
    }
};