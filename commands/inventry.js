const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { QuickMongo } = require('quickmongo');

// MONGO_URI は Railway の Variables から読み込まれます
const mongo = new QuickMongo(process.env.MONGO_URI);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventry') // ※コマンド名は小文字である必要があります
        .setDescription('自分の持ち物を確認します'),

    async execute(interaction) {
        // 1. 最初に「考え中...」状態を作る（3秒ルールを回避）
        // 修正ポイント: flags を使用して警告を回避
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // 2. データベースからデータを取得
            // interaction.user.id を使ってユーザーごとのデータを特定
            const inventory = await mongo.get(`inventory_${interaction.user.id}`);

            // 持ち物データがない場合の処理
            if (!inventory || inventory.length === 0) {
                return await interaction.editReply({
                    content: '持ち物は何もありません。'
                });
            }

            // 3. 表示用のエンベッドを作成
            const embed = new EmbedBuilder()
                .setTitle(`${interaction.user.username}のインベントリ`)
                .setColor(0x00AE86)
                .setTimestamp();

            // ここでは inventory が配列であることを想定した例です
            // あなたのDB構造に合わせて調整してください
            const itemList = Array.isArray(inventory) 
                ? inventory.join('\n') 
                : 'データ形式が正しくありません。';

            embed.setDescription(itemList);

            // 4. editReply で結果を表示
            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('Inventory Error:', error);
            
            // エラー時も editReply で通知
            await interaction.editReply({
                content: 'データの取得中にエラーが発生しました。'
            });
        }
    },
};