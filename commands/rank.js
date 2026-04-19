// commands/rank.js
const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('自分の現在のレベルとXPを確認します'),

    async execute(interaction) {
        const levelKey = `level_data_${interaction.guild.id}_${interaction.user.id}`;
        const data = await DataModel.findOne({ id: levelKey });
        
        const { level, xp } = data?.value || { level: 1, xp: 0 };
        const nextXP = 100 * Math.pow(level, 2);
        const percent = Math.floor((xp / nextXP) * 100);

        // プログレスバーの作成
        const progressBar = '🟩'.repeat(Math.floor(percent / 10)) + '⬜'.repeat(10 - Math.floor(percent / 10));

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${interaction.user.username} のランク状況`)
            .setColor('Blue')
            .addFields(
                { name: 'レベル', value: `**Lv. ${level}**`, inline: true },
                { name: '経験値', value: `**${xp.toLocaleString()} / ${nextXP.toLocaleString()}**`, inline: true },
                { name: '進捗', value: `${progressBar} ${percent}%` }
            )
            .setFooter({ text: 'メッセージを送信してXPを獲得しよう！' });

        await interaction.reply({ embeds: [embed] });
    }
};