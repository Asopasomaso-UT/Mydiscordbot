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

// --- 重要: トレード等のセッション管理用Setをここで初期化 ---
client.tradeSessions = new Set(); 

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

// --- 3. コマンド・イベントの読み込み ---
const slashcommandsPath = path.join(__dirname, 'commands');
const slashcommandFiles = fs.readdirSync(slashcommandsPath).filter(file => file.endsWith('.js'));

for (const file of slashcommandFiles) {
    const slashfilePath = path.join(slashcommandsPath, file);
    const command = require(slashfilePath);
    if ('data' in command && 'execute' in command) {
        client.commands.set(command.data.name, command);
    }
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

// --- 4. インタラクション実行処理 (一本化) ---
client.on(Events.InteractionCreate, async interaction => {
    // スラッシュコマンドの処理
    if (interaction.isChatInputCommand()) {
        const command = client.commands.get(interaction.commandName);
        if (!command) return;

        try {
            await command.execute(interaction);
        } catch (error) {
            console.error(`⚠️ コマンド実行エラー [${interaction.commandName}]:`, error);

            const errorMsg = { content: 'コマンドの実行中にエラーが発生しました。', flags: [MessageFlags.Ephemeral] };
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.followUp(errorMsg);
                } else {
                    await interaction.reply(errorMsg);
                }
            } catch (e) { /* 通信エラー時は無視 */ }
        }
    } 
    
    // オートコンプリートの処理
    else if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command || !command.autocomplete) return;

        try {
            await command.autocomplete(interaction);
        } catch (error) {
            console.error(`⚠️ Autocomplete Error [${interaction.commandName}]:`, error);
        }
    }
});

// --- 5. 起動プロセス ---
async function init() {
    await connectDatabase();
    
    // スラッシュコマンドの登録
    require("./deploy-commands.js");
    
    client.login(process.env.TOKEN);
    console.log("🚀 めぐみんBot 起動中...");
}

init();