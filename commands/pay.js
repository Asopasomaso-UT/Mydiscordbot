const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// Mongoose スキーマ定義
const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('自分のコインを他のユーザーに送ります')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('送金先のユーザー')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('送る金額')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        // 1. 3秒ルール回避のため最初に応答を保留
        await interaction.deferReply();

        const { guild, user } = interaction;
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        // 自分自身には送れない
        if (targetUser.id === user.id) {
            return await interaction.editReply({ content: '自分にお金は送れません！' });
        }

        // Botには送れない
        if (targetUser.bot) {
            return await interaction.editReply({ content: 'Botにお金は送れません！' });
        }

        const senderKey = `money_${guild.id}_${user.id}`;
        const receiverKey = `money_${guild.id}_${targetUser.id}`;

        try {
            // MongoDB 接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // 2. 送信者の現在の所持金を確認
            const senderRecord = await DataModel.findOne({ id: senderKey });
            const senderBalance = senderRecord ? Number(senderRecord.value) || 0 : 0;

            // 所持金不足チェック
            if (senderBalance < amount) {
                return await interaction.editReply({ 
                    content: `コインが足りません！ (現在の所持金: ${senderBalance.toLocaleString()} コイン)` 
                });
            }

            // 3. 送金処理 (Mongoose版)
            // 送信者の残高を減らす
            const newSenderBalance = senderBalance - amount;
            await DataModel.findOneAndUpdate(
                { id: senderKey },
                { value: newSenderBalance },
                { upsert: true }
            );

            // 受信者の残高を増やす
            const receiverRecord = await DataModel.findOne({ id: receiverKey });
            const receiverBalance = receiverRecord ? Number(receiverRecord.value) || 0 : 0;
            const newReceiverBalance = receiverBalance + amount;
            await DataModel.findOneAndUpdate(
                { id: receiverKey },
                { value: newReceiverBalance },
                { upsert: true }
            );

            // 4. 結果の表示
            const embed = new EmbedBuilder()
                .setTitle('送金完了 💸')
                .setDescription(`${targetUser.username} に **${amount.toLocaleString()}** コイン送りました！`)
                .addFields(
                    { name: '送金元', value: `${user.username}`, inline: true },
                    { name: '送金先', value: `${targetUser.username}`, inline: true }
                )
                .setColor('Blue')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Pay Command Error:', error);
            await interaction.editReply({ content: '送金処理中にエラーが発生しました。' });
        }
    },
};