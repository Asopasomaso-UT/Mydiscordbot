const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// スキーマ定義
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
        .addIntegerOption(option =>
            option.setName('bet')
                .setDescription('賭けるコインの額を入力してください')
                .setRequired(true)
                .setMinValue(1)),

    async execute(interaction) {
        await interaction.deferReply();

        const userChoice = interaction.options.getString('手');
        const bet = interaction.options.getInteger('bet');
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const moneyKey = `money_${guildId}_${userId}`;
        const totalEarnedKey = `total_earned_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        try {
            // 1. 所持金とペットデータの確認
            const [userData, petData] = await Promise.all([
                DataModel.findOne({ id: moneyKey }),
                DataModel.findOne({ id: petKey })
            ]);

            const currentMoney = userData ? (Number(userData.value) || 0) : 0;
            if (currentMoney < bet) {
                return await interaction.editReply(`コインが足りません！ (残高: ${currentMoney.toLocaleString()} 💰)`);
            }

            // 2. じゃんけん判定
            const choices = ['ぐー', 'ちょき', 'ぱー'];
            const botChoice = choices[Math.floor(Math.random() * choices.length)];
            let result = (userChoice === botChoice) ? 'draw' : 
                         ((userChoice === 'ぐー' && botChoice === 'ちょき') ||
                          (userChoice === 'ちょき' && botChoice === 'ぱー') ||
                          (userChoice === 'ぱー' && botChoice === 'ぐー')) ? 'win' : 'lose';

            // 3. ペット倍率の計算
            let totalMultiplier = 1.0;
            const pets = petData?.value?.pets || [];
            const equippedIds = petData?.value?.equippedPetIds || [];
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            equippedPets.forEach(p => {
                totalMultiplier += (p.multiplier - 1);
            });

            // 4. 報酬の計算
            let changeAmount = 0;
            let earnedAmount = 0; // 累計額に加算する分
            let resultMessage = "";
            let color = "Grey";

            if (result === 'win') {
                // 基本の勝ち分（betの2倍）にペット倍率をかける
                const baseProfit = bet * 2;
                earnedAmount = Math.floor(baseProfit * totalMultiplier);
                changeAmount = earnedAmount;
                
                resultMessage = totalMultiplier > 1.0 
                    ? `🎉 **勝利！** ペットの力(x${totalMultiplier.toFixed(2)})で報酬がアップしました！`
                    : `🎉 **勝利！** 報酬を獲得しました！`;
                color = "Gold";
            } else if (result === 'draw') {
                changeAmount = 0;
                resultMessage = `⚖️ **あいこ！** 賭け金がそのまま戻ってきました。`;
                color = "Blue";
            } else {
                changeAmount = -bet;
                resultMessage = `💀 **敗北…** 賭け金は没収されました。`;
                color = "Red";
            }

            // 5. DB更新
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

            // 6. 結果表示
            const embed = new EmbedBuilder()
                .setTitle('💰 じゃんけん')
                .setColor(color)
                .setDescription([
                    `あなたの手: **${userChoice}**`,
                    `わたしの手: **${botChoice}**`,
                    `━━━━━━━━━━━━━━`,
                    resultMessage,
                    `━━━━━━━━━━━━━━`,
                    `倍率ボーナス: **x${totalMultiplier.toLocaleString()}**`,
                    `変動: **${changeAmount >= 0 ? "+" : ""}${changeAmount.toLocaleString()}** 💰`,
                    `現在の残高: **${(updatedRecord.value || 0).toLocaleString()}** 💰`
                ].join('\n'))
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Janken Error:', error);
            await interaction.editReply('エラーが発生しました。');
        }
    },
};