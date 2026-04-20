const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

// --- 1. Bot クライアントの初期化 ---
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

client.commands = new Collection();

// --- 2. MongoDB 接続関数 ---
async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB (Mongoose) に接続完了！");
    } catch (err) {
        console.error("❌ MongoDB 接続エラー:", err);
        process.exit(1);
    }
}

client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.execute(interaction);
        } catch (error) { console.error(error); }
    } 
    // ここを追加！
    else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;
        try {
            await command.autocomplete(interaction);
        } catch (error) { console.error(error); }
    }
});

// --- 3. コマンド・イベントの読み込み ---
const slashcommandsPath = path.join(__dirname, 'commands');
const slashcommandFiles = fs.readdirSync(slashcommandsPath).filter(file => file.endsWith('.js'));

for (const file of slashcommandFiles) {
    const slashfilePath = path.join(slashcommandsPath, file);
    const command = require(slashfilePath);
    client.commands.set(command.data.name, command);
}

const eventsPath = path.join(__dirname, 'events');
const eventsFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventsFiles) {
    const eventfilePath = path.join(eventsPath, file);
    const event = require(eventfilePath);
    if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
    } else {
        client.on(event.name, (...args) => event.execute(...args));
    }
}

// --- 4. スラッシュコマンド実行処理 (ここがエラー回避の肝) ---
client.on(Events.InteractionCreate, async interaction => {
    // スラッシュコマンド以外は無視
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        /**
         * 【重要】
         * ここで interaction.deferReply() を書いてはいけません。
         * 各コマンド (ranking.js, janken.js など) の冒頭にある deferReply と
         * 衝突して 40060 エラーが発生するためです。
         */
        await command.execute(interaction);
        
    } catch (error) {
        console.error(`⚠️ コマンド実行エラー [${interaction.commandName}]:`, error);

        // エラー発生時、まだ返信（または保留）をしていなければ返信する
        const errorMsg = { content: 'コマンドの実行中にエラーが発生しました。', flags: [MessageFlags.Ephemeral] };
        
        try {
            if (interaction.deferred || interaction.replied) {
                await interaction.followUp(errorMsg);
            } else {
                await interaction.reply(errorMsg);
            }
        } catch (e) {
            // Discordとの通信が完全に切れている場合は何もしない
        }
    }
});

// --- 5. 起動プロセス ---
async function init() {
    // データベースに繋いでからログイン
    await connectDatabase();
    
    // スラッシュコマンドの登録 (deploy-commands.js)
    require("./deploy-commands.js");
    
    client.login(process.env.TOKEN);
    console.log("🚀 めぐみんBot 起動中...");
}

init();