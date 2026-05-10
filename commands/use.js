const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

const POTION_CONFIG = {
    'luck_potion': { name: '🍀Lucky potion', type: 'luck', duration: 15 * 60 * 1000, desc: '卵のレア確率がアップ！' },
    'power_potion': { name: '💪power potion', type: 'power', duration: 15 * 60 * 1000, desc: 'ペットの倍率が1.5倍！' }
};

function getLevelBonus(level) {
    let bonusMoney = 0;
    let bonusText = "";
    let bonusItems = null;

    switch (level) {
        case 10:
            bonusMoney = 50000;
            bonusText = "🔓 **レベル10到達!**";
            break;
        case 20:
            bonusMoney = 150000;
            bonusText = "🌟 **レベル20到達!**";
            bonusItems = { "value.inventory.Exotic_egg": 1 };
            break;
        case 30:
            bonusMoney = 500000;
            bonusText = "🔥 **レベル30到達!**";
            bonusItems = { "value.inventory.Exotic_egg": 3 };
            break;
        case 40:
            bonusMoney = 1000000;
            bonusText = "💎 **レベル40到達!**";
            bonusItems = { "value.inventory.Exotic_egg": 5 };
            break;
        case 50:
            bonusMoney = 5000000;
            bonusText = "👑 **レベル50到達!**";
            bonusItems = { "value.inventory.Exotic_egg": 10 };
            break;
    }
    return { bonusMoney, bonusText, bonusItems };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('アイテムやポーションを使用します')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('使用するアイテムを選択')
                .setRequired(true)
                .addChoices(
                    { name: '🍬 不思議なあめ', value: 'rare_candy' },
                    { name: '🍀 Lucky potion', value: 'luck_potion' },
                    { name: '💪 power potion', value: 'power_potion' }
                )),

    async execute(interaction) {
        await interaction.deferReply();
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const itemKey = interaction.options.getString('item');
        const invKey = `pet_data_${guildId}_${userId}`;

        const userData = await DataModel.findOne({ id: invKey });
        const count = userData?.value?.inventory?.[itemKey] || 0;

        if (count <= 0) return interaction.editReply('❌ そのアイテムを持っていません。');

        // --- ポーション使用処理 ---
        if (itemKey.endsWith('_potion')) {
            const potion = POTION_CONFIG[itemKey];
            const currentEnd = userData.value?.buffs?.[potion.type] || Date.now();
            const baseTime = Math.max(currentEnd, Date.now());
            const newEndTime = baseTime + potion.duration;

            await DataModel.findOneAndUpdate(
                { id: invKey },
                { 
                    $inc: { [`value.inventory.${itemKey}`]: -1 },
                    $set: { [`value.buffs.${potion.type}`]: newEndTime }
                }
            );

            const endTimestamp = Math.floor(newEndTime / 1000);
            return interaction.editReply({
                embeds: [new EmbedBuilder()
                    .setTitle(`${potion.name} を使用しました！`)
                    .setDescription(`${potion.desc}\n\n終了時間: <t:${endTimestamp}:f> (<t:${endTimestamp}:R>)`)
                    .setColor('Green')]
            });
        }

        // --- 不思議なあめ使用処理 (既存ロジック維持) ---
        if (itemKey === 'rare_candy') {
            const levelKey = `user_level_${guildId}_${userId}`;
            const moneyKey = `money_${guildId}_${userId}`;
            const levelDoc = await DataModel.findOne({ id: levelKey });

            let level = levelDoc?.value?.level || 1;
            level++;

            const { bonusMoney, bonusText, bonusItems } = getLevelBonus(level);
            const baseMoney = level * 2000;
            const totalMoney = baseMoney + bonusMoney;

            const updateOps = [
                DataModel.findOneAndUpdate({ id: levelKey }, { $set: { 'value.level': level, 'value.xp': 0 } }, { upsert: true }),
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalMoney } }, { upsert: true }),
                DataModel.findOneAndUpdate({ id: `total_earned_${guildId}_${userId}` }, { $inc: { value: totalMoney } }, { upsert: true })
            ];

            let inventoryUpdate = { $inc: { [`value.inventory.${itemKey}`]: -1 } };
            if (bonusItems) {
                for (const [path, qty] of Object.entries(bonusItems)) {
                    inventoryUpdate.$inc[path] = qty;
                }
            }
            updateOps.push(DataModel.findOneAndUpdate({ id: invKey }, inventoryUpdate));

            await Promise.all(updateOps);

            const embed = new EmbedBuilder()
                .setTitle('🍬 不思議なあめを使用した！')
                .setDescription(`<@${userId}> のレベルが上がって **Lv.${level}** になった！`)
                .addFields({ name: '獲得報酬', value: `💰 **${totalMoney.toLocaleString()}** コイン` })
                .setColor('LuminousVividPink')
                .setTimestamp();

            if (bonusText) embed.addFields({ name: '特別ボーナス', value: bonusText });
            if (bonusItems) {
                const itemEntry = Object.entries(bonusItems).map(([path, qty]) => {
                    const name = path.split('.').pop().replace('_', ' ');
                    return `📦 **${name}** × ${qty}`;
                }).join('\n');
                embed.addFields({ name: '獲得アイテム', value: itemEntry });
            }

            return interaction.editReply({ embeds: [embed] });
        }
    }
};