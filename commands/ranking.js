const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');

const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('累計獲得賞金ランキング（TOP50）を表示します'),

    async execute(interaction) {
        // 1. サーバー内の累計獲得データをすべて取得
        const allData = await DataModel.find({
            id: { $regex: `^total_earned_${interaction.guild.id}_` }
        });

        // 2. データを整形して降順ソート、上位50名を取得
        const sortedData = allData
            .map(item => ({
                userId: item.id.split('_')[3],
                total: item.value || 0
            }))
            .filter(item => item.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 50);

        if (sortedData.length === 0) {
            return interaction.reply('まだランキングデータがありません。');
        }

        // 3. 25名ずつのページを作成する関数
        const createEmbed = async (page) => {
            const start = page * 25;
            const end = start + 25;
            const currentData = sortedData.slice(start, end);

            const rankingList = await Promise.all(currentData.map(async (data, index) => {
                const globalIndex = start + index;
                const crown = globalIndex === 0 ? '🥇' : globalIndex === 1 ? '🥈' : globalIndex === 2 ? '🥉' : `${globalIndex + 1}位`;
                try {
                    const user = await interaction.client.users.fetch(data.userId);
                    return `${crown} **${user.username}**: ${data.total.toLocaleString()} 💰`;
                } catch {
                    return `${crown} **不明なユーザー**: ${data.total.toLocaleString()} 💰`;
                }
            }));

            return new EmbedBuilder()
                .setTitle(`🏆 ${interaction.guild.name} 累計獲得コインTOP50`)
                .setDescription(rankingList.join('\n'))
                .setColor('Gold')
                .setFooter({ text: `ページ ${page + 1} / 2 (全${sortedData.length}名)` })
                .setTimestamp();
        };

        // 4. ボタンの作成
        const getButtons = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('◀ 前の25名')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('次の25名 ▶')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 1 || sortedData.length <= 25)
            );
        };

        // 最初の表示
        let currentPage = 0;
        const initialEmbed = await createEmbed(currentPage);
        const initialMessage = await interaction.reply({ 
            embeds: [initialEmbed], 
            components: [getButtons(currentPage)],
            fetchReply: true 
        });

        // 5. ボタンクリックの待機 (コレクター)
        const collector = initialMessage.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id, // 実行した本人だけ操作可能
            time: 60000 // 60秒間受け付ける
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'prev') currentPage = 0;
            if (i.customId === 'next') currentPage = 1;

            const newEmbed = await createEmbed(currentPage);
            await i.update({ 
                embeds: [newEmbed], 
                components: [getButtons(currentPage)] 
            });
        });

        collector.on('end', () => {
            // タイムアウトしたらボタンを無効化
            initialMessage.edit({ components: [] }).catch(() => null);
        });
    },
};