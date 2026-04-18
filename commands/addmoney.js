const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// スキーマ定義
const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('addmoney')
        .setDescription('【管理者用】指定したユーザーにコインを付与します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('コインを付与するユーザー')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('付与する金額（マイナスも可能）')
                .setRequired(true)
                .setMinValue(-1000000)
                .setMaxValue(1000000)
        ),

    async execute(interaction) {
        // ★最速で保留応答を返す
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { guild } = interaction;
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        const dbKey = `money_${guild.id}_${targetUser.id}`;

        try {
            // MongoDB の接続チェックは main.js に任せて削除

            // $inc を使い、1回の通信で「加算」と「結果取得」を同時に行う
            const record = await DataModel.findOneAndUpdate(
                { id: dbKey },
                { $inc: { value: amount } }, // value を amount 分増やす
                { upsert: true, new: true }   // なければ作成し、更新後のデータを返す
            );

            const newBalance = record.value || 0;

            const embed = new EmbedBuilder()
                .setTitle('💰 コイン付与完了')
                .setDescription(`${targetUser.username} に **${amount.toLocaleString()}** コインを付与しました。`)
                .addFields({ name: '現在の残高', value: `**${newBalance.toLocaleString()}** コイン` })
                .setColor('Green')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Addmoney Error:', error);
            // deferReply 済みなので editReply でエラー通知
            await interaction.editReply({ content: 'コインの付与処理中にエラーが発生しました。' });
        }
    },
};