const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// スキーマが未定義の場合のみ定義
const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shiritori')
        .setDescription('しりとりを開始します')
        .addStringOption(option => 
            option.setName('difficulty')
                .setDescription('難易度を選択してください')
                .setRequired(true)
                .addChoices(
                    { name: 'EASY (1分/2文字〜/10💰)', value: 'easy' },
                    { name: 'NORMAL (30秒/3文字〜/30💰)', value: 'normal' },
                    { name: 'HARD (10秒/4文字〜/禁止文字あり/100💰)', value: 'hard' }
                )),

    async execute(interaction) {
        await interaction.deferReply();
        const diff = interaction.options.getString('difficulty');
        const dbKey = `shiritori_${interaction.guild.id}_${interaction.channel.id}`;

        const data = {
            lastWord: 'しりとり',
            usedWords: ['しりとり'],
            difficulty: diff,
            count: 0,
            totalGained: 0, // 合計獲得コインの初期値
            lastTimestamp: Date.now()
        };

        await DataModel.findOneAndUpdate({ id: dbKey }, { value: data }, { upsert: true });

        const embed = new EmbedBuilder()
            .setTitle(`🍎 しりとり開始 [${diff.toUpperCase()}]`)
            .setDescription(`**「り」** から始めてください！\n\n【ルール】\n${getRuleText(diff)}`)
            .setColor(diff === 'hard' ? 'Red' : diff === 'normal' ? 'Yellow' : 'Green')
            .setFooter({ text: '※普通のチャットで単語を打ってください' });

        await interaction.editReply({ embeds: [embed] });
    }
};

function getRuleText(diff) {
    if (diff === 'hard') return '⏳ 制限時間: **10秒**\n📏 **4文字以上**\n🚫 **「ー」禁止**\n💎 報酬: **100💰** (10回毎に倍率UP)';
    if (diff === 'normal') return '⏳ 制限時間: **30秒**\n📏 **3文字以上**\n💎 報酬: **30💰** (10回毎に倍率UP)';
    return '⏳ 制限時間: **60秒**\n📏 **2文字以上**\n💎 報酬: **10💰** (10回毎に倍率UP)';
}