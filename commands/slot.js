const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { parseCoin, formatCoin } = require('../utils/formatHelper');

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
        const betInput = interaction.options.getString('bet');
        const bet = parseCoin(betInput);

        if (bet < 100) return interaction.reply({ content: '最低賭け金は 100 💰 です。', ephemeral: true });

        const moneyKey = `money_${guildId}_${userId}`;
        const userData = await DataModel.findOne({ id: moneyKey });
        if ((userData?.value || 0) < bet) return interaction.reply({ content: 'コインが足りません！', ephemeral: true });

        // ペットのMimicボーナス取得
        const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const mimicLevel = (petData?.value?.pets || [])
            .filter(p => equippedIds.includes(String(p.petId)) && p.enchant?.type === 'mimic')
            .reduce((sum, p) => sum + p.enchant.level, 0);

        // スロット回転
        let res = [0, 0, 0].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]);

        // Mimicボーナス (Lv1につき5%でリーチを当たりに書き換え)
        if (mimicLevel > 0 && res[0] === res[1] && res[0] !== res[2]) {
            if (Math.random() < (mimicLevel * 0.05)) res[2] = res[0];
        }

        // 当たり判定
        let multi = 0;
        if (res[0] === res[1] && res[1] === res[2]) {
            multi = res[0] === '7️⃣' ? 20 : res[0] === '💎' ? 10 : 5;
        } else if (res[0] === res[1] || res[1] === res[2] || res[0] === res[2]) {
            multi = 1.5;
        }

        const win = Math.floor(bet * multi);
        await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: win - bet } }, { upsert: true });

        const embed = new EmbedBuilder()
            .setTitle('🎰 SLOT MACHINE')
            .setDescription(`\n　**[ ${res.join(' | ')} ]**\n`)
            .addFields(
                { name: 'BET', value: `${formatCoin(bet)} 💰`, inline: true },
                { name: 'WIN', value: `${formatCoin(win)} 💰`, inline: true }
            )
            .setColor(multi > 0 ? 'Gold' : 'Grey');

        return interaction.reply({ embeds: [embed] });
    }
};