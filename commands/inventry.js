const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventry')
        .setDescription('自分の持ち物（アイテム・シールド）を確認します'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;
            
            // 全てのペット・アイテム関連の共通キー
            const targetKey = `pet_data_${guildId}_${userId}`;
            const result = await DataModel.findOne({ id: targetKey });

            // 階層構造: value.inventory の中身を取得
            const inventory = result?.value?.inventory || {};

            const embed = new EmbedBuilder()
                .setTitle(`🎒 ${interaction.user.username} のインベントリ`)
                .setColor(0x00AE86)
                .setTimestamp();

            // 表示名の変換設定
            const itemNames = {
                'rare_candy': '🍬 不思議なあめ',
                'enchant_shield': '🛡️ エンチャントシールド'
            };

            const itemList = Object.entries(inventory)
                .filter(([_, count]) => count > 0)
                .map(([key, count]) => {
                    const displayName = itemNames[key] || key;
                    return `・**${displayName}**: ${count}個`;
                })
                .join('\n');

            embed.setDescription(itemList || "アイテムを何も持っていません。");
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Inventory Error:', error);
            await interaction.editReply('データの読み込み中にエラーが発生しました。');
        }
    },
};