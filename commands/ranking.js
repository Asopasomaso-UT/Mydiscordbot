const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('サーバー内の所持金ランキングを表示します'),

    async execute(interaction) {
        const { client, guild } = interaction;

        // 1. データベースからすべてのデータを取得
        // quick.dbの全データから、このサーバーのmoneyに関連するものだけを抽出
        const allData = await client.db.all();
        
        // 2. このサーバーのデータだけをフィルタリングして整形
        // キーの形式が "money_サーバーID_ユーザーID" になっているので、それを目印にする
        const guildPrefix = `money_${guild.id}_`;
        
        let leaderboard = allData
            .filter(data => data.id.startsWith(guildPrefix))
            .map(data => {
                return {
                    userId: data.id.replace(guildPrefix, ''),
                    balance: data.value
                };
            });

        // 3. 所持金が多い順に並べ替え
        leaderboard.sort((a, b) => b.balance - a.balance);

        // 4. 上位10名だけを抽出
        const top10 = leaderboard.slice(0, 10);

        if (top10.length === 0) {
            return await interaction.reply('まだランキングに載るデータがありません。');
        }

        // 5. 表示用のテキストを作成
        let description = "";
        for (let i = 0; i < top10.length; i++) {
            const user = await client.users.fetch(top10[i].userId).catch(() => null);
            const userName = user ? user.username : "不明なユーザー";
            
            // 順位に応じた絵文字
            let rankEmoji = "";
            if (i === 0) rankEmoji = "🥇";
            else if (i === 1) rankEmoji = "🥈";
            else if (i === 2) rankEmoji = "🥉";
            else rankEmoji = `${i + 1}位.`;

            description += `${rankEmoji} **${userName}**: ${top10[i].balance.toLocaleString()} コイン\n`;
        }

        const embed = new EmbedBuilder()
            .setTitle(`🏆 ${guild.name} 所持金ランキング`)
            .setDescription(description)
            .setColor('Gold')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },
};