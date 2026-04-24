const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

// あなたが設定した最新の報酬ロジック
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
            bonusItems = { "value.inventory.Undertale_egg": 15 };
            break;
    }

    return { bonusMoney, bonusText, bonusItems };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('インベントリ内のアイテムを使用します')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('使用するアイテム')
                .setRequired(true)
                .addChoices(
                    { name: '不思議なあめ', value: 'rare_candy' }
                )),

    async execute(interaction) {
        const itemKey = interaction.options.getString('item');
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        
        const invKey = `pet_data_${guildId}_${userId}`;
        const levelKey = `level_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        const [userData, levelData] = await Promise.all([
            DataModel.findOne({ id: invKey }),
            DataModel.findOne({ id: levelKey })
        ]);

        const inventory = userData?.value?.inventory || {};
        const itemCount = inventory[itemKey] || 0;

        if (itemCount <= 0) {
            return interaction.reply({ content: 'そのアイテムを持っていません！', ephemeral: true });
        }

        if (itemKey === 'rare_candy') {
            let { level, xp } = levelData?.value || { level: 1, xp: 0 };
            
            // 1. レベルアップ処理
            level++;
            xp = 0;

            // 2. 報酬計算
            const normalReward = level * 2000;
            const { bonusMoney, bonusText, bonusItems } = getLevelBonus(level);
            const totalMoney = normalReward + bonusMoney;

            // 3. 更新クエリの構築
            const updateOps = [
                DataModel.findOneAndUpdate({ id: levelKey }, { value: { level, xp } }, { upsert: true }),
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalMoney } }, { upsert: true })
            ];

            // インベントリ更新 (あめを-1、ボーナスがあれば加算)
            let inventoryUpdate = { $inc: { [`value.inventory.${itemKey}`]: -1 } };
            if (bonusItems) {
                // $inc オブジェクトをマージ
                for (const [path, qty] of Object.entries(bonusItems)) {
                    inventoryUpdate.$inc[path] = qty;
                }
            }
            updateOps.push(DataModel.findOneAndUpdate({ id: invKey }, inventoryUpdate));

            // 一括実行
            await Promise.all(updateOps);

            // 4. 通知Embedの作成
            const embed = new EmbedBuilder()
                .setTitle('🍬 不思議なあめを使用した！')
                .setDescription(`<@${userId}> のレベルが上がって **Lv.${level}** になった！`)
                .addFields({ name: '獲得報酬', value: `💰 **${totalMoney.toLocaleString()}** コイン` })
                .setColor('LuminousVividPink')
                .setTimestamp();

            if (bonusText) {
                embed.addFields({ name: '特別ボーナス', value: bonusText });
            }
            
            // アイテム報酬があればEmbedにリストアップ
            if (bonusItems) {
                const itemEntry = Object.entries(bonusItems).map(([path, qty]) => {
                    const name = path.split('.').pop().replace('_', ' '); // key名を見やすく整形
                    return `📦 **${name}** × ${qty}`;
                }).join('\n');
                
                embed.addFields({ name: '獲得アイテム', value: itemEntry });
            }

            return interaction.reply({ embeds: [embed] });
        }
    }
};