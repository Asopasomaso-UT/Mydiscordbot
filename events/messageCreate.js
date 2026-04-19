const { MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { ENCHANT_TYPES } = require('../utils/Pet-data');

const cooldowns = new Set();

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        // BotのメッセージやDM、クールダウン中は無視
        if (message.author.bot || !message.guild) return;
        if (cooldowns.has(message.author.id)) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const invKey = `pet_data_${guildId}_${userId}`;
        const levelKey = `level_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        try {
            // 1. データの同時取得
            const [userData, levelData] = await Promise.all([
                DataModel.findOne({ id: invKey }),
                DataModel.findOne({ id: levelKey })
            ]);

            let { level, xp } = levelData?.value || { level: 1, xp: 0 };
            
            // 2. ペットのブースト計算 (Energyエンチャント対応)
            let boost = 1.0;
            const pets = userData?.value?.pets || [];
            const equippedIds = userData?.value?.equippedPetIds || [];
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));

            // 装備中のペットの中に「Energy」があるか確認
            equippedPets.forEach(pet => {
                if (pet.enchant && pet.enchant.type === 'energy') {
                    // Lv1: 1.3x, Lv2: 1.6x ... Lv5: 2.5x 
                    boost += (pet.enchant.level * 0.3);
                }
                if (pet.enchant && pet.enchant.type === 'mimic') {
                    boost += 0.1; // Mimicも少しだけ加算
                }
            });

            // 3. XP加算 (基礎10〜20 * ブースト)
            const baseXP = Math.floor(Math.random() * 11) + 10;
            const gainedXp = Math.floor(baseXP * boost);
            xp += gainedXp;

            // 4. レベルアップ判定
            const nextXP = 100 * Math.pow(level, 2);
            if (xp >= nextXP) {
                level++;
                xp = 0;

                const reward = level * 2000;
                await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: reward } });
                
                await message.reply(`🎊 **LEVEL UP!!** 🎊\n**Lv.${level}** になりました！\n報酬: **${reward.toLocaleString()}** 💰を獲得！`);
            }

            // 5. DB保存
            await DataModel.findOneAndUpdate(
                { id: levelKey }, 
                { value: { level, xp } }, 
                { upsert: true }
            );

            // 6. クールダウン設定 (1分間はXPが入らない)
            cooldowns.add(userId);
            setTimeout(() => cooldowns.delete(userId), 60000);

        } catch (error) {
            console.error('XP付与エラー:', error);
        }
    }
};