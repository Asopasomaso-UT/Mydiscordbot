const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper'); // 単位変換関数をインポート

const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ranking')
        .setDescription('ランキングを表示します')
        .addStringOption(option =>
            option.setName('タイプ')
                .setDescription('表示するランキングの種類を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '累計獲得額 (生涯スコア)', value: 'total_earned_' },
                    { name: '現在の所持金 (財布の中身)', value: 'money_' }
                )),

    async execute(interaction) {
        const type = interaction.options.getString('タイプ');
        const guildId = interaction.guild.id;

        // 1. 指定されたタイプに基づいてデータを取得
        const allData = await DataModel.find({
            id: { $regex: `^${type}${guildId}_` }
        });

        // 2. データを整形して降順ソート、上位50名を取得
        const sortedData = allData
            .map(item => {
                const parts = item.id.split('_');
                return {
                    userId: parts[parts.length - 1], 
                    total: Number(item.value) || 0 // 数値として扱う
                };
            })
            .filter(item => item.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 50);

        if (sortedData.length === 0) {
            return interaction.reply('まだランキングデータがありません。');
        }

        const typeName = type === 'total_earned_' ? '累計獲得コイン' : '現在の所持金';
        const color = type === 'total_earned_' ? 'Gold' : 'Green';

        // 3. ページ作成関数
        const createEmbed = async (page) => {
            const start = page * 25;
            const end = start + 25;
            const currentData = sortedData.slice(start, end);

            const rankingList = await Promise.all(currentData.map(async (data, index) => {
                const globalIndex = start + index;
                // メダルと順位の装飾
                const rankPrefix = globalIndex === 0 ? '🥇' : globalIndex === 1 ? '🥈' : globalIndex === 2 ? '🥉' : `**${globalIndex + 1}.**`;
                
                try {
                    const user = await interaction.client.users.fetch(data.userId);
                    // formatCoinを適用！
                    return `${rankPrefix} **${user.username}**: \`${formatCoin(data.total)}\` 💰`;
                } catch {
                    return `${rankPrefix} **不明なユーザー**: \`${formatCoin(data.total)}\` 💰`;
                }
            }));

            return new EmbedBuilder()
                .setTitle(`🏆 ${interaction.guild.name} ${typeName} TOP50`)
                .setDescription(rankingList.join('\n'))
                .setColor(color)
                .setFooter({ text: `ページ ${page + 1} / 2 (全${sortedData.length}名)` })
                .setTimestamp();
        };

        const getButtons = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('prev')
                    .setLabel('◀ 前の25名')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('next')
                    .setLabel('次の25名 ▶')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 1 || sortedData.length <= 25)
            );
        };

        // 初期表示
        let currentPage = 0;
        const initialEmbed = await createEmbed(currentPage);
        const initialMessage = await interaction.reply({ 
            embeds: [initialEmbed], 
            components: [getButtons(currentPage)],
            fetchReply: true 
        });

        // 4. ボタンコレクター
        const collector = initialMessage.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: 60000
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
            initialMessage.edit({ components: [] }).catch(() => null);
        });
    },
};