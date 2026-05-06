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
        .setDescription('インベントリのアイテムを選択してオークションに出品します')
        .addStringOption(option => 
            option.setName('price_text')
                .setDescription('販売価格（例: 1000, 1m, 10.5b）')
                .setRequired(true)),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const priceInput = interaction.options.getString('price_text');
        
        // 単位付きの文字列を数値に変換
        const price = parseCoin(priceInput);
        if (isNaN(price) || price <= 0) {
            return interaction.reply({ content: '❌ 正しい価格を入力してください（例: 1m, 500k）', ephemeral: true });
        }

        const petKey = `pet_data_${guildId}_${userId}`;
        const auctionListKey = `auction_listings_${guildId}`;

        // 1. インベントリデータの取得
        const userData = await DataModel.findOne({ id: petKey });
        const inventory = userData?.value?.inventory || {};

        // 表示名の変換設定[cite: 7]
        const itemNames = {
            'rare_candy': '🍬 不思議なあめ',
            'enchant_shield': '🛡️ エンチャントシールド',
            'monday_bread': '🍞 特製チョコパン',
            'weekend_charm': '✨ 週末の至高のひととき',
            'birthday_cake': '🎂 アソパソの誕生日ケーキ'
        };

        // 2. 所持しているアイテムをリスト化
        const ownedItems = Object.entries(inventory)
            .filter(([_, count]) => count > 0)
            .map(([key, _]) => ({
                label: itemNames[key] || key,
                value: key
            }));

        if (ownedItems.length === 0) {
            return interaction.reply({ content: '❌ 出品できるアイテムを何も持っていません。', ephemeral: true });
        }

        // 3. セレクトメニューの表示
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('auction_select_item')
            .setPlaceholder('出品するアイテムを選んでください')
            .addOptions(ownedItems.slice(0, 25)); // 最大25個まで

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: `💰 設定価格: **${formatCoin(price)}**\n出品するアイテムを選択してください。`,
            components: [row],
            ephemeral: true
        });

        // 4. セレクトメニューの選択を待機
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.StringSelect, 
            time: 60000 
        });

        collector.on('collect', async (i) => {
            const itemId = i.values[0];

            // 最新の在庫を再確認
            const freshData = await DataModel.findOne({ id: petKey });
            if ((freshData?.value?.inventory?.[itemId] || 0) <= 0) {
                return i.update({ content: '❌ アイテムの在庫がなくなりました。', components: [] });
            }

            // DB更新: インベントリからマイナス1 ＆ オークションリストへ追加
            const newListing = {
                listingId: Date.now().toString(),
                sellerId: userId,
                itemId: itemId,
                price: price,
                createdAt: Date.now()
            };

            await Promise.all([
                DataModel.findOneAndUpdate(
                    { id: petKey },
                    { $inc: { [`value.inventory.${itemId}`]: -1 } }
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
                .setDescription(`**${displayName}** を **${formatCoin(price)} 💰** で出品しました。`)
                .setColor('Gold');

            await i.update({ content: null, embeds: [embed], components: [] });
            
            // チャンネル全体にお知らせ
            await interaction.channel.send({
                content: `📢 **${interaction.user.username}** がオークションに **${displayName}** を出品しました！`
            });
        });
    }
};