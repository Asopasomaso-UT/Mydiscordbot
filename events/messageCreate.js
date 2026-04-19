const cooldowns = new Set();

module.exports = {
    name: 'messageCreate',
    async execute(message) {
        if (message.author.bot || !message.guild) return;
        if (cooldowns.has(message.author.id)) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const petKey = `pet_data_${guildId}_${userId}`;
        const levelKey = `level_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        // データの取得
        const [petData, levelData] = await Promise.all([
            DataModel.findOne({ id: petKey }),
            DataModel.findOne({ id: levelKey })
        ]);

        let { level, xp } = levelData?.value || { level: 1, xp: 0 };
        const equippedPet = petData?.value?.equippedPet;

        // ブースト計算を適用
        const gainedXp = calculateGainedXP(equippedPet);
        xp += gainedXp;

        // レベルアップ判定: 次のレベルに必要なXP = 100 * (現在のレベル^2)
        const nextXP = 100 * Math.pow(level, 2);

        if (xp >= nextXP) {
            level++;
            xp = 0; // 0リセット（余剰分を引き継ぐなら xp - nextXP）

            // レベルアップ報酬 (例: レベル × 2000コイン)
            const reward = level * 2000;
            await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: reward } });

            await message.reply(`🎊 **LEVEL UP!** 🎊\n**Lv.${level}** に到達しました！\n報酬: **${reward.toLocaleString()}** 💰`);
        }

        // 保存
        await DataModel.findOneAndUpdate(
            { id: levelKey },
            { value: { level, xp } },
            { upsert: true }
        );

        // クールダウン開始 (60秒)
        cooldowns.add(userId);
        setTimeout(() => cooldowns.delete(userId), 60000);
    }
};