const { 
    SlashCommandBuilder, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle,
    ComponentType 
} = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin } = require('../utils/formatHelper');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('auction-list')
        .setDescription('現在出品中のアイテム一覧を表示・購入します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const buyerId = interaction.user.id;
        const auctionListKey = `auction_listings_${guildId}`;

        // 1. 出品リストの取得
        const result = await DataModel.findOne({ id: auctionListKey });
        let items = result?.value?.items || [];

        if (items.length === 0) {
            return interaction.reply('📢 現在、オークションに出品されているアイテムはありません。');
        }

        // アイテム表示名の設定[cite: 7]
        const itemNames = {
            'rare_candy': '🍬 不思議なあめ',
            'enchant_shield': '🛡️ エンチャントシールド',
            'monday_bread': '🍞 特製チョコパン',
            'weekend_charm': '✨ 週末の至高のひととき',
            'birthday_cake': '🎂 アソパソの誕生日ケーキ'
        };

        // 2. Embed作成
        const embed = new EmbedBuilder()
            .setTitle('🔨 アソパ・オークション会場')
            .setDescription('ほしいアイテムの番号のボタンを押して購入してください。\n※自分の出品物は購入できません。')
            .setColor('Gold')
            .setTimestamp();

        const rows = [];
        let currentRow = new ActionRowBuilder();

        items.forEach((item, index) => {
            const displayName = itemNames[item.itemId] || item.itemId;
            
            embed.addFields({
                name: `${index + 1}. ${displayName}`,
                value: `価格: ${formatCoin(item.price)} 💰\n出品者: <@${item.sellerId}>`,
                inline: true
            });

            currentRow.addComponents(
                new ButtonBuilder()
                    .setCustomId(`auc_buy_${item.listingId}`)
                    .setLabel(`${index + 1}番を購入`)
                    .setStyle(ButtonStyle.Primary)
                    // 自分の出品物なら無効化する演出（任意）
                    .setDisabled(item.sellerId === buyerId)
            );

            // Discordの制限（1行5ボタンまで）に合わせる
            if (currentRow.components.length === 5 || index === items.length - 1) {
                rows.push(currentRow);
                currentRow = new ActionRowBuilder();
            }
        });

        const response = await interaction.reply({ 
            embeds: [embed], 
            components: rows,
            fetchReply: true 
        });

        // 3. ボタン操作の待機（入札・購入処理）
        const collector = response.createMessageComponentCollector({ 
            componentType: ComponentType.Button, 
            time: 300000 
        });

        collector.on('collect', async (i) => {
            if (i.user.id !== buyerId) {
                return i.reply({ content: '自分のコマンド画面で操作してください。', ephemeral: true });
            }

            const listingId = i.customId.replace('auc_buy_', '');
            
            // 最新のデータを再取得して在庫確認
            const latestData = await DataModel.findOne({ id: auctionListKey });
            const currentItems = latestData?.value?.items || [];
            const itemIndex = currentItems.findIndex(item => item.listingId === listingId);

            if (itemIndex === -1) {
                return i.reply({ content: '❌ 申し訳ありません。そのアイテムは既に売り切れたか、取り消されました。', ephemeral: true });
            }

            const targetItem = currentItems[itemIndex];

            // 購入者の所持金チェック[cite: 5]
            const moneyKey = `money_${guildId}_${buyerId}`;
            const buyerMoneyDoc = await DataModel.findOne({ id: moneyKey });
            const currentMoney = buyerMoneyDoc ? (Number(buyerMoneyDoc.value) || 0) : 0;

            if (currentMoney < targetItem.price) {
                return i.reply({ content: `❌ コインが足りません！（必要: ${formatCoin(targetItem.price)} 💰）`, ephemeral: true });
            }

            // 4. 取引実行（DB一括更新）
            const sellerMoneyKey = `money_${guildId}_${targetItem.sellerId}`;
            const sellerTotalKey = `total_earned_${guildId}_${targetItem.sellerId}`; // 生涯獲得額
            const buyerPetKey = `pet_data_${guildId}_${buyerId}`;

            try {
                await Promise.all([
                    // 購入者: 支払い ＆ アイテム付与[cite: 7]
                    DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -targetItem.price } }),
                    DataModel.findOneAndUpdate(
                        { id: buyerPetKey },
                        { $inc: { [`value.inventory.${targetItem.itemId}`]: 1 } },
                        { upsert: true }
                    ),
                    // 出品者: 売上受取 ＆ 生涯スコア加算
                    DataModel.findOneAndUpdate({ id: sellerMoneyKey }, { $inc: { value: targetItem.price } }, { upsert: true }),
                    DataModel.findOneAndUpdate({ id: sellerTotalKey }, { $inc: { value: targetItem.price } }, { upsert: true }),
                    // リストから削除
                    DataModel.findOneAndUpdate(
                        { id: auctionListKey },
                        { $pull: { 'value.items': { listingId: listingId } } }
                    )
                ]);

                const successName = itemNames[targetItem.itemId] || targetItem.itemId;
                await i.reply({ 
                    content: `🎊 **落札成功！**\n**${successName}** を **${formatCoin(targetItem.price)} 💰** で購入しました！\n代金は <@${targetItem.sellerId}> の口座へ振り込まれました。`,
                    ephemeral: false 
                });

                // メッセージを更新してボタンを消す（または無効化）
                await interaction.editReply({ components: [] });
                collector.stop();

            } catch (err) {
                console.error('Auction Buy Error:', err);
                await i.reply({ content: '取引中にエラーが発生しました。', ephemeral: true });
            }
        });
    }
};