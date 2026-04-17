const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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
                .setMinValue(1)), // 1コイン未満は送れないようにする

    async execute(interaction) {
        const { client, guild, user } = interaction;
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');

        // 自分自身には送れないようにする
        if (targetUser.id === user.id) {
            return await interaction.reply({ content: '自分にお金は送れません！', ephemeral: true });
        }

        // Botには送れないようにする（必要に応じて）
        if (targetUser.bot) {
            return await interaction.reply({ content: 'Botにお金は送れません！', ephemeral: true });
        }

        const senderKey = `money_${guild.id}_${user.id}`;
        const receiverKey = `money_${guild.id}_${targetUser.id}`;

        // 1. 送信者の現在の所持金を確認
        const senderBalance = await client.db.get(senderKey) || 0;

        // 所持金が足りているかチェック
        if (senderBalance < amount) {
            return await interaction.reply({ 
                content: `コインが足りません！ (現在の所持金: ${senderBalance.toLocaleString()} コイン)`, 
                ephemeral: true 
            });
        }

        // 2. 送金処理（自分の分をマイナスし、相手の分をプラスする）
        await client.db.sub(senderKey, amount); // 引き算
        await client.db.add(receiverKey, amount); // 足し算

        const embed = new EmbedBuilder()
            .setTitle('送金完了 💸')
            .setDescription(`${targetUser.username} に **${amount.toLocaleString()}** コイン送りました！`)
            .addFields(
                { name: '送金元', value: `${user.username}`, inline: true },
                { name: '送金先', value: `${targetUser.username}`, inline: true }
            )
            .setColor('Blue')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};