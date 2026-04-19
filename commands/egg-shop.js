const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { EGG_CONFIG } = require('../utils/Pet-data');
const { formatCoin } = require('../utils/formatHelper');

const DataModel = mongoose.models.QuickData;

// 卵ごとの絵文字設定（Pet-dataのキーに合わせる）
const EGG_EMOJI = {
    'basic_egg': '🥚',
    'rare_egg': '🔵',
    'legendary_egg': '🟡',
    'mythic_egg': '🟣',
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
        
        // 1. 在庫の更新チェック（30分 = 1,800,000ms）
        if (!shopData || (now - shopData.value.lastUpdate) > 1800000) {
            const keys = Object.keys(EGG_CONFIG);
            const newStock = [];
            
            // 重複を許容して3つランダムに選出
            for (let i = 0; i < 3; i++) {
                const randomEgg = keys[Math.floor(Math.random() * keys.length)];
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

        // 2. ボタンとフィールドの作成
        currentStock.forEach((eggKey, index) => {
            const egg = EGG_CONFIG[eggKey];
            const emoji = EGG_EMOJI[eggKey] || '🥚';
            
            embed.addFields({ 
                name: `枠 ${index + 1}: ${emoji} ${egg.name}`, 
                value: `価格: ${formatCoin(egg.price)} 💰`, 
                inline: true 
            });
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_egg_${eggKey}_${index}`) // 解析しやすいようにbuy_egg_を付与
                    .setLabel(`${index + 1}番目を購入`)
                    .setStyle(ButtonStyle.Success)
            );
        });

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // 3. 購入処理
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '自分のショップ画面で操作してください。', ephemeral: true });

            // ID解析 (buy_egg_eggKey_index)
            const parts = i.customId.split('_');
            // eggKeyが 'basic_egg' のようにアンダースコアを含む場合を考慮
            const eggKey = parts.slice(2, -1).join('_'); 
            const targetEgg = EGG_CONFIG[eggKey];

            if (!targetEgg) return i.reply({ content: 'エラー：卵の情報が見つかりません。', ephemeral: true });

            // お金の確認
            const moneyData = await DataModel.findOne({ id: moneyKey });
            const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;

            if (currentMoney < targetEgg.price) {
                return i.reply({ content: `コインが足りません！ (必要: ${formatCoin(targetEgg.price)})`, ephemeral: true });
            }

            // 決済と付与
            await Promise.all([
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -targetEgg.price } }),
                DataModel.findOneAndUpdate(
                    { id: invKey },
                    { $inc: { [`value.inventory.${eggKey}`]: 1 } },
                    { upsert: true }
                )
            ]);

            await i.reply({ content: `✅ **${targetEgg.name}** を購入しました！\n \`/hatch-egg\` で孵化させることができます。`, ephemeral: true });
        });
    }
};