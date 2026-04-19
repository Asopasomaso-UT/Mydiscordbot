const { Events } = require('discord.js');
const mongoose = require('mongoose');

// Mongoose スキーマ定義
const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        // Botの発言、DM、スラッシュコマンド（/）は対象外
        if (message.author.bot || !message.guild || message.content.startsWith('/')) return;

        const { author, guild } = message;
        const moneyKey = `money_${guild.id}_${author.id}`;
        const totalEarnedKey = `total_earned_${guild.id}_${author.id}`; // 累計額用キー

        try {
            // MongoDB 接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // 1. 【所持金】の更新（10コイン加算）
            await DataModel.findOneAndUpdate(
                { id: moneyKey },
                { $inc: { value: 10 } },
                { upsert: true, returnDocument: 'after' }
            );

            // 2. 【累計獲得額】の更新（10コイン加算）
            // これによりメッセージ送信分もランキングに反映されます
            await DataModel.findOneAndUpdate(
                { id: totalEarnedKey },
                { $inc: { value: 10 } },
                { upsert: true, returnDocument: 'after' }
            );

        } catch (error) {
            console.error('コイン付与エラー:', error);
        }
    },
};