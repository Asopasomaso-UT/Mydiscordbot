const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// Mongoose スキーマ定義
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
        // 1. 応答を保留する（3秒ルール回避）
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const { guild } = interaction;
        const targetUser = interaction.options.getUser('target');
        const amount = interaction.options.getInteger('amount');
        
        const dbKey = `money_${guild.id}_${targetUser.id}`;

        try {
            // MongoDB 接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // 2. 現在の残高を取得して計算
            const record = await DataModel.findOne({ id: dbKey });
            const currentBalance = record ? (Number(record.value) || 0) : 0;
            const newBalance = currentBalance + amount;

            // 3. データベースを更新
            await DataModel.findOneAndUpdate(
                { id: dbKey },
                { value: newBalance },
                { upsert: true }
            );

            const embed = new EmbedBuilder()
                .setTitle('💰 コイン付与完了')
                .setDescription(`${targetUser.username} に **${amount.toLocaleString()}** コインを付与しました。`)
                .addFields({ name: '現在の残高', value: `**${newBalance.toLocaleString()}** コイン` })
                .setColor('Green')
                .setTimestamp();

            // 4. deferReply しているので editReply で送信
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Addmoney Error:', error);
            await interaction.editReply({ content: 'データの付与中にエラーが発生しました。' });
        }
    },
};