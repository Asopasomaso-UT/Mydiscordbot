const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { PET_MASTER } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets-inventry')
        .setDescription('所持ペットの確認と装備の管理を行います'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const invKey = `pet_data_${guildId}_${userId}`;

        const userData = await DataModel.findOne({ id: invKey });
        const pets = userData?.value?.pets || [];
        const equippedIds = userData?.value?.equippedPetIds || [];

        if (pets.length === 0) {
            return interaction.reply('ペットをまだ持っていません。卵を孵化させてみましょう！');
        }

        // 1. 装備中ペットの情報を取得
        const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
        const totalMult = equippedPets.reduce((sum, p) => sum + (p.multiplier - 1), 1);

        const embed = new EmbedBuilder()
            .setTitle('🐾 ペットインベントリ')
            .setColor('Blue')
            .setDescription(`**現在の合計倍率: x${totalMult.toLocaleString()}**\n(装備枠: ${equippedIds.length} / 3)`)
            .addFields({
                name: '🛡️ 装備中のペット',
                value: equippedPets.map(p => `✅ **${p.name}** [${p.rarity}] (x${p.multiplier})`).join('\n') || 'なし'
            });

        // 2. セレクトメニューで装備の切り替え
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('pet_select')
            .setPlaceholder('装備を切り替えるペットを選択（最大3体）')
            .setMaxValues(Math.min(pets.length, 3))
            .setMinValues(0);

        // ペットが多すぎる場合(25体以上)はスライスが必要
        pets.slice(0, 25).forEach(p => {
            selectMenu.addOptions({
                label: p.name,
                description: `レアリティ: ${p.rarity} | 倍率: x${p.multiplier}`,
                value: p.petId,
                default: equippedIds.includes(p.petId)
            });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return;

            const selectedIds = i.values; // 選択されたIDの配列

            await DataModel.findOneAndUpdate(
                { id: invKey },
                { 'value.equippedPetIds': selectedIds }
            );

            await i.reply({ content: `✅ 装備を更新しました！ (選択数: ${selectedIds.length}/3)`, ephemeral: true });
            
            // 元のメッセージを更新
            const updatedEmbed = EmbedBuilder.from(embed)
                .setDescription(`**現在の合計倍率: x${(pets.filter(p => selectedIds.includes(p.petId)).reduce((s, p) => s + (p.multiplier - 1), 1)).toLocaleString()}**\n(装備枠: ${selectedIds.length} / 3)`)
                .setFields({
                    name: '🛡️ 装備中のペット',
                    value: pets.filter(p => selectedIds.includes(p.petId)).map(p => `✅ **${p.name}** [${p.rarity}] (x${p.multiplier})`).join('\n') || 'なし'
                });
            await interaction.editReply({ embeds: [updatedEmbed] });
        });
    }
};