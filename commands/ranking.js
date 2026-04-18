const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('サーバー内の所持金ランキングを表示します'),

    async execute(interaction) {
        const { client, guild } = interaction;

        // 1. データ取得と並べ替え
        const allData = await client.db.all();
        const guildPrefix = `money_${guild.id}_`;
        
        let leaderboard = allData
            .filter(data => data.id.startsWith(guildPrefix))
            .map(data => ({
                userId: data.id.replace(guildPrefix, ''),
                balance: data.value
            }))
            .sort((a, b) => b.balance - a.balance);

        if (leaderboard.length === 0) return interaction.reply('データがありません。');

        // 2. ページ作成用の関数
        const generateEmbed = async (page) => {
            const start = page * 25;
            const end = start + 25;
            const currentItems = leaderboard.slice(start, end);

            let description = "";
            for (let i = 0; i < currentItems.length; i++) {
                const rank = start + i + 1;
                const user = await client.users.fetch(currentItems[i].userId).catch(() => null);
                const userName = user ? user.username : "不明なユーザー";
                
                let rankText = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;
                description += `${rankText} ${userName} \`(${currentItems[i].balance.toLocaleString()}💰)\`\n`;
            }

            return new EmbedBuilder()
                .setTitle(`🏆 ${guild.name} 所持金ランキング`)
                .setDescription(description || "このページにはデータがありません。")
                .setColor('Gold')
                .setFooter({ text: `ページ ${page + 1} / 2 (あなたの順位: ${leaderboard.findIndex(u => u.userId === interaction.user.id) + 1}位)` });
        };

        // 3. ボタンの作成
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('prev').setLabel('前の25人').setStyle(ButtonStyle.Primary).setDisabled(true),
            new ButtonBuilder().setCustomId('next').setLabel('次の25人').setStyle(ButtonStyle.Primary).setDisabled(leaderboard.length <= 25)
        );

        // 4. 初期表示
        let currentPage = 0;
        const response = await interaction.reply({
            embeds: [await generateEmbed(currentPage)],
            components: [row]
        });

        // 5. ボタン入力を受け付ける（コレクター）
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 60000 // 1分間受け付ける
        });

        collector.on('collect', async (i) => {
            // コマンドを打った本人以外は操作できないようにする
            if (i.user.id !== interaction.user.id) return i.reply({ content: '自分のランキング画面で操作してください。', ephemeral: true });

            if (i.customId === 'next') currentPage++;
            else if (i.customId === 'prev') currentPage--;

            // ボタンの有効・無効状態を更新
            const updateRow = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev').setLabel('前の25人').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
                new ButtonBuilder().setCustomId('next').setLabel('次の25人').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 1 || leaderboard.length <= (currentPage + 1) * 25)
            );

            await i.update({
                embeds: [await generateEmbed(currentPage)],
                components: [updateRow]
            });
        });

        collector.on('end', () => {
            // 時間切れになったらボタンを消す
            interaction.editReply({ components: [] }).catch(() => null);
        });
    },
};