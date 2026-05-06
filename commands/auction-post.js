const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    StringSelectMenuBuilder, 
    ComponentType 
} = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin, parseCoin } = require('../utils/formatHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auction-post')
        .setDescription('アイテムを数量指定して出品します（即決/入札選択可能）')
        .addStringOption(option => 
            option.setName('type')
                .setDescription('販売形式を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: '即決 (固定価格ですぐに買える)', value: 'fixed' },
                    { name: '入札 (期間内に最高額をつけた人が買える)', value: 'bidding' }
                ))
        .addStringOption(option => 
            option.setName('price_text')
                .setDescription('価格/開始価格を入力 (例: 1m, 10b)')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('quantity')
                .setDescription('出品する個数')
                .setMinValue(1)
                .setRequired(false)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const type = interaction.options.getString('type');
        const priceInput = interaction.options.getString('price_text');
        const quantity = interaction.options.getInteger('quantity') || 1;
        
        const price = parseCoin(priceInput); //[cite: 8]
        if (isNaN(price) || price <= 0) return interaction.reply({ content: '❌ 正しい価格を入力してください。', ephemeral: true });

        const petKey = `pet_data_${guildId}_${userId}`;
        const userData = await DataModel.findOne({ id: petKey });
        const inventory = userData?.value?.inventory || {};

        const itemNames = {
            'rare_candy': '🍬 不思議なあめ', 'enchant_shield': '🛡️ エンチャントシールド',
            'monday_bread': '🍞 特製チョコパン', 'weekend_charm': '✨ 週末の至高のひととき',
            'common_egg': '🥚 Common Egg', 'Uncommon_egg': '🟢 Uncommon Egg',
            'Rare_egg': '🔵 Rare Egg', 'Legendary_egg': '🟡 Legendary Egg',
            'Mythic_egg': '🟣 Mythic Egg', 'Exotic_egg': '💎 Exotic Egg'
        };

        const ownedItems = Object.entries(inventory)
            .filter(([_, count]) => count >= quantity)
            .map(([key, count]) => ({ label: `${itemNames[key] || key} (所持: ${count})`, value: key }));

        if (ownedItems.length === 0) return interaction.reply({ content: `❌ 指定個数以上の在庫がありません。`, ephemeral: true });

        const selectMenu = new StringSelectMenuBuilder().setCustomId('post_select').setPlaceholder('アイテムを選択').addOptions(ownedItems.slice(0, 25));
        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: `【${type === 'fixed' ? '即決' : '入札'}設定】\n単価: **${formatCoin(price)}** / 数量: **${quantity}個**\n出品アイテムを選択してください。`,
            components: [row], ephemeral: true
        });

        const collector = response.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 60000 });

        collector.on('collect', async (i) => {
            const itemId = i.values[0];
            const listingId = Date.now().toString();

            const newListing = {
                listingId, sellerId: userId, itemId, price, quantity, type,
                highestBidder: null,
                expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 入札は24時間期限
            };

            await Promise.all([
                DataModel.findOneAndUpdate({ id: petKey }, { $inc: { [`value.inventory.${itemId}`]: -quantity } }),
                DataModel.findOneAndUpdate({ id: `auction_listings_${guildId}` }, { $push: { 'value.items': newListing } }, { upsert: true })
            ]);

            const embed = new EmbedBuilder().setTitle('🔨 出品完了').setColor('Gold')
                .addFields({ name: '形式', value: type === 'fixed' ? '即決' : '入札', inline: true },
                           { name: 'アイテム', value: itemNames[itemId] || itemId, inline: true },
                           { name: '価格', value: formatCoin(price), inline: true });

            await i.update({ embeds: [embed], components: [] });
            await interaction.channel.send(`📢 **${interaction.user.username}** が **${itemNames[itemId] || itemId}** (${quantity}個) を出品しました！[cite: 4]`);
        });
    }
};