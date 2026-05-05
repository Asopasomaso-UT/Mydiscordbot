const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin, parseCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

const RED = '🔴';
const BLACK = '⚫';
const GREEN = '🟢';

module.exports = {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('赤か黒に賭けてルーレットを回します')
        .addStringOption(option => 
            option.setName('bet')
                .setDescription('賭け金 (例: 1k, 10m)')
                .setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = parseCoin(interaction.options.getString('bet'));

        if (isNaN(bet) || bet < 100) return interaction.reply({ content: '有効な賭け金を100以上で入力してください。', ephemeral: true });

        const moneyKey = `money_${guildId}_${userId}`;
        const totalEarnedKey = `total_earned_${guildId}_${userId}`; //[cite: 5]
        const userData = await DataModel.findOne({ id: moneyKey });
        if ((userData?.value || 0) < bet) return interaction.reply({ content: 'コインが足りません！', ephemeral: true });

        const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
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

        const embed = new EmbedBuilder()
            .setTitle('🎡 ROULETTE')
            .setDescription(`賭け金: **${formatCoin(bet)}** 💰\n赤(x2)か黒(x2)を選んでください！`)
            .setColor('Blurple');

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('bet_red').setLabel('赤 (RED)').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('bet_black').setLabel('黒 (BLACK)').setStyle(ButtonStyle.Secondary)
        );

        const msg = await interaction.reply({ embeds: [embed], components: [row], fetchReply: true });
        const collector = msg.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async i => {
            if (i.user.id !== userId) return;
            collector.stop(i.customId);
        });

        collector.on('end', async (collected, reason) => {
            if (reason === 'time') return interaction.editReply({ content: 'タイムアウトしました。', components: [] });

            const userChoice = reason === 'bet_red' ? RED : BLACK;
            const rand = Math.random();
            let resultColor;
            if (rand < 0.05) resultColor = GREEN;
            else if (rand < 0.525) resultColor = RED;
            else resultColor = BLACK;

            const isWin = userChoice === resultColor;
            const multi = isWin ? 2.0 : 0;
            const winAmount = Math.floor(bet * multi * totalMultiplier);
            const changeAmount = isWin ? (winAmount - bet) : -bet;

            // 生涯獲得スコアの更新[cite: 5]
            if (changeAmount > 0) {
                await DataModel.findOneAndUpdate({ id: totalEarnedKey }, { $inc: { value: changeAmount } }, { upsert: true });
            }

            const updatedRecord = await DataModel.findOneAndUpdate(
                { id: moneyKey },
                { $inc: { value: changeAmount } },
                { upsert: true, returnDocument: 'after' }
            );

            const resultEmbed = new EmbedBuilder()
                .setTitle(isWin ? '🎉 WIN!!' : '💀 LOSE...')
                .setColor(isWin ? 'Gold' : 'Red')
                .setDescription([
                    `結果: **${resultColor}** (あなたの予想: ${userChoice})`,
                    `━━━━━━━━━━━━━━`,
                    `ペット倍率: **x${totalMultiplier.toFixed(2)}**`,
                    `配当: **${formatCoin(winAmount)}** 💰`,
                    `現在の残高: **${formatCoin(updatedRecord.value || 0)}** 💰`
                ].join('\n'));

            await interaction.editReply({ embeds: [resultEmbed], components: [] });
        });
    }
};