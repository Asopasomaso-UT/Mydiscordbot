const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// スキーマ定義
const dataSchema = new mongoose.Schema({
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
        // 1. 保留応答
        await interaction.deferReply();

        const userChoice = interaction.options.getString('手');
        const bet = interaction.options.getInteger('bet');
        const dbKey = `money_${interaction.guild.id}_${interaction.user.id}`;

        try {
            // 2. 現在の所持金を確認
            const userData = await DataModel.findOne({ id: dbKey });
            const currentMoney = userData ? (Number(userData.value) || 0) : 0;

            if (currentMoney < bet) {
                return await interaction.editReply(`コインが足りません！ (現在の所持金: ${currentMoney} 💰)`);
            }

            // 3. じゃんけんの判定
            const choices = ['ぐー', 'ちょき', 'ぱー'];
            const botChoice = choices[Math.floor(Math.random() * choices.length)];

            let result = ''; // 'win', 'draw', 'lose'
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
            let resultMessage = "";
            let color = "Grey";

            if (result === 'win') {
                // 勝ったら3倍（賭け金を引いてから3倍を加算 = 実質 +2倍）
                changeAmount = bet * 2; 
                resultMessage = `🎉 **勝利！** 賭け金が **3倍** になりました！`;
                color = "Gold";
            } else if (result === 'draw') {
                // あいこは1倍（増減なし）
                changeAmount = 0;
                resultMessage = `⚖️ **あいこ！** 賭け金がそのまま戻ってきました。`;
                color = "Blue";
            } else {
                // 負けたら0倍（全額没収）
                changeAmount = -bet;
                resultMessage = `💀 **敗北…** 賭け金は没収されました。`;
                color = "Red";
            }

            // DB更新
            const updatedRecord = await DataModel.findOneAndUpdate(
                { id: dbKey },
                { $inc: { value: changeAmount } },
                { upsert: true, new: true }
            );

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