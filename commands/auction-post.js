const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin, parseCoin } = require('../utils/formatHelper');
const { ITEM_MASTER } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auction-post')
        .setDescription('アイテムを数量指定して出品します')
        .addStringOption(option => option.setName('type').setDescription('即決か入札か').setRequired(true).addChoices({ name: '即決', value: 'fixed' }, { name: '入札', value: 'bidding' }))
        .addStringOption(option => option.setName('price_text').setDescription('価格（1m, 10bなど）').setRequired(true))
        .addIntegerOption(option => option.setName('quantity').setDescription('数量').setMinValue(1)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const type = interaction.options.getString('type');
        const price = parseCoin(interaction.options.getString('price_text'));
        const quantity = interaction.options.getInteger('quantity') || 1;

        if (isNaN(price) || price <= 0) return interaction.reply({ content: '❌ 正しい価格を入力してください。', ephemeral: true });

        const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
        const inventory = petData?.value?.inventory || {};

        const ownedItems = Object.entries(inventory)
            .filter(([_, count]) => count >= quantity)
            .map(([key, count]) => ({
                label: `${ITEM_MASTER[key]?.name || key} (所持: ${count})`,
                value: key
            }));

        if (ownedItems.length === 0) return interaction.reply({ content: `❌ 指定個数（${quantity}個）以上のアイテムがありません。`, ephemeral: true });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder().setCustomId('post_select').setPlaceholder('出品アイテムを選択').addOptions(ownedItems.slice(0, 25))
        );

        const response = await interaction.reply({ content: `【${type === 'fixed' ? '即決' : '入札'}】単価: ${formatCoin(price)} / 数量: ${quantity}個`, components: [row], ephemeral: true });
        const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async (i) => {
            const itemId = i.values[0];
            const listingId = Date.now().toString();

            const newListing = {
                listingId, sellerId: userId, itemId, price, quantity, type,
                highestBidder: null,
                expiresAt: Date.now() + (24 * 60 * 60 * 1000)
            };

            await Promise.all([
                DataModel.findOneAndUpdate({ id: `pet_data_${guildId}_${userId}` }, { $inc: { [`value.inventory.${itemId}`]: -quantity } }),
                DataModel.findOneAndUpdate({ id: `auction_listings_${guildId}` }, { $push: { 'value.items': newListing } }, { upsert: true })
            ]);

            const name = ITEM_MASTER[itemId]?.name || itemId;
            await i.update({ content: `✅ ${name} を出品しました。`, components: [] });
            await interaction.channel.send(`📢 **${interaction.user.username}** が **${name}** (${quantity}個) を出品しました！`);
        });
    }
};