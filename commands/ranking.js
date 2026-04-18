const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// MongoDBのデータ構造（スキーマ）を定義
// これを一度作っておけば、他のコマンドでも使い回せます
const DataSchema = new mongoose.Schema({
    key: { type: String, required: true, unique: true },
    value: { type: mongoose.Schema.Types.Mixed }
});
// 既にモデルがある場合はそれを使い、なければ作る
const DataModel = mongoose.models.Data || mongoose.model('Data', DataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('サーバー内の所持金ランキングを表示します'),

    async execute(interaction) {
        // 1. タイムアウト防止（DB取得に時間がかかる可能性があるため必須）
        await interaction.deferReply();

        const { client, guild } = interaction;

        try {
            // 2. データ取得（quickmongo v5 の全データ取得メソッドを確認）
            // 注意: QuickMongoに.fetchall()がない場合は .all() を試してください
            const allData = await mongo.all(); 
            const guildPrefix = `money_${guild.id}_`;
            
            let leaderboard = allData
                .filter(data => data.id.startsWith(guildPrefix))
                .map(data => ({
                    userId: data.id.replace(guildPrefix, ''),
                    balance: data.value
                }))
                .sort((a, b) => b.balance - a.balance);

            if (leaderboard.length === 0) {
                return await interaction.editReply('ランキングデータがありません。');
            }

            // 3. ページ作成用の関数
            const generateEmbed = async (page) => {
                const start = page * 10; // 25人だとEmbed制限(4096文字)に引っかかる可能性があるため10-15人が安全
                const end = start + 10;
                const currentItems = leaderboard.slice(start, end);

                let description = "";
                for (let i = 0; i < currentItems.length; i++) {
                    const rank = start + i + 1;
                    // fetch ではなく cache を優先し、なければ fetch する（高速化）
                    const user = client.users.cache.get(currentItems[i].userId) || await client.users.fetch(currentItems[i].userId).catch(() => null);
                    const userName = user ? user.username : "不明なユーザー";
                    
                    let rankText = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `**${rank}.**`;
                    description += `${rankText} ${userName} \`(${currentItems[i].balance.toLocaleString()}💰)\`\n`;
                }

                const totalPages = Math.ceil(leaderboard.length / 10);
                const userRank = leaderboard.findIndex(u => u.userId === interaction.user.id) + 1;

                return new EmbedBuilder()
                    .setTitle(`🏆 ${guild.name} 所持金ランキング`)
                    .setDescription(description || "データがありません。")
                    .setColor('Gold')
                    .setFooter({ text: `ページ ${page + 1} / ${totalPages} (あなたの順位: ${userRank > 0 ? userRank + '位' : '圏外'})` });
            };

            // 4. 初期表示
            let currentPage = 0;
            const embed = await generateEmbed(currentPage);
            
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev').setLabel('前へ').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('next').setLabel('次へ').setStyle(ButtonStyle.Primary).setDisabled(leaderboard.length <= 10)
            );

            const response = await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            // 5. ボタンコレクター
            const collector = response.createMessageComponentCollector({
                componentType: ComponentType.Button,
                time: 60000
            });

            collector.on('collect', async (i) => {
                if (i.user.id !== interaction.user.id) {
                    return i.reply({ content: '自分の操作画面ではありません。', flags: [MessageFlags.Ephemeral] });
                }

                if (i.customId === 'next') currentPage++;
                else if (i.customId === 'prev') currentPage--;

                const totalPages = Math.ceil(leaderboard.length / 10);
                const updateRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('prev').setLabel('前へ').setStyle(ButtonStyle.Primary).setDisabled(currentPage === 0),
                    new ButtonBuilder().setCustomId('next').setLabel('次へ').setStyle(ButtonStyle.Primary).setDisabled(currentPage >= totalPages - 1)
                );

                await i.update({
                    embeds: [await generateEmbed(currentPage)],
                    components: [updateRow]
                });
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => null);
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply('ランキングの読み込み中にエラーが発生しました。');
        }
    },
};