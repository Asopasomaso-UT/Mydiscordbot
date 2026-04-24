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
            
            // --- 合計倍率の計算 ---
            let totalMultiplier = 0;
            const pets = petData?.value?.pets || [];
            const equippedIds = petData?.value?.equippedPetIds || [];
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));

            equippedPets.forEach(p => {
                // 1. 基本種族倍率 × 進化倍率 (Golden/Shiny/Neon)
                let petMult = (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
    
                // 2. エンチャント補正
                if (p.enchant) {
                    if (p.enchant.type === 'power') {
                    // Power: 1Lvにつき +20%
                    petMult *= (1 + (p.enchant.level * 0.2));
                } else if (p.enchant.type === 'mimic') {
                    // Mimic: 1Lvにつき +100% (2倍, 3倍, 4倍...と増える)
                    // 伝説級にふさわしい超強力な補正
                    petMult *= (1 + p.enchant.level); 
                    }
                }
    
                totalMultiplier += petMult;
            });

            // 1匹もいない場合は 1倍
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