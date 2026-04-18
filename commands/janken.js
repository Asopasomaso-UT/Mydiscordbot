const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

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
        // ★最優先: 即座に保留応答を返す（3秒ルールの回避）
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
            // main.js で接続済みなので、ここではチェックを省いて即座にDB操作
            if (result === '勝ち！') {
                const reward = Math.floor(Math.random() * (200 - 100 + 1)) + 100;
                const dbKey = `money_${interaction.guild.id}_${interaction.user.id}`;

                // 金額を加算
                const record = await DataModel.findOneAndUpdate(
                    { id: dbKey },
                    { $inc: { value: reward } }, // 直接加算することで処理を高速化
                    { upsert: true, new: true }
                );

                embed.setDescription(`あなたの手: **${userChoice}**\nわたしの手: **${botChoice}**\n結果: **${result}**\n\n💰 **${reward}** コイン獲得！\n現在の残高: **${record.value}**`);
            } else {
                embed.setDescription(`あなたの手: **${userChoice}**\nわたしの手: **${botChoice}**\n結果: **${result}**`);
            }

            // 最後に応答を更新
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error(error);
            await interaction.editReply('データの更新中にエラーが発生しました。');
        }
    },
};