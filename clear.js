require('dotenv').config();
const { REST, Routes } = require('discord.js');
const { clientId, guildId } = require('./config.json');

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
    try {
        console.log('現在登録されているすべてのコマンドを強制削除します...');

        // 1. サーバー固有のコマンドを削除
        await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        console.log('✅ サーバー固有のコマンドを削除しました。');

        // 2. グローバル（全体）のコマンドを削除
        await rest.put(Routes.applicationCommands(clientId), { body: [] });
        console.log('✅ グローバルのコマンドを削除しました。');

        console.log('お掃除が完了しました！Discordを Ctrl+R でリロードして確認してください。');
    } catch (error) {
        console.error('エラーが発生しました:', error);
    }
})();