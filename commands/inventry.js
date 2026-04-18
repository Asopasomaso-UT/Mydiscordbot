const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// 1. スキーマ定義（QuickMongoの構造を完全に再現）
const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' }); // ← これで過去のデータが見えるようになります

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventry')
        .setDescription('自分の持ち物を確認します'),

    // ここに async が必須です！
    async execute(interaction) {
        // タイムアウト（3秒ルール）回避
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // データベース接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            const targetKey = `inventory_${interaction.user.id}`;
            // await は async 関数の中でのみ使えます
            const result = await DataModel.findOne({ id: targetKey });

            if (!result || !result.value) {
                return await interaction.editReply('持ち物は何もありません。');
            }

            const inventory = result.value;
            const embed = new EmbedBuilder()
                .setTitle(`🎒 ${interaction.user.username} のインベントリ`)
                .setColor(0x00AE86);

            let itemList = "";
            if (Array.isArray(inventory)) {
                itemList = inventory.join('\n');
            } else if (typeof inventory === 'object') {
                itemList = Object.entries(inventory)
                    .map(([name, count]) => `・**${name}**: ${count}個`)
                    .join('\n');
            } else {
                itemList = String(inventory);
            }

            embed.setDescription(itemList || "中身が空です。");
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Mongoose Error:', error);
            await interaction.editReply('データの読み込み中にエラーが発生しました。');
        }
    },
};