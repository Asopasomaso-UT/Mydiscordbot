const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { QuickMongo } = require('quickmongo');
const mongo = new QuickMongo(process.env.MONGO_URI);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('所持コインを確認します')
        // ユーザーを選択できるオプションを追加
        .addUserOption(option => 
            option.setName('target')
                .setDescription('確認したいユーザーを選択（空欄なら自分）')
                .setRequired(false) // 必須にしないことで、自分の確認も楽になる
        ),

    async execute(interaction) {
        
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const { client, guild } = interaction;

        // 指定されたユーザーを取得。いなければコマンドを打った本人にする
        const targetUser = interaction.options.getUser('target') || interaction.user;
        
        // データベース用のキー
        const dbKey = `money_${guild.id}_${targetUser.id}`;

        // データの取得
        const balance = await client.db.get(dbKey) || 0;

        const embed = new EmbedBuilder()
            .setTitle(`${targetUser.username} のお財布`)
            .setDescription(`現在の所持金: **${balance.toLocaleString()}** コイン 💰`)
            .setColor(targetUser.id === interaction.user.id ? 'Gold' : 'Blue') // 自分なら金、人なら青
            .setThumbnail(targetUser.displayAvatarURL())
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};