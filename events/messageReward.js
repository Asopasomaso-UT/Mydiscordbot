const { Events } = require('discord.js');
const mongoose = require('mongoose');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild || message.content.startsWith('/')) return;

        const { author, guild } = message;
        const moneyKey = `money_${guild.id}_${author.id}`;
        const totalEarnedKey = `total_earned_${guild.id}_${author.id}`;
        const petKey = `pet_data_${guild.id}_${author.id}`;

        try {
            const petData = await DataModel.findOne({ id: petKey });
            
            // --- 【修正済み】合計倍率の計算ロジック ---
            let totalMultiplier = 0;
            const pets = petData?.value?.pets || [];
            const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
            const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

            equippedPets.forEach(p => {
                // 基本種族倍率 × 進化倍率
                const basePart = Number(p.multiplier || 1) * Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
                
                // エンチャント補正 (1.0 = 100%)
                let enchantFactor = 1.0;
                if (p.enchant) {
                    const type = String(p.enchant.type).toLowerCase();
                    const lv = Number(p.enchant.level || 0);
                    if (type === 'power') {
                        enchantFactor += (lv * 0.2);
                    } else if (type === 'mimic') {
                        enchantFactor += lv;
                    }
                }
                
                totalMultiplier += (basePart * enchantFactor);
            });

            // 装備がない場合は 1.0倍
            if (totalMultiplier < 1) totalMultiplier = 1.0;

            const baseAmount = 10;
            const finalReward = Math.floor(baseAmount * totalMultiplier);

            // 更新処理
            await Promise.all([
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: finalReward } }, { upsert: true }),
                DataModel.findOneAndUpdate({ id: totalEarnedKey }, { $inc: { value: finalReward } }, { upsert: true })
            ]);

        } catch (error) {
            console.error('報酬付与エラー:', error);
        }
    },
};