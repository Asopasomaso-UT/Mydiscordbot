const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { ITEM_MASTER } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder().setName('inventry').setDescription('持ち物を確認します'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        const result = await DataModel.findOne({ id: `pet_data_${interaction.guild.id}_${interaction.user.id}` });
        const inventory = result?.value?.inventory || {};

        const itemList = Object.entries(inventory)
            .filter(([_, count]) => count > 0)
            .map(([key, count]) => `・**${ITEM_MASTER[key]?.name || key}**: ${count}個`)
            .join('\n');

        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${interaction.user.username} のインベントリ`)
            .setDescription(itemList || "アイテムを何も持っていません。")
            .setColor(0x00AE86);
            
        await interaction.editReply({ embeds: [embed] });
    },
};