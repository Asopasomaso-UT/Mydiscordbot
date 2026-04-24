const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin, parseCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data'); // 進化データをインポート

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('janken')
        .setDescription('コインを賭けてじゃんけん!')
        .addStringOption(option =>
            option.setName('手').setDescription('出す手を選んでください').setRequired(true)
                .addChoices({ name: 'ぐー', value: 'ぐー' }, { name: 'ちょき', value: 'ちょき' }, { name: 'ぱー', value: 'ぱー' }))
        .addStringOption(option =>
            option.setName('bet').setDescription('賭ける額を入力 (例: 1m, 2.5b)').setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const userChoice = interaction.options.getString('手');
        const betInput = interaction.options.getString('bet');
        const bet = parseCoin(betInput);

        if (isNaN(bet) || bet <= 0) return await interaction.editReply('無効な賭け金です。');

        const { guild, user } = interaction;
        const moneyKey = `money_${guild.id}_${user.id}`;
        const totalEarnedKey = `total_earned_${guild.id}_${user.id}`;
        const petKey = `pet_data_${guild.id}_${user.id}`;

        try {
            const [userData, petData] = await Promise.all([
                DataModel.findOne({ id: moneyKey }),
                DataModel.findOne({ id: petKey })
            ]);

            const currentMoney = userData ? (Number(userData.value) || 0) : 0;
            if (currentMoney < bet) return await interaction.editReply(`コインが足りません！`);

            // じゃんけん判定
            const choices = ['ぐー', 'ちょき', 'ぱー'];
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            let result = (userChoice === botChoice) ? 'draw' : 
                         ((userChoice === 'ぐー' && botChoice === 'ちょき') ||
                          (userChoice === 'ちょき' && botChoice === 'ぱー') ||
                          (userChoice === 'ぱー' && botChoice === 'ぐー')) ? 'win' : 'lose';

            // --- 【重要】合計倍率の計算修正 ---
            let totalMultiplier = 0;
            const pets = petData?.value?.pets || [];
            const equippedIds = petData?.value?.equippedPetIds || [];
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));

        equippedPets.forEach(p => {
            // 1. 基本種族倍率 × 進化倍率 (Golden/Shiny/Neon)
            let petMult = (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
    
            // 2. エンチャント補正
            if (p.enchant) {
                if (p.enchant.type === 'power') {
                    // Power: 1Lvにつき +20%
                    petMult *= (1 + (p.enchant.level * 0.2));
            } else if (p.enchant.type === 'mimic') {
                    // Mimic: 1Lvにつき +100% (2倍, 3倍, 4倍...と増える)
                    // 伝説級にふさわしい超強力な補正
                    petMult *= (1 + p.enchant.level); 
                }
            }
    
            totalMultiplier += petMult;
        });
            if (totalMultiplier < 1) totalMultiplier = 1.0; 

            let changeAmount = 0;
            let earnedAmount = 0;
            let color = "Grey";

            if (result === 'win') {
                // 勝利報酬: 賭け金×2倍 × ペット合計倍率
                const baseProfit = bet * 2;
                earnedAmount = Math.floor(baseProfit * totalMultiplier);
                changeAmount = earnedAmount;
                color = "Gold";
            } else if (result === 'draw') {
                changeAmount = 0;
                color = "Blue";
            } else {
                changeAmount = -bet;
                color = "Red";
            }

            const updatedRecord = await DataModel.findOneAndUpdate(
                { id: moneyKey },
                { $inc: { value: changeAmount } },
                { upsert: true, returnDocument: 'after' }
            );

            if (earnedAmount > 0) {
                await DataModel.findOneAndUpdate({ id: totalEarnedKey }, { $inc: { value: earnedAmount } }, { upsert: true });
            }

            const embed = new EmbedBuilder()
                .setTitle('💰 じゃんけん結果')
                .setColor(color)
                .setDescription([
                    `あなたの手: **${userChoice}** | わたしの手: **${botChoice}**`,
                    `━━━━━━━━━━━━━━`,
                    `結果: **${result === 'win' ? '勝ち！' : result === 'draw' ? 'あいこ' : '負け...'}**`,
                    `ペット合計倍率: **x${totalMultiplier.toFixed(2)}**`,
                    `変動: **${changeAmount >= 0 ? "+" : ""}${formatCoin(changeAmount)}** 💰`,
                    `現在の残高: **${formatCoin(updatedRecord.value || 0)}** 💰`
                ].join('\n'));

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('エラーが発生しました。');
        }
    },
};