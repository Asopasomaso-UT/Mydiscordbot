const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');
const { QuickMongo } = require('quickmongo');

// データベース接続（RailwayのVariablesから読み込み）
// v5では { QuickMongo } としてインポートし、new QuickMongo() する必要があります
const mongo = new QuickMongo(process.env.MONGO_URI);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventry')
        .setDescription('自分の持ち物を確認します'),

    async execute(interaction) {
        // 1. タイムアウト（3秒ルール）を回避
        // flags を使って最新の書き方に修正 (ephemeral の警告を消す)
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        try {
            // 2. データベースの準備（接続確認）
            if (!mongo.connected) {
                await mongo.connect();
            }

            // 3. データの取得
            // ユーザーIDに基づいたキーで取得
            const inventory = await mongo.get(`inventory_${interaction.user.id}`);

            // 4. データがない場合
            if (!inventory || (Array.isArray(inventory) && inventory.length === 0)) {
                return await interaction.editReply({
                    content: '持ち物は何もありません。'
                });
            }

            // 5. 表示用エンベッドの作成
            const embed = new EmbedBuilder()
                .setTitle(`🎒 ${interaction.user.username} のインベントリ`)
                .setColor(0x00AE86)
                .setTimestamp();

            // データが配列の場合と文字列の場合、両方に対応
            let itemList = "";
            if (Array.isArray(inventory)) {
                itemList = inventory.join('\n');
            } else if (typeof inventory === 'object') {
                // オブジェクト（アイテム名: 個数）形式の場合
                itemList = Object.entries(inventory)
                    .map(([name, count]) => `・**${name}**: ${count}個`)
                    .join('\n');
            } else {
                itemList = String(inventory);
            }

            embed.setDescription(itemList || "表示できるアイテムがありません。");

            // 6. 結果を返信 (deferReplyしているので editReply)
            await interaction.editReply({
                embeds: [embed]
            });

        } catch (error) {
            console.error('Inventory Error:', error);
            
            // エラー時もユーザーに通知
            await interaction.editReply({
                content: 'データの取得中にエラーが発生しました。データベースの設定を確認してください。'
            });
        }
    },
};