const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");

require('dotenv').config();

// --- Gemini 初期化 (404対策版) ---
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// 【重要】apiVersion: 'v1' を明示的に指定して、安定版エンドポイントに繋ぎます
const model = genAI.getGenerativeModel({ 
    model: "models/gemini-1.5-flash" // "models/" を頭に付ける
}, { apiVersion: 'v1' });

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
                return message.reply(`⏰ **時間切れ！**\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 2. 基本チェック
            if (!/^[ぁ-んァ-ヶー]+$/.test(input) || input.length < 2) return;

            // 3. ルール判定
            const lastChar = lastWord.slice(-1) === 'ー' ? lastWord.slice(-2, -1) : lastWord.slice(-1);
            if (input[0].localeCompare(lastChar, 'ja', { sensitivity: 'accent' }) !== 0) return;
            if (usedWords.includes(input)) return message.reply(`⚠️ **「${input}」** は既に出ています！`);

            if (input.endsWith('ん') || input.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`💀 **「${input}」** ……「ん」がつきました！負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 4. AI判定と生成
            const nextChar = input.slice(-1) === 'ー' ? input.slice(-2, -1) : input.slice(-1);
            const prompt = `しりとりです。「${input}」が実在する名詞か判定し、次に「${nextChar}」から始まる名詞を出して。形式:「判定:YES, 単語:○○」`;

            const result = await model.generateContent(prompt);
            const response = await result.response;
            const responseText = response.text().trim();

            const isExist = responseText.includes("判定:YES");
            const aiWordMatch = responseText.match(/単語:([ぁ-んァ-ヶー]+)/);
            const aiWord = aiWordMatch ? aiWordMatch[1] : null;

            if (!isExist) return message.reply(`🤔 **「${input}」** は実在しないようです！`);

            if (!aiWord || aiWord.endsWith('ん') || aiWord.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`🏳️ **AIの降参！** 私の負けです！\n**獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 5. 報酬と更新 (Warning対策)
            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            const finalReward = Math.floor(baseReward * (1 + Math.floor(count / 10) * 0.5));
            const newTotal = (totalGained || 0) + finalReward;

            await DataModel.findOneAndUpdate(
                { id: `money_${message.guild.id}_${message.author.id}` }, 
                { $inc: { value: finalReward } }, 
                { upsert: true, returnDocument: 'after' }
            );

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

            const aiNextChar = aiWord.slice(-1) === 'ー' ? aiWord.slice(-2, -1) : aiWord.slice(-1);

            const aiEmbed = new EmbedBuilder()
                .setTitle(`🤖 AI: 「${aiWord}」`)
                .setDescription(`次は **「${aiNextChar}」** です！ (+${finalReward}💰)`)
                .setColor('Blue');

            await message.reply({ embeds: [aiEmbed] });

        } catch (error) {
            console.error('AI Shiritori Error:', error);
            message.reply("🚀 AIの応答エラー。APIキーを [Google AI Studio] で作り直すと直る可能性が高いです。");
        }
    }
};