const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER } = require('../utils/Pet-data');

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
                .setDescription('ペット名を入力して検索してください')
                .setRequired(true)
                .setAutocomplete(true) // オートコンプリートを有効化
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('付与する個数')
                .setMinValue(1)
                .setMaxValue(10)
        )
        .addIntegerOption(option =>
            option.setName('evo_level')
                .setDescription('進化段階 (0:Normal, 1:Golden, 2:Shiny, 3:Neon)')
                .setMinValue(0)
                .setMaxValue(3)
        ),

    /**
     * オートコンプリートの処理
     */
    async autocomplete(interaction) {
        const focusedValue = interaction.options.getFocused();
        const choices = Object.keys(PET_MASTER);
        
        // ユーザーが入力した文字でフィルタリング
        const filtered = choices.filter(choice => 
            choice.toLowerCase().includes(focusedValue.toLowerCase())
        );

        // Discordの制限により25個までしか返せないので slice(0, 25)
        await interaction.respond(
            filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
        );
    },

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetUser = interaction.options.getUser('target');
        const petName = interaction.options.getString('pet_name');
        const amount = interaction.options.getInteger('amount') || 1;
        const evoLevel = interaction.options.getInteger('evo_level') || 0;

        const petInfo = PET_MASTER[petName];
        if (!petInfo) return interaction.editReply(`エラー: 「${petName}」はマスタデータに存在しません。名前を確認してください。`);

        const guildId = interaction.guild.id;
        const petKey = `pet_data_${guildId}_${targetUser.id}`;

        const evoNames = ['', 'Golden', 'Shiny', 'Neon'];
        const evoPrefix = evoNames[evoLevel] ? `[${evoNames[evoLevel]}] ` : '';

        try {
            const newPets = [];
            for (let i = 0; i < amount; i++) {
                newPets.push({
                    petId: uuidv4(),
                    name: petName,
                    rarity: petInfo.rarity,
                    multiplier: petInfo.multiplier,
                    evoLevel: evoLevel,
                    enchant: null,
                    obtainedAt: Date.now()
                });
            }

            await DataModel.findOneAndUpdate(
                { id: petKey },
                { $push: { 'value.pets': { $each: newPets } } },
                { upsert: true, returnDocument: 'after' }
            );

            const embed = new EmbedBuilder()
                .setTitle('🎁 ペット直接付与完了')
                .setDescription(`${targetUser} にペットを付与しました。`)
                .addFields(
                    { name: 'ペット名', value: `**${evoPrefix}${petName}**`, inline: true },
                    { name: '個数', value: `**${amount}** 匹`, inline: true },
                    { name: 'レアリティ', value: `\`${petInfo.rarity}\``, inline: true },
                    { name: '進化段階', value: evoNames[evoLevel] || 'Normal', inline: true }
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