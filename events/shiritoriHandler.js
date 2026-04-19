const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
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

            const { lastWord, usedWords, difficulty, count, lastTimestamp } = record.value;
            const input = message.content.trim();
            const now = Date.now();

            // --- 1. 時間制限チェック ---
            // 難易度ごとの秒数設定
            const timeLimits = { easy: 60, normal: 30, hard: 10 };
            const limitSeconds = timeLimits[difficulty] || 60;
            
            // 経過時間を計算 (秒)
            const elapsedSeconds = (now - lastTimestamp) / 1000;

            if (elapsedSeconds > limitSeconds) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`⏰ **時間切れです！** (${limitSeconds}秒以内に答えられませんでした)\n**最終記録: ${count} 回**`);
            }

            // --- 2. 基本バリデーション ---
            if (!/^[ぁ-んァ-ヶー]+$/.test(input)) return;
            if (input.length < 2) return;

            // 文字一致判定 (長音対策)
            const lastChar = lastWord.slice(-1).replace('ー', lastWord.slice(-2, -1));
            if (input[0] !== lastChar) return;

            if (usedWords.includes(input)) {
                return message.reply(`⚠️ **「${input}」** は既に出ています！`);
            }

            // 難易度別ルール
            if (difficulty === 'normal' && input.length < 3) return message.reply('⚠️ 3文字以上必要です！');
            if (difficulty === 'hard') {
                if (input.length < 4) return message.reply('⚠️ 4文字以上必要です！');
                if (input.includes('ー')) return message.reply('⚠️ 伸ばし棒禁止です！');
            }

            // --- 3. 終了判定 ---
            if (input.endsWith('ん')) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`💀 **「ん」がつきました！**\n**最終記録: ${count + 1} 回**`);
            }

            // --- 4. 報酬とコンボボーナスの計算 ---
            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            let multiplier = 1.0;

            // 10回ごとに倍率アップ (例: 10回で1.5倍、20回で2.0倍...)
            const currentCombo = count + 1;
            if (currentCombo >= 10) {
                multiplier = 1 + Math.floor(currentCombo / 10) * 0.5;
            }

            const finalReward = Math.floor(baseReward * multiplier);

            // --- 5. データ更新 ---
            await DataModel.findOneAndUpdate({ id: dbKey }, {
                value: {
                    lastWord: input,
                    usedWords: [...usedWords, input],
                    difficulty,
                    count: currentCombo,
                    lastTimestamp: now // 時間を更新
                }
            });

            await DataModel.findOneAndUpdate(
                { id: `money_${message.guild.id}_${message.author.id}` },
                { $inc: { value: finalReward } },
                { upsert: true }
            );

            // フィードバック
            if (currentCombo % 10 === 0) {
                await message.reply(`🔥 **${currentCombo}コンボ達成！** 報酬倍率が **${multiplier}倍** になりました！`);
            }
            await message.react('✅');

        } catch (error) {
            console.error('Shiritori Error:', error);
        }
    },
};