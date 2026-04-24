const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" }, { apiVersion: 'v1' });

const DataModel = mongoose.models.QuickData;

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const dbKey = `shiritori_${guildId}_${message.channel.id}`;
        const petKey = `pet_data_${guildId}_${userId}`;
        
        try {
            const record = await DataModel.findOne({ id: dbKey });
            if (!record || !record.value) return;

            const { lastWord, usedWords, difficulty, count, totalGained, lastTimestamp } = record.value;
            const input = message.content.trim();
            const now = Date.now();

            // 1. 時間切れ判定
            const timeLimits = { easy: 60, normal: 30, hard: 10 };
            const limitSeconds = timeLimits[difficulty] || 60;
            if ((now - lastTimestamp) / 1000 > limitSeconds) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`⏰ **時間切れ！**\n**最終獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 2. 入力バリデーション
            if (!/^[ぁ-んァ-ヶー]+$/.test(input) || input.length < 2) return;
            const lastChar = lastWord.slice(-1) === 'ー' ? lastWord.slice(-2, -1) : lastWord.slice(-1);
            if (input[0].localeCompare(lastChar, 'ja', { sensitivity: 'accent' }) !== 0) return;
            if (usedWords.includes(input)) return message.reply(`⚠️ **「${input}」** は既に出ています！`);

            if (input.endsWith('ん') || input.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`💀 **「${input}」** ……「ん」がつきました！負けです！\n**最終獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // --- AIの処理開始 ---
            // ユーザーに「考えている」ことを伝える（リアクション）
            await message.react('🤔').catch(() => {});

            const nextChar = input.slice(-1) === 'ー' ? input.slice(-2, -1) : input.slice(-1);
            const prompt = `日本語しりとり判定：1. 「${input}」は実在する名詞か？ (YES/NO) 2. 「${nextChar}」から始まる名詞を1つ。回答形式：判定:YES, 単語:○○`;

            let responseText = "";
            try {
                const result = await model.generateContent(prompt);
                const response = await result.response;
                responseText = response.text().trim();
            } catch (apiError) {
                // リアクションを解除（可能であれば）
                message.reactions.removeAll().catch(() => {});

                // --- 【追加】API回数制限(429)のハンドリング ---
                if (apiError.status === 429) {
                    return message.reply("⚠️ **AIの回数制限です！**\n現在、無料枠の限界に達しました。1分ほど待ってからもう一度入力してください。");
                }
                throw apiError; // その他のエラーは外側のcatchへ
            }

            // リアクションを外す
            message.reactions.removeAll().catch(() => {});

            const isExist = responseText.includes("判定:YES");
            const aiWordMatch = responseText.match(/単語:([ぁ-んァ-ヶー]+)/);
            const aiWord = aiWordMatch ? aiWordMatch[1] : null;

            if (!isExist) return message.reply(`🤔 **「${input}」** は存在しないようです！`);

            if (!aiWord || aiWord.endsWith('ん') || aiWord.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`🏳️ **AIの降参！** 私の負けです！\n**最終獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // --- ペット倍率の計算 ---
            const petData = await DataModel.findOne({ id: petKey });
            let totalMultiplier = 0;
            const pets = petData?.value?.pets || [];
            const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
            const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

            equippedPets.forEach(p => {
                const basePart = Number(p.multiplier || 1) * Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
                let enchantFactor = 1.0;
                if (p.enchant) {
                    const type = String(p.enchant.type).toLowerCase();
                    const lv = Number(p.enchant.level || 0);
                    if (type === 'power') enchantFactor += (lv * 0.2);
                    else if (type === 'mimic') enchantFactor += lv;
                }
                totalMultiplier += (basePart * enchantFactor);
            });

            if (totalMultiplier < 1) totalMultiplier = 1.0;

            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            const comboBonus = (1 + Math.floor(count / 10) * 0.5);
            
            const finalReward = Math.floor(baseReward * comboBonus * totalMultiplier);
            const newTotalGained = (totalGained || 0) + finalReward;

            // DB更新
            await Promise.all([
                DataModel.findOneAndUpdate({ id: `money_${guildId}_${userId}` }, { $inc: { value: finalReward } }, { upsert: true }),
                DataModel.findOneAndUpdate({ id: `total_earned_${guildId}_${userId}` }, { $inc: { value: finalReward } }, { upsert: true }),
                DataModel.findOneAndUpdate({ id: dbKey }, {
                    value: {
                        lastWord: aiWord,
                        usedWords: [...usedWords, input, aiWord],
                        difficulty,
                        count: count + 2,
                        totalGained: newTotalGained,
                        lastTimestamp: Date.now()
                    }
                })
            ]);

            const aiNextChar = aiWord.slice(-1) === 'ー' ? aiWord.slice(-2, -1) : aiWord.slice(-1);
            const bonusText = totalMultiplier > 1 ? ` (ペット合計倍率 x${totalMultiplier.toFixed(2)})` : "";

            const aiEmbed = new EmbedBuilder()
                .setTitle(`🤖 AI: 「${aiWord}」`)
                .setDescription(`次は **「${aiNextChar}」** です！\n報酬: **+${finalReward.toLocaleString()}** 💰${bonusText}`)
                .setFooter({ text: `現在の累計獲得: ${newTotalGained.toLocaleString()} 💰` })
                .setColor(totalMultiplier > 10 ? 'Gold' : 'Blue');

            await message.reply({ embeds: [aiEmbed] });

        } catch (error) {
            console.error('AI Shiritori Error:', error);
            // 予期せぬエラー時に「ん」で終わった扱いにせず、ユーザーに通知する
            if (!message.replied) {
                message.reply("🛠️ システムエラーが発生しました。時間を置いて試してください。").catch(() => {});
            }
        }
    }
};