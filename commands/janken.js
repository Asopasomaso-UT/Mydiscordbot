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
        const userId = user.id; // ルーレットと同様に変数を定義
        const guildId = guild.id;
        
        const moneyKey = `money_${guildId}_${userId}`;
        const totalEarnedKey = `total_earned_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;
        const dailyKey = `daily_quest_${guildId}_${userId}`;

        const petData = await DataModel.findOne({ id: petKey });
        const moneyData = await DataModel.findOne({ id: moneyKey });

        if ((moneyData?.value || 0) < bet) return await interaction.editReply('コインが足りません。');

        const pets = petData?.value?.pets || [];
        const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
        const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

        // --- ペットの倍率計算 (roulette.jsの形を参考に復元) ---
        let totalMultiplier = 1.0;
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

        // パワーポーション補正
        const powerBuffEnd = petData?.value?.buffs?.power || 0;
        const isPowerActive = powerBuffEnd > Date.now();
        if (isPowerActive) {
            totalMultiplier *= 1.5;
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

            // デイリークエスト進捗
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
                `ペット合計倍率: **x${totalMultiplier.toFixed(2)}**${isPowerActive ? ' (💪Potion!)' : ''}`,
                `変動: **${changeAmount >= 0 ? "+" : ""}${formatCoin(changeAmount)}** 💰`,
                `現在の残高: **${formatCoin(updatedRecord.value || 0)}** 💰`
            ].join('\n'));

        await interaction.editReply({ embeds: [embed] });
    }
};