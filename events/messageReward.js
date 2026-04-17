const { Events } = require('discord.js');

module.exports = {
    name: Events.MessageCreate, // メッセージが送信された時に実行
    once: false,
    async execute(message) {
        // Botの発言やDM、コマンド（先頭が/など）は対象外にする
        if (message.author.bot || !message.guild || message.content.startsWith('/')) return;

        const { client, author, guild } = message;
        const dbKey = `money_${guild.id}_${author.id}`;

        // お金を増やす（10コイン）
        try {
            await client.db.add(dbKey, 10);
            // console.log(`${author.tag} にコインを付与しました`);
        } catch (error) {
            console.error('コイン付与エラー:', error);
        }
    },
};