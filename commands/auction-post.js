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
        .setDescription('アイテムや卵を数量指定してオークションに出品します')
        .addStringOption(option => 
            option.setName('price_text')
                .setDescription('1個あたりの販売価格（例: 1m, 10.5b）')
                .setRequired(true))
        .addIntegerOption(option => 
            option.setName('quantity')
                .setDescription('出品する個数（デフォルトは1個）')
                .setMinValue(1)
                .setRequired(false)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const priceInput = interaction.options.getString('price_text');
        const quantity = interaction.options.getInteger('quantity') || 1; // 指定なしなら1
        
        // 単位付きの文字列を数値に変換[cite: 8]
        const price = parseCoin(priceInput);
        if (isNaN(price) || price <= 0) {
            return interaction.reply({ content: '❌ 正しい価格を入力してください（例: 1m, 500k）', ephemeral: true });
        }

        const petKey = `pet_data_${guildId}_${userId}`;
        const auctionListKey = `auction_listings_${guildId}`;

        // 1. インベントリデータの取得
        const userData = await DataModel.findOne({ id: petKey });
        const inventory = userData?.value?.inventory || {};

        // 表示名と卵の変換設定[cite: 7]
        const itemNames = {
            'rare_candy': '🍬 不思議なあめ',
            'enchant_shield': '🛡️ エンチャントシールド',
            'monday_bread': '🍞 特製チョコパン',
            'weekend_charm': '✨ 週末の至高のひととき',
            'birthday_cake': '🎂 アソパソの誕生日ケーキ',
            'common_egg': '🥚 Common Egg',
            'Uncommon_egg': '🟢 Uncommon Egg',
            'Rare_egg': '🔵 Rare Egg',
            'Legendary_egg': '🟡 Legendary Egg',
            'Mythic_egg': '🟣 Mythic Egg',
            'Exotic_egg': '💎 Exotic Egg'
        };

        // 2. 所持しているアイテムをリスト化（指定個数以上持っているものだけ）
        const ownedItems = Object.entries(inventory)
            .filter(([_, count]) => count >= quantity) // 数量チェック
            .map(([key, count]) => ({
                label: `${itemNames[key] || key} (所持: ${count}個)`,
                value: key
            }));

        if (ownedItems.length === 0) {
            return interaction.reply({ 
                content: `❌ 指定された個数 (${quantity}個) 以上持っているアイテムがありません。`, 
                ephemeral: true 
            });
        }

        // 3. セレクトメニューの表示
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('auction_select_item')
            .setPlaceholder('出品するアイテムを選択...')
            .addOptions(ownedItems.slice(0, 25));

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: `💰 1個あたりの価格: **${formatCoin(price)}**\n📦 出品個数: **${quantity}個**\n出品するアイテムを選択してください。`,
            components: [row],
            ephemeral: true
        });

        // 4. コレクターで選択を待機
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.StringSelect, 
            time: 60000 
        });

        collector.on('collect', async (i) => {
            const itemId = i.values[0];

            // 最新の在庫を再確認[cite: 7]
            const freshData = await DataModel.findOne({ id: petKey });
            const currentStock = freshData?.value?.inventory?.[itemId] || 0;
            if (currentStock < quantity) {
                return i.update({ content: `❌ 在庫が足りなくなりました（現在: ${currentStock}個）`, components: [] });
            }

            // DB更新: インベントリから指定数マイナス & オークション追加[cite: 4, 7]
            const newListing = {
                listingId: Date.now().toString(),
                sellerId: userId,
                itemId: itemId,
                price: price,
                quantity: quantity, // 数量を保存
                createdAt: Date.now()
            };

            await Promise.all([
                DataModel.findOneAndUpdate(
                    { id: petKey },
                    { $inc: { [`value.inventory.${itemId}`]: -quantity } }
                ),
                DataModel.findOneAndUpdate(
                    { id: auctionListKey },
                    { $push: { 'value.items': newListing } },
                    { upsert: true }
                )
            ]);

            const displayName = itemNames[itemId] || itemId;
            const embed = new EmbedBuilder()
                .setTitle('🔨 オークション出品完了')
                .addFields(
                    { name: 'アイテム', value: displayName, inline: true },
                    { name: '数量', value: `${quantity}個`, inline: true },
                    { name: '単価', value: `${formatCoin(price)} 💰`, inline: true }
                )
                .setColor('Gold');

            await i.update({ content: null, embeds: [embed], components: [] });
            
            await interaction.channel.send({
                content: `📢 **${interaction.user.username}** が **${displayName}** を **${quantity}個** 出品しました！ (単価: ${formatCoin(price)})`
            });
        });
    }
};