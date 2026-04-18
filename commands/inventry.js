const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventry')
        .setDescription('自分の持ち物を確認します'),

    async execute(interaction) {
        // 1. 応答を保留（Ephemeralに設定）
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // 【重要】ショップ等の保存キーと統一する
            // 以前のコードが `items_サーバーID_ユーザーID` ならそれに合わせます
            const targetKey = `items_${interaction.guild.id}_${interaction.user.id}`;
            
            const result = await DataModel.findOne({ id: targetKey });

            if (!result || !result.value) {
                return await interaction.editReply('持ち物は何もありません。');
            }

            const inventory = result.value;
            const embed = new EmbedBuilder()
                .setTitle(`🎒 ${interaction.user.username} のインベントリ`)
                .setColor(0x00AE86)
                .setTimestamp();

            let itemList = "";
            if (Array.isArray(inventory)) {
                // 重複をカウントして表示する（例: やくそう x2）
                const counts = {};
                inventory.forEach(item => counts[item] = (counts[item] || 0) + 1);
                itemList = Object.entries(counts)
                    .map(([name, count]) => `・**${name}** ${count > 1 ? `x${count}` : ''}`)
                    .join('\n');
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
            console.error('Mongoose Error (Inventory):', error);
            // すでに deferReply しているので必ず editReply を使う
            await interaction.editReply('データの読み込み中にエラーが発生しました。');
        }
    },
};