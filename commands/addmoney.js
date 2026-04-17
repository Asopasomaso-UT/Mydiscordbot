const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('【管理者用】指定したユーザーにコインを付与します')
        // 管理者権限（メンバー管理権限など）を持つ人だけが使えるように制限
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('コインを付与するユーザー')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('付与する金額（マイナスも可能）')
                .setRequired(true)
                .setMinValue(-1000000) // 必要に応じて範囲を指定
                .setMaxValue(1000000)
        ),

    async execute(interaction) {
        const { client, guild } = interaction;
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        
        const dbKey = `money_${guild.id}_${targetUser.id}`;

        // 指定された金額をデータベースに追加
        const newBalance = await client.db.add(dbKey, amount);

        const embed = new EmbedBuilder()
            .setTitle('コイン付与完了')
            .setDescription(`${targetUser.username} に **${amount.toLocaleString()}** コインを付与しました。`)
            .addFields({ name: '現在の残高', value: `**${newBalance.toLocaleString()}** コイン` })
            .setColor('Green')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};