const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// MongoDBのデータ構造（スキーマ）を定義
// これを一度作っておけば、他のコマンドでも使い回せます
const DataSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed }
});
// 既にモデルがある場合はそれを使い、なければ作る
const DataModel = mongoose.models.Data || mongoose.model('Data', DataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventry')
        .setDescription('自分の持ち物を確認します'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // データベースに接続（まだの場合のみ）
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // QuickMongoの「inventory_ID」というキーに合わせて検索
            const targetKey = `inventory_${interaction.user.id}`;
            const data = await DataModel.findOne({ key: targetKey });

            if (!data || !data.value) {
                return await interaction.editReply('持ち物は何もありません。');
            }

            const inventory = data.value;

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
            console.error(error);
            await interaction.editReply('エラーが発生しました。');
        }
    },
};