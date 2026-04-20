const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER } = require('../utils/Pet-data'); // マスタデータをインポート

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give-pet')
        .setDescription('【管理者用】指定したユーザーにペットを直接付与します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('付与するユーザー')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('pet_name')
                .setDescription('付与するペットを選択してください')
                .setRequired(true)
                // PET_MASTERから名前を抽出して選択肢にする (最大25個まで)
                .addChoices(
                    ...Object.keys(PET_MASTER).slice(0, 100).map(name => ({ name: name, value: name }))
                )
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('付与する個数')
                .setMinValue(1)
                .setMaxValue(10) // 一度の付与上限を10匹に制限（負荷防止）
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetUser = interaction.options.getUser('target');
        const petName = interaction.options.getString('pet_name');
        const amount = interaction.options.getInteger('amount') || 1;

        const petInfo = PET_MASTER[petName];
        if (!petInfo) return interaction.editReply('指定されたペットがマスタデータに見つかりません。');

        const guildId = interaction.guild.id;
        const petKey = `pet_data_${guildId}_${targetUser.id}`;

        try {
            const newPets = [];

            // 指定された個数分、新しいIDを持ったペットを生成
            for (let i = 0; i < amount; i++) {
                newPets.push({
                    petId: uuidv4(),
                    name: petName,
                    rarity: petInfo.rarity,
                    multiplier: petInfo.multiplier,
                    level: 1,
                    xp: 0,
                    obtainedAt: Date.now()
                });
            }

            // DB更新 ($push と $each を使って配列に一括追加)
            await DataModel.findOneAndUpdate(
                { id: petKey },
                { 
                    $push: { 'value.pets': { $each: newPets } }
                },
                { upsert: true }
            );

            const embed = new EmbedBuilder()
                .setTitle('🎁 ペット直接付与完了')
                .setDescription(`${targetUser} にペットを付与しました。`)
                .addFields(
                    { name: 'ペット名', value: `**${petName}**`, inline: true },
                    { name: '個数', value: `**${amount}** 匹`, inline: true },
                    { name: 'レアリティ', value: `\`${petInfo.rarity}\``, inline: true }
                )
                .setColor('Gold')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Givepet Error:', error);
            await interaction.editReply('ペットの付与中にエラーが発生しました。');
        }
    },
};