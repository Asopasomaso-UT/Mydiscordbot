const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin, parseCoin } = require('../utils/formatHelper'); // ユーティリティをインポート

const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('janken')
        .setDescription('コインを賭けてじゃんけん!')
        .addStringOption(option =>
            option.setName('手')
                .setDescription('出す手を選んでください')
                .setRequired(true)
                .addChoices(
                    { name: 'ぐー', value: 'ぐー' },
                    { name: 'ちょき', value: 'ちょき' },
                    { name: 'ぱー', value: 'ぱー' },
                ))
        .addStringOption(option => // IntegerからStringに変更
            option.setName('bet')
                .setDescription('賭ける額を入力 (例: 10000, 1m, 2.5b)')
                .setRequired(true)),

    async execute(interaction) {
        await interaction.deferReply();

        const userChoice = interaction.options.getString('手');
        const betInput = interaction.options.getString('bet');
        const bet = parseCoin(betInput); // 入力文字列を数値に変換

        // バリデーション
        if (isNaN(bet) || bet <= 0) {
            return await interaction.editReply('無効な賭け金です。正数値または単位(m, b等)で入力してください。');
        }

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const moneyKey = `money_${guildId}_${userId}`;
        const totalEarnedKey = `total_earned_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        try {
            const [userData, petData] = await Promise.all([
                DataModel.findOne({ id: moneyKey }),
                DataModel.findOne({ id: petKey })
            ]);

            const currentMoney = userData ? (Number(userData.value) || 0) : 0;
            if (currentMoney < bet) {
                return await interaction.editReply(`コインが足りません！ (残高: **${formatCoin(currentMoney)}** 💰)`);
            }

            // 判定ロジック
            const choices = ['ぐー', 'ちょき', 'ぱー'];
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            let result = (userChoice === botChoice) ? 'draw' : 
                         ((userChoice === 'ぐー' && botChoice === 'ちょき') ||
                          (userChoice === 'ちょき' && botChoice === 'ぱー') ||
                          (userChoice === 'ぱー' && botChoice === 'ぐー')) ? 'win' : 'lose';

            // ペット倍率
            let totalMultiplier = 1.0;
            const pets = petData?.value?.pets || [];
            const equippedIds = petData?.value?.equippedPetIds || [];
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            equippedPets.forEach(p => { totalMultiplier += (p.multiplier - 1); });

            let changeAmount = 0;
            let earnedAmount = 0;
            let resultMessage = "";
            let color = "Grey";

            if (result === 'win') {
                const baseProfit = bet * 2;
                earnedAmount = Math.floor(baseProfit * totalMultiplier);
                changeAmount = earnedAmount;
                resultMessage = totalMultiplier > 1.0 
                    ? `🎉 **勝利！** ペットの加勢(x${totalMultiplier.toFixed(2)})で報酬が増幅！`
                    : `🎉 **勝利！** 報酬を獲得しました！`;
                color = "Gold";
            } else if (result === 'draw') {
                changeAmount = 0;
                resultMessage = `⚖️ **あいこ！** 賭け金が払い戻されました。`;
                color = "Blue";
            } else {
                changeAmount = -bet;
                resultMessage = `💀 **敗北…** 賭け金は没収されました。`;
                color = "Red";
            }

            const updatedRecord = await DataModel.findOneAndUpdate(
                { id: moneyKey },
                { $inc: { value: changeAmount } },
                { upsert: true, returnDocument: 'after' }
            );

            if (earnedAmount > 0) {
                await DataModel.findOneAndUpdate(
                    { id: totalEarnedKey },
                    { $inc: { value: earnedAmount } },
                    { upsert: true }
                );
            }

            const embed = new EmbedBuilder()
                .setTitle('💰 じゃんけん')
                .setColor(color)
                .setDescription([
                    `あなたの手: **${userChoice}**`,
                    `わたしの手: **${botChoice}**`,
                    `━━━━━━━━━━━━━━`,
                    resultMessage,
                    `━━━━━━━━━━━━━━`,
                    `賭け金: **${formatCoin(bet)}**`,
                    `倍率ボーナス: **x${totalMultiplier.toLocaleString()}**`,
                    `変動: **${changeAmount >= 0 ? "+" : ""}${formatCoin(changeAmount)}** 💰`,
                    `現在の残高: **${formatCoin(updatedRecord.value || 0)}** 💰`
                ].join('\n'))
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Janken Error:', error);
            await interaction.editReply('エラーが発生しました。');
        }
    },
};