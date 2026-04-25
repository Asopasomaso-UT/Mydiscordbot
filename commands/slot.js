const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

const SYMBOLS = ['🍎', '💎', '🌟', '🔔', '🍒', '7️⃣'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('slot')
        .setDescription('コインを賭けてスロットを回します')
        .addIntegerOption(option => 
            option.setName('bet')
                .setDescription('賭ける金額')
                .setRequired(true)
                .setMinValue(100)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = interaction.options.getInteger('bet');
        
        const moneyKey = `money_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        // 1. 所持金チェック
        const userData = await DataModel.findOne({ id: moneyKey });
        const currentMoney = userData?.value || 0;
        if (currentMoney < bet) return interaction.reply({ content: 'コインが足りません！', ephemeral: true });

        // 2. ペットのボーナスチェック (Mimic Lv1につき当選確率アップなど)
        const petData = await DataModel.findOne({ id: petKey });
        const pets = petData?.value?.pets || [];
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));
        
        let mimicBonus = 0;
        equippedPets.forEach(p => {
            if (p.enchant && p.enchant.type === 'mimic') mimicBonus += p.enchant.level;
        });

        // 3. スロット回転 (演出用に少し待つ)
        await interaction.reply({ content: '🎰 スロット回転中...', fetchReply: true });

        const result = [
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)],
            SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]
        ];

        // ミミックボーナスがある場合、一定確率で3つ目を書き換えて「リーチ」を「当たり」にする
        if (mimicBonus > 0 && result[0] === result[1] && result[0] !== result[2]) {
            if (Math.random() < (mimicBonus * 0.05)) result[2] = result[0];
        }

        // 4. 当たり判定
        let multiplier = 0;
        if (result[0] === result[1] && result[1] === result[2]) {
            if (result[0] === '7️⃣') multiplier = 15;
            else if (result[0] === '💎') multiplier = 8;
            else multiplier = 5;
        } else if (result[0] === result[1] || result[1] === result[2] || result[0] === result[2]) {
            multiplier = 1.5; // 2つ揃い
        }

        const winAmount = Math.floor(bet * multiplier);
        const change = winAmount - bet;

        // 5. DB更新
        await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: change } }, { upsert: true });

        const embed = new EmbedBuilder()
            .setTitle('🎰 SLOT RESULT 🎰')
            .setDescription(`\n　**[ ${result.join(' | ')} ]**\n`)
            .setColor(multiplier > 0 ? 'Gold' : 'Grey')
            .addFields(
                { name: '賭け金', value: `${bet.toLocaleString()} 💰`, inline: true },
                { name: '配当', value: `${winAmount.toLocaleString()} 💰`, inline: true }
            );

        if (multiplier > 0) embed.setFooter({ text: 'おめでとうございます！🎉' });
        
        return interaction.editReply({ content: '', embeds: [embed] });
    }
};