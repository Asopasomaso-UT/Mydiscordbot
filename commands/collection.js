const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { PET_MASTER } = require('../utils/Pet-data');

// レアリティごとの色設定
const RARITY_COLORS = {
    'Common': 0xAAAAAA, 'Uncommon': 0x32CD32, 'Rare': 0x1E90FF, 
    'Epic': 0x9370DB, 'Legendary': 0xFFD700, 'Mythic': 0xFF4500,
    'Unique': 0x00FFFF, 'Artifact': 0xFF69B4, 'Secret': 0x000000
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('ペット図鑑を表示します')
        .addStringOption(option => 
            option.setName('rarity')
                .setDescription('表示するレアリティを選択')
                .addChoices(
                    { name: 'Common', value: 'Common' },
                    { name: 'Uncommon', value: 'Uncommon' },
                    { name: 'Rare', value: 'Rare' },
                    { name: 'Epic', value: 'Epic' },
                    { name: 'Legendary', value: 'Legendary' },
                    { name: 'Mythic', value: 'Mythic' },
                    { name: 'Unique', value: 'Unique' },
                    { name: 'Artifact', value: 'Artifact' },
                    { name: 'Secret', value: 'Secret' }
                )),

    async execute(interaction) {
        const rarity = interaction.options.getString('rarity') || 'Common';
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // ユーザーの発見済みデータを取得
        const userData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
        const discovered = userData?.value?.discovered || [];

        // PET_MASTERから該当レアリティを抽出
        const petsInRarity = Object.entries(PET_MASTER)
            .filter(([_, data]) => data.rarity === rarity);

        const totalInRarity = petsInRarity.length;
        const discoveredInRarity = petsInRarity.filter(([name, _]) => discovered.includes(name)).length;

        const embed = new EmbedBuilder()
            .setTitle(`📖 Pet Collection: ${rarity}`)
            .setColor(RARITY_COLORS[rarity] || 0xFFFFFF)
            .setDescription(`進捗: **${discoveredInRarity} / ${totalInRarity}** (${Math.floor((discoveredInRarity/totalInRarity)*100) || 0}%)`)
            .setTimestamp();

        // リスト作成
        const list = petsInRarity.map(([name, data]) => {
            const isFound = discovered.includes(name);
            return isFound 
                ? `✅ **${name}** (x${data.multiplier})` 
                : `🔒 **???** (未発見)`;
        }).join('\n');

        embed.addFields({ name: 'ペット一覧', value: list || 'データがありません' });

        await interaction.reply({ embeds: [embed] });
    }
};