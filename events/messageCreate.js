const { Events } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const cooldowns = new Set();

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        if (message.author.bot || !message.guild) return;

        const guildId = message.guild.id;
        const userId = message.author.id;
        const cooldownKey = `${guildId}-${userId}`;
        const dailyKey = `daily_quest_${guildId}_${userId}`;

        // デイリー進捗
        await DataModel.findOneAndUpdate({ id: dailyKey }, { $inc: { 'value.massage': 1 } }, { upsert: true });

        if (cooldowns.has(cooldownKey)) return;

        const levelKey = `level_data_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;
        const [levelData, petData] = await Promise.all([DataModel.findOne({ id: levelKey }), DataModel.findOne({ id: petKey })]);

        let level = levelData?.value?.level || 1;
        let xp = levelData?.value?.xp || 0;

        // XPブースト計算 (既存)
        let boost = 1.0;
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = (petData?.value?.pets || []).filter(p => equippedIds.includes(String(p.petId)));
        equippedPets.forEach(p => {
            if (p.enchant?.type === 'energy') boost += (p.enchant.level * 0.15);
            else if (p.enchant?.type === 'mimic') boost += 0.1;
        });

        xp += Math.floor((Math.floor(Math.random() * 11) + 10) * boost);
        const nextXP = 100 * Math.pow(level, 2);
        
        if (xp >= nextXP) {
            level++; xp = 0;
            const reward = level * 2000;
            await DataModel.findOneAndUpdate({ id: `money_${guildId}_${userId}` }, { $inc: { value: reward } }, { upsert: true });
            await message.reply(`🎊 **LEVEL UP!!** Lv.${level}になりました！\n報酬: **${reward.toLocaleString()}** 💰`);
        }

        await DataModel.findOneAndUpdate({ id: levelKey }, { value: { level, xp } }, { upsert: true });
        cooldowns.add(cooldownKey);
        setTimeout(() => cooldowns.delete(cooldownKey), 60000);
    }
};