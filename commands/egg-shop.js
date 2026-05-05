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
    'slime_egg': '👽',
    'Undertale_egg': '💀',
    'Exotic_egg': '💎'
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('egg-shop')
        .setDescription('枠ごとに30分に1回購入可能な卵ショップ'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const shopKey = `egg_shop_stock_${guildId}`;
        const moneyKey = `money_${guildId}_${userId}`;
        const invKey = `pet_data_${guildId}_${userId}`;
        const now = Date.now();
        const cooldownMs = 30 * 60 * 1000;

        let shopData = await DataModel.findOne({ id: shopKey });
        
        // --- 1. 在庫の更新（枠ごとに独立した確率抽選） ---
        const isExpired = !shopData || (now - shopData.value.lastUpdate) > 1800000;

        if (isExpired) {
            const availableEggs = Object.entries(EGG_CONFIG).filter(([_, cfg]) => !cfg.isSuperShop);
            
            const pickRandomEgg = () => {
                const totalWeight = availableEggs.reduce((sum, [_, cfg]) => sum + (cfg.shopChance || 10), 0);
                let random = Math.random() * totalWeight;
                for (const [key, cfg] of availableEggs) {
                    if (random < (cfg.shopChance || 10)) return key;
                    random -= (cfg.shopChance || 10);
                }
                return availableEggs[0][0];
            };

            const newStock = [pickRandomEgg(), pickRandomEgg(), pickRandomEgg()];

            shopData = await DataModel.findOneAndUpdate(
                { id: shopKey },
                { value: { stock: newStock, lastUpdate: now } },
                { upsert: true, returnDocument: 'after' }
            );
        }

        const currentStock = shopData.value.stock;
        const nextUpdate = shopData.value.lastUpdate + 1800000;

        // --- 2. 各枠のクールダウン確認 ---
        const cooldownQueries = [0, 1, 2].map(i => `last_egg_buy_${userId}_slot${i}`);
        const cooldownDocs = await DataModel.find({ id: { $in: cooldownQueries } });
        const cooldownMap = Object.fromEntries(cooldownDocs.map(d => [d.id, d.value]));

        // --- 3. UI構築 ---
        const embed = new EmbedBuilder()
            .setTitle('🏪 卵ショップ')
            .setDescription(`各枠、購入から30分経過すると再購入可能です。\nラインナップ更新: <t:${Math.floor(nextUpdate / 1000)}:R>`)
            .setColor('LuminousVividPink');

        const row = new ActionRowBuilder();

        currentStock.forEach((eggKey, index) => {
            const egg = EGG_CONFIG[eggKey];
            if (!egg) return;

            const slotCooldownKey = `last_egg_buy_${userId}_slot${index}`;
            const lastBuy = cooldownMap[slotCooldownKey] || 0;
            const canBuyAt = lastBuy + cooldownMs;
            const isOnCooldown = now < canBuyAt;

            const emoji = EGG_EMOJI[eggKey] || '🥚';
            
            embed.addFields({ 
                name: `枠 ${index + 1}: ${emoji} ${egg.name}`, 
                value: isOnCooldown 
                    ? `🕒 再購入可能: <t:${Math.floor(canBuyAt / 1000)}:R>` 
                    : `価格: ${formatCoin(egg.price)} 💰`,
                inline: true 
            });
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`buy_egg_${eggKey}_${index}`)
                    .setLabel(isOnCooldown ? '制限中' : `枠${index + 1}購入`)
                    .setStyle(isOnCooldown ? ButtonStyle.Secondary : ButtonStyle.Success)
                    .setDisabled(isOnCooldown)
            );
        });

        const response = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });

        // --- 4. ボタン操作（購入処理） ---
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '自分の画面で操作してください。', ephemeral: true });

            const parts = i.customId.split('_');
            const index = parseInt(parts[parts.length - 1]); 
            const eggKey = parts.slice(2, -1).join('_');
            const targetEgg = EGG_CONFIG[eggKey];
            const slotCooldownKey = `last_egg_buy_${userId}_slot${index}`;

            const checkCooldown = await DataModel.findOne({ id: slotCooldownKey });
            if (checkCooldown && Date.now() < (Number(checkCooldown.value) + cooldownMs)) {
                return i.reply({ content: `枠${index + 1}はまだクールダウン中です。`, ephemeral: true });
            }

            const moneyData = await DataModel.findOne({ id: moneyKey });
            const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;

            if (currentMoney < targetEgg.price) {
                return i.reply({ content: 'コインが足りません！', ephemeral: true });
            }

            await Promise.all([
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -targetEgg.price } }),
                DataModel.findOneAndUpdate(
                    { id: invKey },
                    { $inc: { [`value.inventory.${eggKey}`]: 1 } },
                    { upsert: true }
                ),
                DataModel.findOneAndUpdate(
                    { id: slotCooldownKey },
                    { value: Date.now() },
                    { upsert: true }
                )
            ]);

            await i.reply({ content: `✅ **${targetEgg.name}** (枠${index + 1}) を購入しました！`, ephemeral: true });

            const updatedRow = ActionRowBuilder.from(row);
            updatedRow.components[index] = ButtonBuilder.from(updatedRow.components[index])
                .setDisabled(true)
                .setLabel('購入済み')
                .setStyle(ButtonStyle.Secondary);
            
            await interaction.editReply({ components: [updatedRow] });
        });
    }
};