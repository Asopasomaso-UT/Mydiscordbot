const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// Mongoose スキーマ定義
const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

/**
 * 文字列（10k, 1m等）を数値に変換する関数
 */
function parseAmount(str) {
    if (typeof str !== 'string') return NaN;
    const units = {
        'k': 1000,
        'm': 1000000,
        'b': 1000000000,
        't': 1000000000000
    };
    const match = str.toLowerCase().match(/^(\d+(\.\d+)?)([kmbt])?$/);
    if (!match) return parseFloat(str); // 単位がない場合は数値としてパース
    
    const value = parseFloat(match[1]);
    const unit = match[3];
    return unit ? Math.floor(value * units[unit]) : Math.floor(value);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pay')
        .setDescription('自分のコインを他のユーザーに送ります')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('送金先のユーザー')
                .setRequired(true))
        .addStringOption(option => // IntegerからStringに変更（kやmを入力するため）
            option.setName('amount')
                .setDescription('送る金額 (例: 10k, 5.5m, 1000000)')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const { guild, user } = interaction;
        const targetUser = interaction.options.getUser('target');
        const amountInput = interaction.options.getString('amount');

        // 数値に変換
        const amount = parseAmount(amountInput);

        // --- バリデーション ---
        if (isNaN(amount) || amount <= 0) {
            return await interaction.editReply({ content: '正しい金額を入力してください。' });
        }

        if (targetUser.id === user.id) {
            return await interaction.editReply({ content: '自分にお金は送れません！' });
        }

        if (targetUser.bot) {
            return await interaction.editReply({ content: 'Botにお金は送れません！' });
        }

        const senderKey = `money_${guild.id}_${user.id}`;
        const receiverKey = `money_${guild.id}_${targetUser.id}`;

        try {
            // 送信者の現在の所持金を確認
            const senderRecord = await DataModel.findOne({ id: senderKey });
            const senderBalance = senderRecord ? Number(senderRecord.value) || 0 : 0;

            // 所持金不足チェック
            if (senderBalance < amount) {
                return await interaction.editReply({ 
                    content: `コインが足りません！\n現在の所持金: **${senderBalance.toLocaleString()}** コイン\n入力された金額: **${amount.toLocaleString()}**` 
                });
            }

            // --- 送金処理 ---
            // 送信者の残高を減らす
            await DataModel.findOneAndUpdate(
                { id: senderKey },
                { $inc: { value: -amount } }, // 直接減算
                { upsert: true }
            );

            // 受信者の残高を増やす
            await DataModel.findOneAndUpdate(
                { id: receiverKey },
                { $inc: { value: amount } }, // 直接加算
                { upsert: true }
            );

            // 結果の表示
            const embed = new EmbedBuilder()
                .setTitle('送金完了 💸')
                .setDescription([
                    `**${targetUser.username}** に送金しました！`,
                    `━━━━━━━━━━━━━━`,
                    `送金額: **${amount.toLocaleString()}** コイン`,
                    `━━━━━━━━━━━━━━`,
                    `送金元: ${user.username}`,
                    `送金先: ${targetUser.username}`
                ].join('\n'))
                .setColor('Blue')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Pay Command Error:', error);
            await interaction.editReply({ content: '送金処理中にエラーが発生しました。' });
        }
    },
};