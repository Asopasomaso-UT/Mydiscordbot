const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin, parseCoin } = require('../utils/formatHelper');
const { ITEM_MASTER } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder().setName('auction-list').setDescription('出品一覧を表示します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const auctionKey = `auction_listings_${guildId}`;
        const data = await DataModel.findOne({ id: auctionKey });
        const items = data?.value?.items || [];

        if (items.length === 0) return interaction.reply('📢 出品中のアイテムはありません。');

        const embed = new EmbedBuilder().setTitle('🔨 オークション会場').setColor('Gold');
        const rows = [];
        let currentRow = new ActionRowBuilder();

        items.forEach((item, index) => {
            const isSeller = item.sellerId === userId;
            const isFixed = item.type === 'fixed';
            const name = ITEM_MASTER[item.itemId]?.name || item.itemId;

            embed.addFields({
                name: `${index + 1}. ${name} × ${item.quantity}`,
                value: `形式: ${isFixed ? '⚡即決' : '⏳入札'}\n価格: ${formatCoin(item.price)} 💰\n出品者: <@${item.sellerId}>`,
                inline: true
            });

            const btn = new ButtonBuilder()
                .setCustomId(`auc_${isSeller ? 'cancel' : (isFixed ? 'buy' : 'bid')}_${item.listingId}`)
                .setLabel(isSeller ? '出品取り下げ' : (isFixed ? '購入' : '入札'))
                .setStyle(isSeller ? ButtonStyle.Danger : (isFixed ? ButtonStyle.Success : ButtonStyle.Primary));
            
            currentRow.addComponents(btn);
            if (currentRow.components.length === 5 || index === items.length - 1) {
                rows.push(currentRow); currentRow = new ActionRowBuilder();
            }
        });

        const response = await interaction.reply({ embeds: [embed], components: rows });
        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            const [_, action, listingId] = i.customId.split('_');
            const latest = await DataModel.findOne({ id: auctionKey });
            const item = latest?.value?.items.find(it => it.listingId === listingId);
            if (!item) return i.reply({ content: '終了した出品です。', ephemeral: true });

            if (action === 'cancel') {
                // 取り下げ処理：アイテムを返す[cite: 7]
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: `pet_data_${guildId}_${userId}` }, { $inc: { [`value.inventory.${item.itemId}`]: item.quantity } }),
                    DataModel.findOneAndUpdate({ id: auctionKey }, { $pull: { 'value.items': { listingId } } })
                ]);
                return i.reply({ content: `✅ 出品を取り下げ、アイテムをインベントリに戻しました。`, ephemeral: true });
            }

            if (action === 'buy') {
                const money = await DataModel.findOne({ id: `money_${guildId}_${userId}` });
                if ((money?.value || 0) < item.price) return i.reply({ content: 'コイン不足です。', ephemeral: true });

                await Promise.all([
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${userId}` }, { $inc: { value: -item.price } }),
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${item.sellerId}` }, { $inc: { value: item.price } }),
                    DataModel.findOneAndUpdate({ id: `total_earned_${guildId}_${item.sellerId}` }, { $inc: { value: item.price } }),
                    DataModel.findOneAndUpdate({ id: `pet_data_${guildId}_${userId}` }, { $inc: { [`value.inventory.${item.itemId}`]: item.quantity } }, { upsert: true }),
                    DataModel.findOneAndUpdate({ id: auctionKey }, { $pull: { 'value.items': { listingId } } })
                ]);
                await i.reply(`✅ **${ITEM_MASTER[item.itemId]?.name || item.itemId}** を購入しました！`);
            } else if (action === 'bid') {
                const modal = new ModalBuilder().setCustomId(`modal_bid_${listingId}`).setTitle('入札');
                modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('amount').setLabel(`現在価格: ${formatCoin(item.price)}`).setStyle(TextInputStyle.Short)));
                await i.showModal(modal);
            }
        });
    }
};