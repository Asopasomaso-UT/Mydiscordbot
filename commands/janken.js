const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin, parseCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

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
        const petKey = `pet_data_${guild.id}_${userId}`; // userId に修正
        const dailyKey = `daily_quest_${guild.id}_${user.id}`;

        const petData = await DataModel.findOne({ id: petKey });
        const moneyData = await DataModel.findOne({ id: moneyKey });

        if ((moneyData?.value || 0) < bet) return await interaction.editReply('コインが足りません。');

        const pets = petData?.value?.pets || [];
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

        // --- ペットの倍率計算 (エンチャント仕様を復元) ---
        let totalMultiplier = 1.0;
        equippedPets.forEach(p => {
            let mult = p.multiplier || 1.0;
            
            // 1. 進化レベルによる補正 (既存仕様)
            if (p.evoLevel === 1) mult *= 1.5;
            if (p.evoLevel === 2) mult *= 2.5;
            if (p.evoLevel === 3) mult *= 5.0;

            // 2. エンチャントによる補正 (復元)
            if (p.enchant) {
                if (p.enchant.type === 'power') {
                    // Power Lv.1ごとに+10%
                    mult *= (1 + (p.enchant.level * 0.1));
                }
                if (p.enchant.type === 'mimic') {
                    // Mimic Lv.1ごとに+25% (非常に強力なエンチャント)
                    mult *= (1 + (p.enchant.level * 0.25));
                }
            }
            
            // 各ペットの増加分 (mult - 1) を合計に加算
            totalMultiplier += (mult - 1);
        });

        // --- パワーポーション(power_potion)の補正を追加 ---
        const powerBuffEnd = petData?.value?.buffs?.power || 0;
        const isPowerActive = powerBuffEnd > Date.now();
        if (isPowerActive) {
            totalMultiplier *= 1.5; // ポーション効果で最終倍率を1.5倍に
        }

        const choices = ['ぐー', 'ちょき', 'ぱー'];
        const botChoice = choices[Math.floor(Math.random() * 3)];

        let result = "";
        if (userChoice === botChoice) result = 'draw';
        else if (
            (userChoice === 'ぐー' && botChoice === 'ちょき') ||
            (userChoice === 'ちょき' && botChoice === 'ぱー') ||
            (userChoice === 'ぱー' && botChoice === 'ぐー')
        ) result = 'win';
        else result = 'lose';

        let changeAmount = 0;
        let earnedAmount = 0;
        let color = "Grey";

        if (result === 'win') {
            earnedAmount = Math.floor(bet * totalMultiplier);
            changeAmount = earnedAmount;
            color = "Gold";

            // デイリークエスト進捗加算 (勝利時)
            await DataModel.findOneAndUpdate(
                { id: dailyKey },
                { $inc: { 'value.rps': 1 } },
                { upsert: true }
            );
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
                `ペット合計倍率: **x${totalMultiplier.toFixed(2)}**${isPowerActive ? ' (💪Potion Active!)' : ''}`,
                `変動: **${changeAmount >= 0 ? "+" : ""}${formatCoin(changeAmount)}** 💰`,
                `現在の残高: **${formatCoin(updatedRecord.value || 0)}** 💰`
            ].join('\n'));

        await interaction.editReply({ embeds: [embed] });
    }
};