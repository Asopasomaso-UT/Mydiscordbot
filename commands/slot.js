const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { parseCoin, formatCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

const SYMBOLS = ['🍎', '💎', '🌟', '🔔', '🍒', '7️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slot')
        .setDescription('コインを賭けてスロットを回します')
        .addStringOption(option => 
            option.setName('bet')
                .setDescription('賭け金 (例: 100, 1m, 10b)')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = parseCoin(interaction.options.getString('bet'));

        if (bet < 100) return interaction.reply({ content: '最低賭け金は 100 💰 です。', ephemeral: true });

        const moneyKey = `money_${guildId}_${userId}`;
        const userData = await DataModel.findOne({ id: moneyKey });
        if ((userData?.value || 0) < bet) return interaction.reply({ content: 'コインが足りません！', ephemeral: true });

        // --- 統合倍率計算 (ペット基礎 + クラフト進化 + エンチャント) ---
        const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
        let totalMultiplier = 1.0; 
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = (petData?.value?.pets || []).filter(p => equippedIds.includes(String(p.petId)));

        equippedPets.forEach(p => {
            // 1. もともとのペット倍率
            const baseMulti = Number(p.multiplier || 1.0);
            // 2. クラフト（進化レベル）による倍率
            const evoMulti = Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1.0);
            
            // 3. エンチャントによる加算
            let enchantBoost = 0;
            if (p.enchant) {
                const lv = Number(p.enchant.level || 0);
                if (p.enchant.type === 'power') enchantBoost += (lv * 0.2);
                if (p.enchant.type === 'mimic') enchantBoost += (lv * 1.0);
            }

            // 合算ロジック: (基礎倍率 * 進化倍率) + エンチャント
            // ※ -1.0 はベースの1倍が重複しないための調整
            totalMultiplier += (baseMulti * evoMulti - 1.0) + enchantBoost;
        });
        if (totalMultiplier < 1) totalMultiplier = 1.0;

        // スロット回転とMimic処理
        let res = [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);
        
        // Mimicボーナス (装備ペットの中にMimicがいればリーチを当たりに変える)
        const hasMimic = equippedPets.some(p => p.enchant?.type === 'mimic');
        if (hasMimic && res[0] === res[1] && res[0] !== res[2]) {
            if (Math.random() < 0.2) res[2] = res[0]; // 固定20%またはレベル依存
        }

        let multi = 0;
        if (res[0] === res[1] && res[1] === res[2]) {
            multi = res[0] === '7️⃣' ? 20 : res[0] === '💎' ? 10 : 5;
        } else if (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) {
            multi = 1.5;
        }

        const win = Math.floor(bet * multi * totalMultiplier);
        const balanceChange = (multi > 0) ? (win - bet) : -bet;
        await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: balanceChange } }, { upsert: true });

        const embed = new EmbedBuilder()
            .setTitle('🎰 SLOT RESULT')
            .setDescription(`\n　**[ ${res.join(' | ')} ]**\n`)
            .addFields(
                { name: 'BET', value: `${formatCoin(bet)} 💰`, inline: true },
                { name: 'WIN', value: `${formatCoin(win)} 💰`, inline: true },
                { name: 'Total Boost', value: `x${totalMultiplier.toFixed(2)}`, inline: true }
            )
            .setColor(multi > 0 ? 'Gold' : 'Grey');

        return interaction.reply({ embeds: [embed] });
    }
};