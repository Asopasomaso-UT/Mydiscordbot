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
                value: `形式: ${isFixed ? '⚡即決' : '⏳入札'}\n価格: ${formatCoin(item.price)} 💰\n出品者: ${isSeller ? '**あなた**' : `<@${item.sellerId}>`}`,
                inline: true
            });

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`auc_${isSeller ? 'cancel' : (isFixed ? 'buy' : 'bid')}_${item.listingId}`)
                    .setLabel(isSeller ? '取り下げ' : (isFixed ? '購入' : '入札'))
                    .setStyle(isSeller ? ButtonStyle.Danger : (isFixed ? ButtonStyle.Success : ButtonStyle.Primary))
            );

            if (currentRow.components.length === 5 || index === items.length - 1) {
                rows.push(currentRow); currentRow = new ActionRowBuilder();
            }
        });

        const response = await interaction.reply({ embeds: [embed], components: rows });
        
        // componentTypeを限定せず、ボタン操作を受け取る
        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            const [_, action, listingId] = i.customId.split('_');
            
            // 処理中であることをDiscordに通知（タイムアウト防止）
            if (action !== 'bid') await i.deferUpdate();

            const latest = await DataModel.findOne({ id: auctionKey });
            const item = latest?.value?.items.find(it => it.listingId === listingId);
            
            if (!item) {
                return i.followUp({ content: 'このアイテムは既に終了しているか、取り下げられています。', ephemeral: true });
            }

            if (action === 'cancel') {
                // 取り下げ処理：アイテムを返却[cite: 7, 8]
                await Promise.all([
                    DataModel.findOneAndUpdate(
                        { id: `pet_data_${guildId}_${userId}` }, 
                        { $inc: { [`value.inventory.${item.itemId}`]: item.quantity } }
                    ),
                    DataModel.findOneAndUpdate(
                        { id: auctionKey }, 
                        { $pull: { 'value.items': { listingId } } }
                    )
                ]);

                return i.followUp({ content: `✅ **${ITEM_MASTER[item.itemId]?.name || item.itemId}** の出品を取り下げました。`, ephemeral: true });
            }

            if (action === 'buy') {
                const moneyData = await DataModel.findOne({ id: `money_${guildId}_${userId}` });
                const currentMoney = moneyData?.value || 0;

                if (currentMoney < item.price) {
                    return i.followUp({ content: '❌ コインが足りません。', ephemeral: true });
                }

                // 売買処理[cite: 8]
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${userId}` }, { $inc: { value: -item.price } }),
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${item.sellerId}` }, { $inc: { value: item.price } }),
                    DataModel.findOneAndUpdate({ id: `pet_data_${guildId}_${userId}` }, { $inc: { [`value.inventory.${item.itemId}`]: item.quantity } }, { upsert: true }),
                    DataModel.findOneAndUpdate({ id: auctionKey }, { $pull: { 'value.items': { listingId } } })
                ]);

                return i.followUp({ content: `✅ **${ITEM_MASTER[item.itemId]?.name || item.itemId}** を購入しました！`, ephemeral: true });
            }

            if (action === 'bid') {
                const modal = new ModalBuilder().setCustomId(`modal_bid_${listingId}`).setTitle('入札');
                const input = new TextInputBuilder()
                    .setCustomId('amount')
                    .setLabel(`現在価格: ${formatCoin(item.price)}`)
                    .setPlaceholder('例: 1.5m')
                    .setStyle(TextInputStyle.Short);
                modal.addComponents(new ActionRowBuilder().addComponents(input));
                await i.showModal(modal);
            }
        });
    }
};