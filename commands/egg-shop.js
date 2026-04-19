const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { EGG_CONFIG } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

const EGG_EMOJI = {
    'common_egg': '🥚',
    'uncommon_egg': '🟢',
    'rare_egg': '🔵',
    'legendary_egg': '🟡',
    'mythic_egg': '🟣'
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
        
        // 1. 在庫の更新チェック（30分経過 or データなし）
        if (!shopData || (now - shopData.value.lastUpdate) > 1800000) {
            const keys = Object.keys(EGG_CONFIG);
            const newStock = [];
            
            // 重複を許容して3つ選ぶ
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
        const embed = new EmbedBuilder()
            .setTitle('🏪 卵ショップ')
            .setDescription('30分ごとにランナップが変わります。同じ卵が複数並ぶこともあります！')
            .setColor('LuminousVividPink')
            .setFooter({ text: '次回の入荷' })
            .setTimestamp(shopData.value.lastUpdate + 1800000);

        const row = new ActionRowBuilder();

        // 2. ボタンとフィールドの作成
        currentStock.forEach((eggKey, index) => {
            const egg = EGG_CONFIG[eggKey];
            const emoji = EGG_EMOJI[eggKey] || '🥚';
            
            embed.addFields({ 
                name: `枠 ${index + 1}: ${emoji} ${egg.label}`, 
                value: `価格: ${egg.price.toLocaleString()} 💰`, 
                inline: true 
            });
            
            // CustomIdに index を含めることで、同じ卵が並んでもボタンを区別できるようにする
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_${eggKey}_${index}`)
                    .setLabel(`${index + 1}番目の卵を購入`)
                    .setStyle(ButtonStyle.Success)
            );
        });

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // 3. 購入処理
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '自分のショップ画面で操作してください。', ephemeral: true });

            // IDから卵の種類を特定 (buy_eggKey_index の形式)
            const parts = i.customId.split('_');
            const targetKey = `${parts[1]}_${parts[2]}`; // common_egg 等
            const targetEgg = EGG_CONFIG[targetKey];

            const moneyData = await DataModel.findOne({ id: moneyKey });
            const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;

            if (currentMoney < targetEgg.price) {
                return i.reply({ content: 'コインが足りません！', ephemeral: true });
            }

            // 決済と付与
            await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -targetEgg.price } });
            await DataModel.findOneAndUpdate(
                { id: invKey },
                { $inc: { [`value.inventory.${targetKey}`]: 1 } },
                { upsert: true }
            );

            await i.reply({ content: `✅ **${targetEgg.label}** を購入しました！`, ephemeral: true });
        });
    }
};