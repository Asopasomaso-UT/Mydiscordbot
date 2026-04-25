const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { parseCoin, formatCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

const SYMBOLS = ['🍎', '💎', '🌟', '🔔', '🍒', '7️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slot')
        .setDescription('コインを賭けてスロットを回します（ペットブースト対応）')
        .addStringOption(option => 
            option.setName('bet')
                .setDescription('賭け金 (例: 100, 1m, 10b)')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const betInput = interaction.options.getString('bet');
        const bet = parseCoin(betInput);

        if (bet < 100) return interaction.reply({ content: '最低賭け金は 100 💰 です。', ephemeral: true });

        const moneyKey = `money_${guildId}_${userId}`;
        const userData = await DataModel.findOne({ id: moneyKey });
        const currentBalance = userData?.value || 0;

        if (currentBalance < bet) {
            return interaction.reply({ content: `コインが足りません！ (所持: ${formatCoin(currentBalance)})`, ephemeral: true });
        }

        // --- ペット倍率の計算 ---
        const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
        let totalMultiplier = 1.0;
        const pets = petData?.value?.pets || [];
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

        equippedPets.forEach(p => {
            const evoMulti = Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
            let enchantBoost = 0;
            if (p.enchant) {
                const lv = Number(p.enchant.level || 0);
                if (p.enchant.type === 'power') enchantBoost += (lv * 0.2);
                if (p.enchant.type === 'mimic') enchantBoost += (lv * 1.0);
            }
            totalMultiplier += (evoMulti - 1) + enchantBoost;
        });
        if (totalMultiplier < 1) totalMultiplier = 1.0;

        // スロット回転
        let res = [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);

        // 当たり判定
        let multi = 0;
        if (res[0] === res[1] && res[1] === res[2]) {
            if (res[0] === '7️⃣') multi = 20;
            else if (res[0] === '💎') multi = 10;
            else multi = 5;
        } else if (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) {
            multi = 1.5;
        }

        // 最終報酬計算
        const win = Math.floor(bet * multi * totalMultiplier);
        const balanceChange = (multi > 0) ? (win - bet) : -bet;

        await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: balanceChange } }, { upsert: true });

        const embed = new EmbedBuilder()
            .setTitle('🎰 SLOT MACHINE')
            .setDescription(`\n　**[ ${res.join(' | ')} ]**\n`)
            .addFields(
                { name: 'BET', value: `${formatCoin(bet)} 💰`, inline: true },
                { name: 'WIN', value: `${formatCoin(win)} 💰`, inline: true },
                { name: 'Multiplier', value: `x${totalMultiplier.toFixed(2)}`, inline: true }
            )
            .setColor(multi > 0 ? 'Gold' : 'Grey')
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};