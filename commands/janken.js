const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

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

        // 勝利時の報酬処理
        if (result === '勝ち！') {
            const reward = Math.floor(Math.random() * (200 - 1 + 1)) + 100;
            const dbKey = `money_${interaction.guild.id}_${interaction.user.id}`;
            
            await interaction.client.db.add(dbKey, reward);

            embed.setDescription(`あなたの出し手: **${userChoice}**\nわたしの出し手: **${botChoice}**\n結果: **${result}**\n\n💰 **${reward}** コインを手に入れました！`);
        } else {
            embed.setDescription(`あなたの出し手: **${userChoice}**\nわたしの出し手: **${botChoice}**\n結果: **${result}**`);
        }

        await interaction.reply({ embeds: [embed] });
    },
};