const { Events } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

const cooldowns = new Set();

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
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const cooldownKey = `${guildId}-${userId}`;
        const dailyKey = `daily_quest_${guildId}_${userId}`;

        // --- デイリークエスト進捗加算 (メッセージ送信) ---
        await DataModel.findOneAndUpdate(
            { id: dailyKey },
            { $inc: { 'value.massage': 1 } },
            { upsert: true }
        );

        if (cooldowns.has(cooldownKey)) return;

        const levelKey = `user_level_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        const [levelData, petData] = await Promise.all([
            DataModel.findOne({ id: levelKey }),
            DataModel.findOne({ id: petKey })
        ]);

        let level = levelData?.value?.level || 1;
        let xp = levelData?.value?.xp || 0;

        let boost = 1.0;
        const pets = petData?.value?.pets || [];
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

        equippedPets.forEach(p => {
            if (p.enchant) {
                if (p.enchant.type === 'energy') {
                    boost += (p.enchant.level * 0.15);
                } else if (p.enchant.type === 'mimic') {
                    boost += 0.1;
                }
            }
        });

        const baseXP = Math.floor(Math.random() * 11) + 10;
        const gainedXp = Math.floor(baseXP * boost);
        xp += gainedXp;

        const nextXP = 100 * Math.pow(level, 2);
        
        if (xp >= nextXP) {
            level++;
            xp = 0;

            const { bonusMoney, bonusText, bonusItems } = getLevelBonus(level);
            const baseReward = level * 2000;
            const totalReward = baseReward + bonusMoney;

            // 所持金と累計獲得金額の更新
            await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalReward } }, { upsert: true });
            await DataModel.findOneAndUpdate({ id: `total_earned_${guildId}_${userId}` }, { $inc: { value: totalReward } }, { upsert: true });

            // アイテム報酬がある場合
            if (bonusItems) {
                await DataModel.findOneAndUpdate({ id: petKey }, { $inc: bonusItems }, { upsert: true });
            }

            let msg = `🎊 **LEVEL UP!!** 🎊\n**Lv.${level}** になりました！\n報酬: **${totalReward.toLocaleString()}** 💰 を獲得！`;
            if (bonusText) msg += `\n${bonusText}`;
            await message.reply(msg);
        }

        await DataModel.findOneAndUpdate(
            { id: levelKey }, 
            { value: { level, xp } }, 
            { upsert: true }
        );

        cooldowns.add(cooldownKey);
        setTimeout(() => cooldowns.delete(cooldownKey), 60000);
    }
};