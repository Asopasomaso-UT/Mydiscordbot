const { Events, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

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
            const elapsedSeconds = (now - lastTimestamp) / 1000;

            if (elapsedSeconds > limitSeconds) {
                await DataModel.deleteOne({ id: dbKey });
                return message.reply(`⏰ **時間切れ！** (${limitSeconds}秒を超えました)\n**記録:** ${count}回 / **獲得:** ${(totalGained || 0).toLocaleString()} 💰`);
            }

            // 2. 文字種・バリデーション (カタカナ・ひらがな・長音のみ)
            if (!/^[ぁ-んァ-ヶー]+$/.test(input)) return; 
            if (input.length < 2) return;

            // 3. ルール判定
            // 前の単語の末尾（長音ならその前の文字）を取得
            const lastCharOfPrev = lastWord.slice(-1) === 'ー' ? lastWord.slice(-2, -1) : lastWord.slice(-1);
            
            // 入力単語の頭文字（ひらがな・カタカナを区別せず比較）
            const isFirstCharMatch = input[0].localeCompare(lastCharOfPrev, 'ja', { sensitivity: 'accent' }) === 0;
            if (!isFirstCharMatch) return;

            if (usedWords.includes(input)) {
                return message.reply(`⚠️ **「${input}」** は既に出ています！`);
            }

            // 難易度別制限
            if (difficulty === 'normal' && input.length < 3) return message.reply('⚠️ NORMALは3文字以上必要です！');
            if (difficulty === 'hard') {
                if (input.length < 4) return message.reply('⚠️ HARDは4文字以上必要です！');
                if (input.includes('ー')) return message.reply('⚠️ HARDは「ー」禁止です！');
            }

            // 4. 終了判定（ん / ン）
            if (input.endsWith('ん') || input.endsWith('ン')) {
                await DataModel.deleteOne({ id: dbKey });
                
                const endEmbed = new EmbedBuilder()
                    .setTitle('💀 しりとり終了！')
                    .setDescription([
                        `**「${input}」** で「ん」がつきました。`,
                        `━━━━━━━━━━━━━━`,
                        `📊 **最終記録:** ${count + 1} 回`,
                        `💰 **合計獲得:** ${(totalGained || 0).toLocaleString()} コイン`,
                        `━━━━━━━━━━━━━━`
                    ].join('\n'))
                    .setColor('Red');
                    
                return message.reply({ embeds: [endEmbed] });
            }

            // 5. 報酬・コンボ倍率計算
            let baseReward = difficulty === 'hard' ? 100 : difficulty === 'normal' ? 30 : 10;
            const currentCombo = count + 1;
            const multiplier = currentCombo >= 10 ? 1 + (Math.floor(currentCombo / 10) * 0.5) : 1;
            const finalReward = Math.floor(baseReward * multiplier);
            const newTotalGained = (totalGained || 0) + finalReward;

            // 6. DB更新
            await DataModel.findOneAndUpdate({ id: dbKey }, {
                value: {
                    lastWord: input,
                    usedWords: [...usedWords, input],
                    difficulty,
                    count: currentCombo,
                    totalGained: newTotalGained,
                    lastTimestamp: now 
                }
            });

            // ユーザーの所持金を増やす
            await DataModel.findOneAndUpdate(
                { id: `money_${message.guild.id}_${message.author.id}` },
                { $inc: { value: finalReward } },
                { upsert: true }
            );

            // 成功リアクション
            await message.react('✅');
            if (currentCombo % 10 === 0) {
                await message.reply(`🔥 **${currentCombo}コンボ！** 報酬倍率: **${multiplier}倍**`);
            }

        } catch (error) {
            console.error('Shiritori Engine Error:', error);
        }
    },
};