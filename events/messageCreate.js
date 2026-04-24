const { Events } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

// クールダウン管理 (メモリリーク防止のため、実用時はRedisやDB検討もアリ)
const cooldowns = new Set();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        // Botのメッセージ、DM、スラッシュコマンド、クールダウン中は無視
        if (message.author.bot || !message.guild || message.content.startsWith('/')) return;
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
            // IDの型をStringに統一して確実にフィルタリング
            const equippedIds = (userData?.value?.equippedPetIds || []).map(id => String(id));
            const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

            equippedPets.forEach(pet => {
                if (pet.enchant) {
                    const type = String(pet.enchant.type).toLowerCase();
                    const lv = Number(pet.enchant.level || 0);

                    if (type === 'energy') {
                        // --- 【修正済み】Energy: 1Lvにつき +10% ---
                        boost += (lv * 0.1);
                    } else if (type === 'mimic') {
                        // Mimicも少しだけ加算 (0.1)
                        boost += 0.1;
                    }
                }
            });

            // 3. XP加算 (基礎10〜20 * ブースト)
            const baseXP = Math.floor(Math.random() * 11) + 10;
            const gainedXp = Math.floor(baseXP * boost);
            xp += gainedXp;

            // 4. レベルアップ判定
            // 次のレベルに必要なXP: 100 * (現在のレベルの2乗)
            const nextXP = 100 * Math.pow(level, 2);
            
            if (xp >= nextXP) {
                level++;
                xp = 0; // 余剰XPを次へ回す場合は xp -= nextXP;

                const reward = level * 2000;
                // 所持金加算
                await DataModel.findOneAndUpdate(
                    { id: moneyKey }, 
                    { $inc: { value: reward } },
                    { upsert: true }
                );
                
                await message.reply(`🎊 **LEVEL UP!!** 🎊\n**Lv.${level}** になりました！\n報酬: **${reward.toLocaleString()}** 💰 を獲得！`);
            }

            // 5. DB保存 (レベルデータの更新)
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