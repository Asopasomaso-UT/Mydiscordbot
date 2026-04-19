const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// 【重要】DataModel が定義されていないエラーを直すためにモデルを読み込む
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rank')
        .setDescription('自分の現在のレベルとXPを確認します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const levelKey = `level_data_${guildId}_${userId}`;
        
        // データの取得
        const data = await DataModel.findOne({ id: levelKey });
        
        const { level, xp } = data?.value || { level: 1, xp: 0 };
        
        // 次のレベルに必要なXPの計算
        const nextXP = 100 * Math.pow(level, 2);
        
        // 進捗パーセント
        const percent = Math.min(Math.floor((xp / nextXP) * 100), 100);

        // プログレスバーの作成 (10段階)
        const progressIndex = Math.floor(percent / 10);
        const progressBar = '🟩'.repeat(progressIndex) + '⬜'.repeat(10 - progressIndex);

        const embed = new EmbedBuilder()
            .setTitle(`📊 ${interaction.user.username} のランク状況`)
            .setColor('Blue')
            .addFields(
                { name: 'レベル', value: `**Lv. ${level}**`, inline: true },
                { name: '経験値', value: `**${xp.toLocaleString()} / ${nextXP.toLocaleString()}**`, inline: true },
                { name: '進捗', value: `${progressBar} ${percent}%` }
            )
            .setFooter({ text: 'メッセージを送信してXPを獲得しよう！' })
            .setTimestamp();

        // 警告(Warning)対策：そのまま reply すればOK
        await interaction.reply({ embeds: [embed] });
    }
};