const { Events, ActivityType } = require('discord.js');

module.exports = {
    name: Events.ClientReady,
    once: true,
    execute(client) {
        // 1. ログイン成功のログ
        console.log(`ログイン完了: ${client.user.tag}`);

        // 2. 参加サーバー一覧の表示
        console.log("---------- 参加サーバー一覧 ----------");
        const guildsInfo = client.guilds.cache.map(guild => 
            `・${guild.name.padEnd(20)} | 人数: ${String(guild.memberCount).padStart(4)}人 | ID: ${guild.id}`
        ).join("\n");
        
        console.log(guildsInfo || "参加しているサーバーはありません。");
        console.log(`合計サーバー数: ${client.guilds.cache.size}`);
        console.log("--------------------------------------");

        // 3. Botのステータス（アクティビティ）を設定
        // 例: 「〇〇台のサーバーで稼働中！」など
        client.user.setActivity({
            name: `${client.guilds.cache.size} サーバーをエクスプロージョン中！`,
            type: ActivityType.Playing, // Playing(プレイ中), Watching(視聴中) など
        });

        console.log("🚀 めぐみんBot、起動完了しました！");
    },
};