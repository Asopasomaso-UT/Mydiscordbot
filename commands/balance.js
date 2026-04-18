// 1. MessageFlags を忘れずにインポート
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');

// 2. Mongoose スキーマ定義 (QuickMongoのデータを読み込む設定)
const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('所持コインを確認します')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('確認したいユーザーを選択（空欄なら自分）')
                .setRequired(false)
        ),

    async execute(interaction) {
        // 3. deferReply を使用し、flags を正しく設定
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        
        const { guild } = interaction;

        try {
            // MongoDB 接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            const targetUser = interaction.options.getUser('target') || interaction.user;
            
            // QuickMongoが使用していたキーの形式に合わせる
            // ※以前のコードが `money_${guild.id}_${targetUser.id}` だった場合
            const dbKey = `money_${guild.id}_${targetUser.id}`;

            // 4. Mongoose でデータを取得
            const result = await DataModel.findOne({ id: dbKey });
            const balance = result ? (Number(result.value) || 0) : 0;

            const embed = new EmbedBuilder()
                .setTitle(`${targetUser.username} のお財布`)
                .setDescription(`現在の所持金: **${balance.toLocaleString()}** コイン 💰`)
                .setColor(targetUser.id === interaction.user.id ? 'Gold' : 'Blue')
                .setThumbnail(targetUser.displayAvatarURL())
                .setTimestamp();

            // 5. 重要：deferReply の後は reply ではなく editReply を使う
            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Balance Command Error:', error);
            // エラー時も editReply
            await interaction.editReply({ content: 'データの取得中にエラーが発生しました。' });
        }
    },
};