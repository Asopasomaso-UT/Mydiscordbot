const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('【管理者用】指定したユーザーにコインを付与します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('コインを付与するユーザー')
                .setRequired(true)
        )
        .addStringOption(option => // 文字列入力に変更
            option.setName('amount')
                .setDescription('金額 (例: 100, 10k, 1M, 1B, -50k)')
                .setRequired(true)
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const targetUser = interaction.options.getUser('target');
        const amountStr = interaction.options.getString('amount').toLowerCase().replace(/,/g, '');
        
        // --- 単位変換ロジック ---
        const parseAmount = (str) => {
            const units = {
                'k': 1000,
                'm': 1000000,
                'b': 1000000000,
                't': 1000000000000
            };
            
            // 正規表現で数字部分と単位部分を分離
            const match = str.match(/^([+-]?\d+(?:\.\d+)?)([kmbt]?)$/);
            if (!match) return null;

            const value = parseFloat(match[1]);
            const unit = match[2];

            return unit ? Math.floor(value * units[unit]) : Math.floor(value);
        };

        const amount = parseAmount(amountStr);

        // 無効な入力のチェック
        if (amount === null || isNaN(amount)) {
            return await interaction.editReply('❌ 無効な金額形式です。数値または `10k`, `1.5M` のように入力してください。');
        }

        const dbKey = `money_${interaction.guild.id}_${targetUser.id}`;

        try {
            const record = await DataModel.findOneAndUpdate(
                { id: dbKey },
                { $inc: { value: amount } },
                { upsert: true, new: true }
            );

            const newBalance = record.value || 0;
            const displayAmount = amount >= 0 ? `+${formatCoin(amount)}` : formatCoin(amount);

            const embed = new EmbedBuilder()
                .setTitle('💰 コイン付与完了')
                .setDescription(`${targetUser.username} に **${displayAmount}** 💰 を付与しました。`)
                .addFields({ name: '現在の残高', value: `**${formatCoin(newBalance)}** 💰` })
                .setColor('Green')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Addmoney Error:', error);
            await interaction.editReply('コインの付与中にエラーが発生しました。');
        }
    },
};