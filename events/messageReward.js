const { Events } = require('discord.js');
const mongoose = require('mongoose');

// Mongoose スキーマ定義
const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    name: Events.MessageCreate,
    once: false,
    async execute(message) {
        // Botの発言、DM、スラッシュコマンド（/）は対象外
        if (message.author.bot || !message.guild || message.content.startsWith('/')) return;

        const { author, guild } = message;
        const moneyKey = `money_${guild.id}_${author.id}`;
        const totalEarnedKey = `total_earned_${guild.id}_${author.id}`;
        const petKey = `pet_data_${guild.id}_${author.id}`;

        try {
            // MongoDB 接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // 1. ペットデータの取得
            const petData = await DataModel.findOne({ id: petKey });
            
            // 2. ペット倍率の計算
            let totalMultiplier = 1.0;
            const pets = petData?.value?.pets || [];
            const equippedIds = petData?.value?.equippedPetIds || [];
            
            // 装備中のペットのみを抽出して倍率を加算
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            equippedPets.forEach(p => {
                // 例: 1.05倍なら +0.05, 200倍なら +199.0
                totalMultiplier += (p.multiplier - 1);
            });

            // 3. 最終報酬の計算（基本10コイン × 倍率）
            const baseAmount = 10;
            const finalReward = Math.floor(baseAmount * totalMultiplier);

            // 4. 【所持金】と【累計獲得額】の更新
            // $inc を使って一度の操作で加算
            await Promise.all([
                DataModel.findOneAndUpdate(
                    { id: moneyKey },
                    { $inc: { value: finalReward } },
                    { upsert: true }
                ),
                DataModel.findOneAndUpdate(
                    { id: totalEarnedKey },
                    { $inc: { value: finalReward } },
                    { upsert: true }
                )
            ]);

            // デバッグ用（必要であればコメントアウトを解除）
            // console.log(`${author.tag}: ${finalReward}コイン付与 (倍率: x${totalMultiplier.toFixed(2)})`);

        } catch (error) {
            console.error('メッセージ報酬付与エラー:', error);
        }
    },
};