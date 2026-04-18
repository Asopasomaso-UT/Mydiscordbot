const { Events } = require('discord.js');
const mongoose = require('mongoose');

// Mongoose スキーマ定義
const dataSchema = new mongoose.Schema({
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
        const dbKey = `money_${guild.id}_${author.id}`;

        try {
            // MongoDB 接続確認（念のため）
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // $inc を使うことで、今の値に「10」を直接加算できます（Mongooseの便利な機能）
            await DataModel.findOneAndUpdate(
                { id: dbKey },
                { $inc: { value: 10 } }, // value フィールドを 10 増やす
                { upsert: true, new: true } // データがなければ作成する
            );

            // console.log(`${author.tag} に10コイン付与しました`);
        } catch (error) {
            console.error('コイン付与エラー:', error);
        }
    },
};