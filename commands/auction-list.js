const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ComponentType } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin, parseCoin } = require('../utils/formatHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auction-list')
        .setDescription('出品一覧を表示します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const buyerId = interaction.user.id;
        const auctionKey = `auction_listings_${guildId}`;
        const data = await DataModel.findOne({ id: auctionKey });
        const items = data?.value?.items || [];

        if (items.length === 0) return interaction.reply('📢 出品中のアイテムはありません。');

        const itemNames = { 'rare_candy': '🍬 不思議なあめ', 'enchant_shield': '🛡️ エンチャントシールド', 'monday_bread': '🍞 特製チョコパン', 'common_egg': '🥚 Common Egg' };

        const embed = new EmbedBuilder().setTitle('🔨 オークション会場').setColor('Gold');
        const rows = [];
        let currentRow = new ActionRowBuilder();

        items.forEach((item, index) => {
            const isFixed = item.type === 'fixed';
            const displayName = itemNames[item.itemId] || item.itemId;
            
            embed.addFields({
                name: `${index + 1}. ${displayName} × ${item.quantity}`,
                value: `形式: ${isFixed ? '⚡即決' : '⏳入札'}\n価格: ${formatCoin(item.price)} 💰\n出品者: <@${item.sellerId}>`,
                inline: true
            });

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`auc_${isFixed ? 'buy' : 'bid'}_${item.listingId}`)
                    .setLabel(`${index + 1}番に${isFixed ? '購入' : '入札'}`)
                    .setStyle(isFixed ? ButtonStyle.Success : ButtonStyle.Primary)
                    .setDisabled(item.sellerId === buyerId)
            );

            if (currentRow.components.length === 5 || index === items.length - 1) {
                rows.push(currentRow); currentRow = new ActionRowBuilder();
            }
        });

        const response = await interaction.reply({ embeds: [embed], components: rows, fetchReply: true });
        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            const [_, action, listingId] = i.customId.split('_');
            const latest = await DataModel.findOne({ id: auctionKey });
            const item = latest?.value?.items.find(it => it.listingId === listingId);

            if (!item) return i.reply({ content: '既に終了しています。', ephemeral: true });

            if (action === 'buy') {
                // 即決処理 (前述のロジックと同じ)[cite: 7]
                const moneyData = await DataModel.findOne({ id: `money_${guildId}_${buyerId}` });
                if ((moneyData?.value || 0) < item.price) return i.reply({ content: 'コイン不足です。', ephemeral: true });

                await Promise.all([
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${buyerId}` }, { $inc: { value: -item.price } }),
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${item.sellerId}` }, { $inc: { value: item.price } }),
                    DataModel.findOneAndUpdate({ id: `total_earned_${guildId}_${item.sellerId}` }, { $inc: { value: item.price } }), //
                    DataModel.findOneAndUpdate({ id: `pet_data_${guildId}_${buyerId}` }, { $inc: { [`value.inventory.${item.itemId}`]: item.quantity } }, { upsert: true }),
                    DataModel.findOneAndUpdate({ id: auctionKey }, { $pull: { 'value.items': { listingId: item.listingId } } })
                ]);
                await i.reply(`✅ **${itemNames[item.itemId] || item.itemId}** を購入しました！`);
            } 
            else if (action === 'bid') {
                // 入札用モーダルの表示[cite: 8]
                const modal = new ModalBuilder().setCustomId(`modal_bid_${listingId}`).setTitle('入札金額を入力');
                const input = new TextInputBuilder().setCustomId('bid_amount').setLabel(`現在: ${formatCoin(item.price)} (単位使用可)`).setStyle(TextInputStyle.Short).setRequired(true);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }
        });
    }
};