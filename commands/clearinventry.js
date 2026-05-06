const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('clear-inventory')
        .setDescription('【管理者専用】インベントリ内の全てのアイテムを削除します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator), // 管理者のみ実行可能

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const targetKey = `pet_data_${guildId}_${userId}`;

        try {
            // inventory フィールドを空のオブジェクトに更新
            const result = await DataModel.findOneAndUpdate(
                { id: targetKey },
                { $set: { 'value.inventory': {} } },
                { new: true }
            );

            if (!result) {
                return interaction.reply({ content: 'データが見つかりませんでした。', ephemeral: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('🗑️ インベントリ消去')
                .setDescription('あなたのインベントリは完全に空になりました。')
                .setColor('Red')
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Clear Inventory Error:', error);
            await interaction.reply({ content: '消去中にエラーが発生しました。', ephemeral: true });
        }
    },
};