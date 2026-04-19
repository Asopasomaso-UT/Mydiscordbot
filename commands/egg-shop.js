const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { EGG_CONFIG } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

// 表示用絵文字（お好みで変更してください）
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

        // 1. 在庫の更新チェック（30分経過でリセット）
        let shopData = await DataModel.findOne({ id: shopKey });
        if (!shopData || (now - shopData.value.lastUpdate) > 1800000) {
            const keys = Object.keys(EGG_CONFIG);
            const newStock = keys.sort(() => 0.5 - Math.random()).slice(0, 3);
            shopData = await DataModel.findOneAndUpdate(
                { id: shopKey },
                { value: { stock: newStock, lastUpdate: now } },
                { upsert: true, returnDocument: 'after' }
            );
        }

        const currentStock = shopData.value.stock;

        // 2. ショップ画面構築
        const embed = new EmbedBuilder()
            .setTitle('🏪 期間限定・卵ショップ')
            .setDescription('ラインナップは30分ごとに更新されます。')
            .setColor('LuminousVividPink')
            .setFooter({ text: '次回の入荷' })
            .setTimestamp(shopData.value.lastUpdate + 1800000);

        const row = new ActionRowBuilder();

        currentStock.forEach((eggKey) => {
            const egg = EGG_CONFIG[eggKey];
            const emoji = EGG_EMOJI[eggKey] || '🥚';
            embed.addFields({ 
                name: `${emoji} ${egg.label}`, 
                value: `価格: ${egg.price.toLocaleString()} 💰`, 
                inline: true 
            });
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_${eggKey}`)
                    .setLabel(`${egg.label}を購入`)
                    .setStyle(ButtonStyle.Success)
            );
        });

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // 3. 購入処理
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: 'これはあなたのショップ画面ではありません。', ephemeral: true });

            const targetKey = i.customId.replace('buy_', '');
            const targetEgg = EGG_CONFIG[targetKey];

            // 所持金確認
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

            await i.reply({ content: `✅ **${targetEgg.label}** を購入しました！ \`/hatch-egg\` で孵化させましょう！`, ephemeral: true });
        });
    }
};