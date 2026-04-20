const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { EGG_CONFIG } = require('../utils/Pet-data');
const { formatCoin } = require('../utils/formatHelper');

const DataModel = mongoose.models.QuickData;

const EGG_EMOJI = {
    'common_egg': '🥚',
    'Uncommon_egg': '🟢',
    'Rare_egg': '🔵',
    'Legendary_egg': '🟡',
    'Mythic_egg': '🟣',
    'Slime_egg': '👽',
    'Exotic_egg': '💎'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('egg-shop')
        .setDescription('30分ごとに在庫が入れ替わる卵ショップ'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const shopKey = `egg_shop_stock_${guildId}`;
        const moneyKey = `money_${guildId}_${userId}`;
        const invKey = `pet_data_${guildId}_${userId}`;
        const now = Date.now();

        let shopData = await DataModel.findOne({ id: shopKey });
        
        // --- 1. 在庫の更新とクリーンアップ ---
        // 以下のいずれかの場合に在庫を再生成する:
        // - データが存在しない
        // - 30分経過した
        // - 現在の在庫(stock)の中に、EGG_CONFIGに存在しない古いキーが混じっている (エラー防止)
        const hasInvalidEgg = shopData?.value?.stock?.some(key => !EGG_CONFIG[key]);
        const isExpired = !shopData || (now - shopData.value.lastUpdate) > 1800000;

        if (isExpired || hasInvalidEgg) {
            // 通常ショップに並ぶ卵（isSuperShopフラグがないもの）だけを抽出
            const availableEggKeys = Object.keys(EGG_CONFIG).filter(key => !EGG_CONFIG[key].isSuperShop);
            
            const newStock = [];
            for (let i = 0; i < 3; i++) {
                const randomEgg = availableEggKeys[Math.floor(Math.random() * availableEggKeys.length)];
                newStock.push(randomEgg);
            }

            shopData = await DataModel.findOneAndUpdate(
                { id: shopKey },
                { value: { stock: newStock, lastUpdate: now } },
                { upsert: true, returnDocument: 'after' }
            );
        }

        const currentStock = shopData.value.stock;
        const nextUpdate = shopData.value.lastUpdate + 1800000;

        const embed = new EmbedBuilder()
            .setTitle('🏪 卵ショップ')
            .setDescription(`30分ごとにラインナップが変わります。\n次回の入荷: <t:${Math.floor(nextUpdate / 1000)}:R>`)
            .setColor('LuminousVividPink')
            .setTimestamp();

        const row = new ActionRowBuilder();

        // --- 2. 表示の生成 ---
        currentStock.forEach((eggKey, index) => {
            const egg = EGG_CONFIG[eggKey];
            
            // 念のためのガード（万が一キーが見つからない場合は表示しない）
            if (!egg) return;

            const emoji = EGG_EMOJI[eggKey] || '🥚';
            
            embed.addFields({ 
                name: `枠 ${index + 1}: ${emoji} ${egg.name}`, 
                value: `価格: ${formatCoin(egg.price)} 💰`, 
                inline: true 
            });
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_egg_${eggKey}_${index}`)
                    .setLabel(`${index + 1}番目を購入`)
                    .setStyle(ButtonStyle.Success)
            );
        });

        // ボタンが1つも生成されなかった（全ての卵が無効だった）場合の処理
        if (row.components.length === 0) {
            return interaction.reply({ content: '現在ショップに並べられる卵がありません。', ephemeral: true });
        }

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // --- 3. 購入ロジック ---
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '自分の画面で操作してください。', ephemeral: true });

            const parts = i.customId.split('_');
            const eggKey = parts.slice(2, -1).join('_'); 
            const targetEgg = EGG_CONFIG[eggKey];

            if (!targetEgg) return i.reply({ content: 'この卵は現在取り扱っておりません。', ephemeral: true });

            const moneyData = await DataModel.findOne({ id: moneyKey });
            const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;

            if (currentMoney < targetEgg.price) {
                return i.reply({ content: `コインが足りません！ (必要: ${formatCoin(targetEgg.price)})`, ephemeral: true });
            }

            // 決済処理
            await Promise.all([
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -targetEgg.price } }),
                DataModel.findOneAndUpdate(
                    { id: invKey },
                    { $inc: { [`value.inventory.${eggKey}`]: 1 } },
                    { upsert: true }
                )
            ]);

            await i.reply({ content: `✅ **${targetEgg.name}** を購入しました！`, ephemeral: true });
        });
    }
};