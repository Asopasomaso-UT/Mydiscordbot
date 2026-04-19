// utils/rewardHelper.js
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

/**
 * ユーザーのペット倍率を考慮した最終報酬を計算する
 */
async function calculateFinalReward(guildId, userId, baseAmount) {
    const invKey = `pet_data_${guildId}_${userId}`;
    const userData = await DataModel.findOne({ id: invKey });
    
    const pets = userData?.value?.pets || [];
    const equippedIds = userData?.value?.equippedPetIds || [];
    
    // 装備中のペットを抽出
    const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
    
    // 倍率計算: 1 + (ペットAの増加分) + (ペットBの増加分)...
    // 例: x1.05 と x2.0 なら 1 + 0.05 + 1.0 = 2.05倍
    let totalMultiplier = 1.0;
    equippedPets.forEach(p => {
        totalMultiplier += (p.multiplier - 1);
    });

    return Math.floor(baseAmount * totalMultiplier);
}

module.exports = { calculateFinalReward };