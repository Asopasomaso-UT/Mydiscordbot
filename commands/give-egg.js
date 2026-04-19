const { SlashCommandBuilder, PermissionFlagsBits, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { EGG_CONFIG } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give-egg')
        .setDescription('【管理者用】指定したユーザーに卵を付与します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 管理者のみ実行可能
        .addUserOption(option => 
            option.setName('target')
                .setDescription('付与する対象のユーザー')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('egg_type')
                .setDescription('付与する卵の種類')
                .setRequired(true)
                .addChoices(
                    // EGG_CONFIGから自動的に選択肢を作成
                    ...Object.keys(EGG_CONFIG).map(key => ({
                        name: EGG_CONFIG[key].name,
                        value: key
                    }))
                ))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('付与する個数')
                .setRequired(false)
                .setMinValue(1)),

    async execute(interaction) {
        const targetUser = interaction.options.getUser('target');
        const eggKey = interaction.options.getString('egg_type');
        const amount = interaction.options.getInteger('amount') || 1; // 指定がなければ1個
        const guildId = interaction.guild.id;

        const invKey = `pet_data_${guildId}_${targetUser.id}`;
        const config = EGG_CONFIG[eggKey];

        try {
            // インベントリを更新（$inc を使って既存の数にプラスする）
            await DataModel.findOneAndUpdate(
                { id: invKey },
                { $inc: { [`value.inventory.${eggKey}`]: amount } },
                { upsert: true }
            );

            const embed = new EmbedBuilder()
                .setTitle('🎁 卵の付与（管理者操作）')
                .setDescription([
                    `対象ユーザー: ${targetUser}`,
                    `付与した卵: **${config.name}**`,
                    `個数: **${amount}** 個`,
                    `━━━━━━━━━━━━━━`,
                    `操作者: ${interaction.user.username}`
                ].join('\n'))
                .setColor('Gold')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // 付与された本人にDMでお知らせ（任意）
            await targetUser.send(`🎁 管理者から **${config.name}** が **${amount}個** 届きました！`).catch(() => {
                console.log(`${targetUser.tag} にDMを送れませんでした。`);
            });

        } catch (error) {
            console.error('Give-Egg Error:', error);
            await interaction.reply({ content: '付与処理中にエラーが発生しました。', ephemeral: true });
        }
    },
};