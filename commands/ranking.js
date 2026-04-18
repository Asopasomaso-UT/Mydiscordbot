const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// 1. スキーマ定義
const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('サーバー内の所持金ランキングを表示します'),

    async execute(interaction) {
        // 即座に保留応答
        await interaction.deferReply();

        const { client, guild } = interaction;
        
        // デバッグ用ログ 1
        console.log("=== Ranking Debug Start ===");
        console.log(`Guild ID: ${guild.id}`);

        try {
            // サーバーIDが含まれるデータをすべて取得
            // 前後のアンダースコアの有無に左右されないよう部分一致で検索
            const allData = await DataModel.find({ id: new RegExp(guild.id) });

            // デバッグ用ログ 2
            console.log(`DBから取得した全件数: ${allData.length}`);
            if (allData.length > 0) {
                console.log("DBデータの最初の1件:", JSON.stringify(allData[0], null, 2));
            }

            // データの整形
            let leaderboard = allData
                .map(data => {
                    // id (例: "money_12345_67890") からユーザーIDを抽出
                    const parts = data.id.split('_');
                    const userId = parts[parts.length - 1]; 
                    return {
                        userId: userId,
                        balance: Number(data.value) || 0,
                        originalId: data.id // デバッグ用
                    };
                })
                .filter(item => item.balance > 0)
                .sort((a, b) => b.balance - a.balance);

            // デバッグ用ログ 3
            console.log(`整形後の有効なランキング件数: ${leaderboard.length}`);

            if (leaderboard.length === 0) {
                console.log("❌ 表示できるデータがありませんでした。");
                console.log("=== Ranking Debug End ===");
                return await interaction.editReply('ランキングデータがありません。');
            }

            // 3. ページ生成用関数
            const generateEmbed = async (page) => {
                const start = page * 10;
                const end = start + 10;
                const currentItems = leaderboard.slice(start, end);

                let description = "";
                for (let i = 0; i < currentItems.length; i++) {
                    const rank = start + i + 1;
                    const user = client.users.cache.get(currentItems[i].userId) || 
                                 await client.users.fetch(currentItems[i].userId).catch(() => null);
                    
                    const userName = user ? user.username : `不明(${currentItems[i].userId})`;
                    let rankText = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;
                    
                    description += `${rankText} ${userName} \`(${currentItems[i].balance.toLocaleString()} 💰)\`\n`;
                }

                const totalPages = Math.ceil(leaderboard.length / 10);
                const userRank = leaderboard.findIndex(u => u.userId === interaction.user.id) + 1;

                return new EmbedBuilder()
                    .setTitle(`🏆 ${guild.name} 所持金ランキング`)
                    .setDescription(description || "データが空です。")
                    .setColor('Gold')
                    .setFooter({ text: `ページ ${page + 1} / ${totalPages} | あなたの順位: ${userRank > 0 ? userRank + '位' : '圏外'}` })
                    .setTimestamp();
            };

            // 4. 初期表示
            let currentPage = 0;
            const embed = await generateEmbed(currentPage);
            
            const getRow = (page) => {
                const totalPages = Math.ceil(leaderboard.length / 10);
                return new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prev').setLabel('前へ').setStyle(ButtonStyle.Primary).setDisabled(page === 0),
                    new ButtonBuilder().setCustomId('next').setLabel('次へ').setStyle(ButtonStyle.Primary).setDisabled(page >= totalPages - 1)
                );
            };

            await interaction.editReply({
                embeds: [embed],
                components: [getRow(currentPage)]
            });

            console.log("✅ ランキングを表示しました。");
            console.log("=== Ranking Debug End ===");

            // ボタン操作待機
            const response = await interaction.fetchReply();
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '他人の画面は操作できません。', flags: [MessageFlags.Ephemeral] });
                }
                if (i.customId === 'next') currentPage++;
                else if (i.customId === 'prev') currentPage--;

                await i.update({
                    embeds: [await generateEmbed(currentPage)],
                    components: [getRow(currentPage)]
                });
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => null);
            });

        } catch (error) {
            console.error('❌ Ranking Error:', error);
            await interaction.editReply('ランキングの読み込み中にエラーが発生しました。');
        }
    },
};