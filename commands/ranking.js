const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper');

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
                    { name: '現在の所持金 (財布の中身)', value: 'money_' },
                    { name: '累計獲得額 (生涯スコア)', value: 'total_earned_' },
                    { name: 'プレイヤーレベル', value: 'level_data_' },
                    { name: 'Super Rebirth回数', value: 'super_rebirth' } // 特殊処理用
                )),

    async execute(interaction) {
        const type = interaction.options.getString('タイプ');
        const guildId = interaction.guild.id;

        let sortedData = [];
        let typeName = '';
        let color = 'Blue';
        let unit = '';

        // 1. データの取得と整形
        if (type === 'super_rebirth') {
            // Super Rebirthは pet_data_ の中にあるので、まず全ユーザーのpet_dataを取得
            const allPetData = await DataModel.find({ id: { $regex: `^pet_data_${guildId}_` } });
            sortedData = allPetData.map(item => ({
                userId: item.id.split('_')[3], // pet_data_guildId_userId
                total: Number(item.value?.superRebirthCount) || 0
            }));
            typeName = 'Super Rebirth回数';
            color = 'LuminousVividPink';
            unit = '回';
        } else if (type === 'level_data_') {
            // レベルデータから取得
            const allLevelData = await DataModel.find({ id: { $regex: `^${type}${guildId}_` } });
            sortedData = allLevelData.map(item => ({
                userId: item.id.split('_').pop(),
                total: Number(item.value?.level) || 1
            }));
            typeName = 'プレイヤーレベル';
            color = 'Aqua';
            unit = 'Lv';
        } else {
            // Money系
            const allMoneyData = await DataModel.find({ id: { $regex: `^${type}${guildId}_` } });
            sortedData = allMoneyData.map(item => ({
                userId: item.id.split('_').pop(),
                total: Number(item.value) || 0
            }));
            typeName = type === 'total_earned_' ? '累計獲得コイン' : '現在の所持金';
            color = type === 'total_earned_' ? 'Gold' : 'Green';
            unit = '💰';
        }

        // 2. 共通のソート・フィルタ・スライス
        sortedData = sortedData
            .filter(item => item.total > 0)
            .sort((a, b) => b.total - a.total)
            .slice(0, 50);

        if (sortedData.length === 0) {
            return interaction.reply('まだランキングデータがありません。');
        }

        // 3. ページ作成関数
        const createEmbed = async (page) => {
            const start = page * 25;
            const end = start + 25;
            const currentData = sortedData.slice(start, end);

            const rankingList = await Promise.all(currentData.map(async (data, index) => {
                const globalIndex = start + index;
                const rankPrefix = globalIndex === 0 ? '🥇' : globalIndex === 1 ? '🥈' : globalIndex === 2 ? '🥉' : `**${globalIndex + 1}.**`;
                
                // 表示形式の調整
                let displayValue = '';
                if (unit === '💰') {
                    displayValue = `\`${formatCoin(data.total)}\` ${unit}`;
                } else {
                    displayValue = `\`${data.total.toLocaleString()}\` ${unit}`;
                }

                try {
                    const user = await interaction.client.users.fetch(data.userId);
                    return `${rankPrefix} **${user.username}**: ${displayValue}`;
                } catch {
                    return `${rankPrefix} **不明なユーザー**: ${displayValue}`;
                }
            }));

            return new EmbedBuilder()
                .setTitle(`🏆 ${interaction.guild.name} ${typeName} TOP50`)
                .setDescription(rankingList.join('\n'))
                .setColor(color)
                .setFooter({ text: `ページ ${page + 1} / 2 (全${sortedData.length}名)` })
                .setTimestamp();
        };

        // --- 以下、ボタン制御（変更なし） ---
        const getButtons = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prev').setLabel('◀ 前の25名').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('next').setLabel('次の25名 ▶').setStyle(ButtonStyle.Secondary).setDisabled(page === 1 || sortedData.length <= 25)
            );
        };

        let currentPage = 0;
        const initialEmbed = await createEmbed(currentPage);
        const response = await interaction.reply({ 
            embeds: [initialEmbed], 
            components: [getButtons(currentPage)],
            fetchReply: true 
        });

        const collector = response.createMessageComponentCollector({
            filter: (i) => i.user.id === interaction.user.id,
            time: 60000
        });

        collector.on('collect', async (i) => {
            if (i.customId === 'prev') currentPage = 0;
            if (i.customId === 'next') currentPage = 1;
            const newEmbed = await createEmbed(currentPage);
            await i.update({ embeds: [newEmbed], components: [getButtons(currentPage)] });
        });

        collector.on('end', () => {
            interaction.editReply({ components: [] }).catch(() => null);
        });
    },
};