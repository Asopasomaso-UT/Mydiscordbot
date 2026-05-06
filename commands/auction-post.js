const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin } = require('../utils/formatHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auction-post')
        .setDescription('インベントリのアイテムをオークションに出品します')
        .addStringOption(option => 
            option.setName('item_id')
                .setDescription('出品するアイテムのID（inventryで確認できる名前の小文字）')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('price')
                .setDescription('販売価格')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const itemId = interaction.options.getString('item_id');
        const price = interaction.options.getInteger('price');
        const petKey = `pet_data_${guildId}_${userId}`;
        const auctionListKey = `auction_listings_${guildId}`;

        // 1. インベントリの所持チェック
        const userData = await DataModel.findOne({ id: petKey });
        const currentCount = userData?.value?.inventory?.[itemId] || 0;

        if (currentCount <= 0) {
            return interaction.reply({ content: `❌ そのアイテム（${itemId}）を所持していません。`, ephemeral: true });
        }

        // 2. インベントリからアイテムを1つ減らす[cite: 7]
        await DataModel.findOneAndUpdate(
            { id: petKey },
            { $inc: { [`value.inventory.${itemId}`]: -1 } }
        );

        // 3. オークションリストに追加
        const newListing = {
            listingId: Date.now().toString(),
            sellerId: userId,
            itemId: itemId,
            price: price,
            createdAt: Date.now()
        };

        await DataModel.findOneAndUpdate(
            { id: auctionListKey },
            { $push: { 'value.items': newListing } },
            { upsert: true }
        );

        const embed = new EmbedBuilder()
            .setTitle('🔨 オークション出品完了')
            .setDescription(`**${itemId}** を **${formatCoin(price)} 💰** で出品しました。`)
            .setColor('Gold')
            .setFooter({ text: '誰かが購入すると代金が支払われます。' });

        await interaction.reply({ embeds: [embed] });
    }
};