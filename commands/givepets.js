const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const crypto = require('crypto'); // ユニークID生成用

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('givepet')
        .setDescription('【管理者用】指定したユーザーにペットを付与します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('ペットを付与するユーザー')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('name')
                .setDescription('ペットの名前')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('rarity')
                .setDescription('レア度 (例: 神, 伝説, 一般)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('enchant')
                .setDescription('付与するエンチャント名 (なしの場合は未入力)')
                .addChoices(
                    { name: '💰 Coin Boost', value: 'Coin Boost' },
                    { name: '🍀 Luck Boost', value: 'Luck Boost' },
                    { name: '🔥 XP Boost', value: 'XP Boost' }
                )
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetUser = interaction.options.getUser('target');
        const petName = interaction.options.getString('name');
        const rarity = interaction.options.getString('rarity');
        const enchantType = interaction.options.getString('enchant');

        const guildId = interaction.guild.id;
        const petKey = `pet_data_${guildId}_${targetUser.id}`;

        try {
            // 1. 新しいペットオブジェクトの作成
            const newPet = {
                petId: `pet_${crypto.randomBytes(4).toString('hex')}_${Date.now()}`, // 重複しないID
                name: petName,
                rarity: rarity,
                level: 1,
                xp: 0,
                // エンチャントが選択されている場合のみ設定
                enchant: enchantType ? {
                    type: enchantType,
                    level: 1
                } : null
            };

            // 2. DB更新 ($push を使って既存の pets 配列に追加)
            // upsert: true でデータがないユーザーでも作成されるようにする
            await DataModel.findOneAndUpdate(
                { id: petKey },
                { 
                    $push: { 'value.pets': newPet }
                },
                { upsert: true }
            );

            // 3. 完了通知
            const embed = new EmbedBuilder()
                .setTitle('🎁 ペット付与完了')
                .setDescription(`${targetUser} に新しいペットを付与しました。`)
                .addFields(
                    { name: '名前', value: `**${newPet.name}**`, inline: true },
                    { name: 'レア度', value: `\`${newPet.rarity}\``, inline: true },
                    { name: 'エンチャント', value: enchantType ? `\`${enchantType} Lv.1\`` : 'なし', inline: true }
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