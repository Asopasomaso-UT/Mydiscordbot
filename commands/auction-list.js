const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle 
} = require('discord.js');
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
        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            const [_, action, listingId] = i.customId.split('_');

            // --- 入札(bid)時の処理 ---
            if (action === 'bid') {
                const latestData = await DataModel.findOne({ id: auctionKey });
                const item = latestData?.value?.items.find(it => it.listingId === listingId);
                
                if (!item) return i.reply({ content: 'このアイテムは既に終了しています。', ephemeral: true });

                const modal = new ModalBuilder()
                    .setCustomId(`modal_bid_${listingId}`)
                    .setTitle('入札金額の入力');

                const amountInput = new TextInputBuilder()
                    .setCustomId('bid_amount_input')
                    .setLabel(`現在の価格: ${formatCoin(item.price)}`)
                    .setPlaceholder('現在の価格より高い値を入力 (例: 1.5m, 10b)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(amountInput));
                
                await i.showModal(modal);

                // モーダルの送信を待機[cite: 7, 8]
                try {
                    const submitted = await i.awaitModalSubmit({
                        filter: (interaction) => interaction.customId === `modal_bid_${listingId}`,
                        time: 60000
                    });

                    const bidRaw = submitted.fields.getTextInputValue('bid_amount_input');
                    const bidAmount = parseCoin(bidRaw); // 単位を数値に変換

                    // 入札バリデーション
                    if (isNaN(bidAmount) || bidAmount <= item.price) {
                        return submitted.reply({ 
                            content: `❌ 現在の価格 (${formatCoin(item.price)}) より高い数値を入力してください。`, 
                            ephemeral: true 
                        });
                    }

                    // 所持金チェック
                    const moneyData = await DataModel.findOne({ id: `money_${guildId}_${userId}` });
                    if ((moneyData?.value || 0) < bidAmount) {
                        return submitted.reply({ content: '❌ 入札に必要なコインが足りません。', ephemeral: true });
                    }

                    // DB更新: 最高入札者と価格を更新[cite: 7, 8]
                    await DataModel.findOneAndUpdate(
                        { id: auctionKey, "value.items.listingId": listingId },
                        { 
                            $set: { 
                                "value.items.$.price": bidAmount,
                                "value.items.$.highestBidder": userId 
                            } 
                        }
                    );

                    await submitted.reply({ 
                        content: `✅ **${ITEM_MASTER[item.itemId]?.name || item.itemId}** に **${formatCoin(bidAmount)}** で入札しました！`, 
                        ephemeral: true 
                    });

                } catch (err) {
                    // タイムアウトなどのエラー
                    console.error(err);
                }
                return;
            }

            // --- 取り下げ(cancel) と 購入(buy) の処理 ---
            await i.deferUpdate();
            const latest = await DataModel.findOne({ id: auctionKey });
            const item = latest?.value?.items.find(it => it.listingId === listingId);
            if (!item) return i.followUp({ content: '既に終了しています。', ephemeral: true });

            if (action === 'cancel') {
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: `pet_data_${guildId}_${userId}` }, { $inc: { [`value.inventory.${item.itemId}`]: item.quantity } }),
                    DataModel.findOneAndUpdate({ id: auctionKey }, { $pull: { 'value.items': { listingId } } })
                ]);
                return i.followUp({ content: `✅ 出品を取り下げました。`, ephemeral: true });
            }

            if (action === 'buy') {
                const moneyData = await DataModel.findOne({ id: `money_${guildId}_${userId}` });
                if ((moneyData?.value || 0) < item.price) return i.followUp({ content: 'コイン不足です。', ephemeral: true });

                await Promise.all([
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${userId}` }, { $inc: { value: -item.price } }),
                    DataModel.findOneAndUpdate({ id: `money_${guildId}_${item.sellerId}` }, { $inc: { value: item.price } }),
                    DataModel.findOneAndUpdate({ id: `pet_data_${guildId}_${userId}` }, { $inc: { [`value.inventory.${item.itemId}`]: item.quantity } }, { upsert: true }),
                    DataModel.findOneAndUpdate({ id: auctionKey }, { $pull: { 'value.items': { listingId: item.listingId } } })
                ]);
                await i.followUp({ content: `✅ **${ITEM_MASTER[item.itemId]?.name || item.itemId}** を購入しました！`, ephemeral: true });
            }
        });
    }
};