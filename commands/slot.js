const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin, parseCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

const SYMBOLS = ['🍎', '💎', '🌟', '🔔', '🍒', '7️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slot')
        .setDescription('コインを賭けてスロットを回します')
        .addStringOption(option => 
            option.setName('bet')
                .setDescription('賭け金 (例: 1m, 2.5b)')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = parseCoin(interaction.options.getString('bet'));

        if (isNaN(bet) || bet < 100) return interaction.reply({ content: '有効な賭け金を100以上で入力してください。', ephemeral: true });

        const moneyKey = `money_${guildId}_${userId}`;
        const totalEarnedKey = `total_earned_${guildId}_${userId}`; //[cite: 5]
        const petKey = `pet_data_${guildId}_${userId}`;

        const [userData, petData] = await Promise.all([
            DataModel.findOne({ id: moneyKey }),
            DataModel.findOne({ id: petKey })
        ]);

        if ((userData?.value || 0) < bet) return interaction.reply({ content: 'コインが足りません！', ephemeral: true });

        let totalMultiplier = 0;
        const pets = petData?.value?.pets || [];
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

        equippedPets.forEach(p => {
            const basePart = Number(p.multiplier || 1) * Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
            let enchantFactor = 1.0;
            if (p.enchant) {
                const type = String(p.enchant.type).toLowerCase();
                const lv = Number(p.enchant.level || 0);
                if (type === 'power') enchantFactor += (lv * 0.2);
                else if (type === 'mimic') enchantFactor += lv;
            }
            totalMultiplier += (basePart * enchantFactor);
        });
        if (totalMultiplier < 1) totalMultiplier = 1.0;

        let res = [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);

        let multi = 0;
        if (res[0] === res[1] && res[1] === res[2]) {
            multi = res[0] === '7️⃣' ? 20 : res[0] === '💎' ? 10 : 5;
        } else if (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) {
            multi = 1.5;
        }

        const win = Math.floor(bet * multi * totalMultiplier);
        const changeAmount = (multi > 0) ? (win - bet) : -bet;

        // 生涯獲得スコアの更新[cite: 5]
        if (changeAmount > 0) {
            await DataModel.findOneAndUpdate({ id: totalEarnedKey }, { $inc: { value: changeAmount } }, { upsert: true });
        }

        const updatedRecord = await DataModel.findOneAndUpdate(
            { id: moneyKey },
            { $inc: { value: changeAmount } },
            { upsert: true, returnDocument: 'after' }
        );

        const embed = new EmbedBuilder()
            .setTitle('🎰 SLOT RESULT')
            .setColor(multi > 0 ? 'Gold' : 'Grey')
            .setDescription([
                `**[ ${res.join(' | ')} ]**`,
                `━━━━━━━━━━━━━━`,
                `ペット合計倍率: **x${totalMultiplier.toFixed(2)}**`,
                `変動: **${changeAmount >= 0 ? "+" : ""}${formatCoin(changeAmount)}** 💰`,
                `現在の残高: **${formatCoin(updatedRecord.value || 0)}** 💰`
            ].join('\n'));

        return interaction.reply({ embeds: [embed] });
    }
};