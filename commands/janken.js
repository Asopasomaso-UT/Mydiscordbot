const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// Mongoose スキーマ定義
const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('janken')
        .setDescription('じゃんけんぽん！！')
        .addStringOption(option =>
            option.setName('手')
                .setDescription('出す手を選んでください')
                .setRequired(true)
                .addChoices(
                    { name: 'ぐー', value: 'ぐー' },
                    { name: 'ちょき', value: 'ちょき' },
                    { name: 'ぱー', value: 'ぱー' },
                )),

    async execute(interaction) {
        // 1. 最初に「考え中」を作る (3秒制限を回避)
        await interaction.deferReply();

        const userChoice = interaction.options.getString('手');
        const choices = ['ぐー', 'ちょき', 'ぱー'];
        const botChoice = choices[Math.floor(Math.random() * choices.length)];

        let result = '';
        if (userChoice === botChoice) {
            result = '引き分け！';
        } else if (
            (userChoice === 'ぐー' && botChoice === 'ちょき') ||
            (userChoice === 'ちょき' && botChoice === 'ぱー') ||
            (userChoice === 'ぱー' && botChoice === 'ぐー')
        ) {
            result = '勝ち！';
        } else {
            result = '負け…';
        }

        const embed = new EmbedBuilder()
            .setTitle('じゃんけん結果')
            .setColor(result === '勝ち！' ? 'Yellow' : 'Red')
            .setTimestamp();

        try {
            // MongoDB 接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            if (result === '勝ち！') {
                const reward = Math.floor(Math.random() * (200 - 100 + 1)) + 100;
                const dbKey = `money_${interaction.guild.id}_${interaction.user.id}`;

                // --- Mongoose で金額を加算する処理 ---
                const record = await DataModel.findOne({ id: dbKey });
                const currentBalance = record ? Number(record.value) || 0 : 0;
                const newBalance = currentBalance + reward;

                await DataModel.findOneAndUpdate(
                    { id: dbKey },
                    { value: newBalance },
                    { upsert: true }
                );

                embed.setDescription(`あなたの出し手: **${userChoice}**\nわたしの出し手: **${botChoice}**\n結果: **${result}**\n\n💰 **${reward}** コインを手に入れました！\n現在の残高: **${newBalance}**`);
            } else {
                embed.setDescription(`あなたの出し手: **${userChoice}**\nわたしの出し手: **${botChoice}**\n結果: **${result}**`);
            }

            // 2. deferReply しているので最後は editReply にする
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('データの更新中にエラーが発生しました。');
        }
    },
};