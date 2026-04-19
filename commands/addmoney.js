const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper'); // 単位対応用のヘルパーをインポート

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
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('付与する金額（制限なし。マイナスも可能）')
                .setRequired(true)
                // setMinValue / setMaxValue を削除して上限を撤廃
        ),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { guild } = interaction;
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const dbKey = `money_${guild.id}_${targetUser.id}`;

        try {
            // $inc を使い、1回の通信で「加算」と「結果取得」を同時に行う
            // 金額が大きい場合でも MongoDB の Number 精度で処理されます
            const record = await DataModel.findOneAndUpdate(
                { id: dbKey },
                { $inc: { value: amount } }, 
                { upsert: true, new: true }   
            );

            const newBalance = record.value || 0;

            // formatCoin または toLocaleString を使用して単位表示に対応
            const displayAmount = amount >= 0 ? `+${formatCoin(amount)}` : formatCoin(amount);

            const embed = new EmbedBuilder()
                .setTitle('💰 コイン付与完了')
                .setDescription(`${targetUser.username} に **${displayAmount}** 💰 を付与しました。`)
                .addFields({ 
                    name: '現在の残高', 
                    value: `**${formatCoin(newBalance)}** 💰` 
                })
                .setColor('Green')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Addmoney Error:', error);
            await interaction.editReply({ content: 'コインの付与処理中にエラーが発生しました。' });
        }
    },
};