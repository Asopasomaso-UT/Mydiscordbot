const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

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

// 1. MongoDB 接続関数 (起動時に1回だけ実行)
async function connectDatabase() {
    try {
        await mongoose.connect(process.env.MONGO_URI);
        console.log("✅ MongoDB (Mongoose) に接続完了！");
    } catch (err) {
        console.error("❌ MongoDB 接続エラー:", err);
        process.exit(1); // 接続できなければ終了
    }
}

// 2. コマンド読み込み
const slashcommandsPath = path.join(__dirname, 'commands');
const slashcommandFiles = fs.readdirSync(slashcommandsPath).filter(file => file.endsWith('.js'));

for (const file of slashcommandFiles) {
    const slashfilePath = path.join(slashcommandsPath, file);
    const command = require(slashfilePath);
    client.commands.set(command.data.name, command);
}

// 3. イベント読み込み (eventsフォルダ内のInteractionCreateなどはここを通る)
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

// 4. スラッシュコマンド実行処理
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
        // 各コマンドファイル側の execute を呼び出す
        await command.execute(interaction);
    } catch (error) {
        console.error("⚠️ Command Execution Error:", error);
        const errorContent = { content: 'コマンド実行中にエラーが発生しました。', flags: [MessageFlags.Ephemeral] };
        
        if (interaction.deferred || interaction.replied) {
            await interaction.followUp(errorContent).catch(() => {});
        } else {
            await interaction.reply(errorContent).catch(() => {});
        }
    }
});

// 5. データベースに接続してから Bot をログインさせる
async function init() {
    await connectDatabase();
    require("./deploy-commands.js"); // コマンド登録
    client.login(process.env.TOKEN);
    console.log("🚀 サーバー起動プロセス完了");
}

init();