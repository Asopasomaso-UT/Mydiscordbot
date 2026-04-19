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
        .setDescription('コインを賭けてじゃんけん！勝てば3倍！')
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
        const totalEarnedKey = `total_earned_${guildId}_${userId}`; // 累計額用キー

        try {
            // 2. 現在の所持金を確認
            const userData = await DataModel.findOne({ id: moneyKey });
            const currentMoney = userData ? (Number(userData.value) || 0) : 0;

            if (currentMoney < bet) {
                return await interaction.editReply(`コインが足りません！ (現在の所持金: ${currentMoney.toLocaleString()} 💰)`);
            }

            // 3. じゃんけんの判定
            const choices = ['ぐー', 'ちょき', 'ぱー'];
            const botChoice = choices[Math.floor(Math.random() * choices.length)];

            let result = ''; 
            if (userChoice === botChoice) {
                result = 'draw';
            } else if (
                (userChoice === 'ぐー' && botChoice === 'ちょき') ||
                (userChoice === 'ちょき' && botChoice === 'ぱー') ||
                (userChoice === 'ぱー' && botChoice === 'ぐー')
            ) {
                result = 'win';
            } else {
                result = 'lose';
            }

            // 4. 倍率計算とDB更新
            let changeAmount = 0;
            let earnedAmount = 0; // 今回の「純粋な利益」
            let resultMessage = "";
            let color = "Grey";

            if (result === 'win') {
                // 勝ったら3倍（+2倍の純利）
                earnedAmount = bet * 2; 
                changeAmount = earnedAmount;
                resultMessage = `🎉 **勝利！** 賭け金が **3倍** になりました！`;
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

            // --- DB更新処理 ---
            
            // 1. 所持金の更新
            const updatedRecord = await DataModel.findOneAndUpdate(
                { id: moneyKey },
                { $inc: { value: changeAmount } },
                { upsert: true, returnDocument: 'after' }
            );

            // 2. 累計獲得額の更新（勝ったときのみ加算）
            if (earnedAmount > 0) {
                await DataModel.findOneAndUpdate(
                    { id: totalEarnedKey },
                    { $inc: { value: earnedAmount } },
                    { upsert: true, returnDocument: 'after' }
                );
            }

            // 5. 結果表示
            const embed = new EmbedBuilder()
                .setTitle('💰 じゃんけん')
                .setColor(color)
                .setDescription([
                    `あなたの手: **${userChoice}**`,
                    `わたしの手: **${botChoice}**`,
                    `━━━━━━━━━━━━━━`,
                    resultMessage,
                    `━━━━━━━━━━━━━━`,
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