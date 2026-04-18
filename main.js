const { Client, Collection, Events, GatewayIntentBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose'); // Mongoose に変更
require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
    ],
});

// --- MongoDB (Mongoose) 接続設定 ---
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://xzdcn305_db_user:LletIxHe67fofiIs@cluster0.xi1v4yj.mongodb.net/?appName=Cluster0";

(async () => {
    try {
        // Mongoose での接続
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB (Mongoose) に接続完了！");
    } catch (err) {
        console.error("MongoDB 接続エラー:", err);
    }
})();

// --- コマンド登録・読み込み ---
require("./deploy-commands.js");

client.commands = new Collection();
const slashcommandsPath = path.join(__dirname, 'commands');
const slashcommandFiles = fs.readdirSync(slashcommandsPath).filter(file => file.endsWith('.js'));

for (const file of slashcommandFiles) {
    const slashfilePath = path.join(slashcommandsPath, file);
    const command = require(slashfilePath);
    console.log(`-> [Loaded Command] ${file.split('.')[0]}`);
    client.commands.set(command.data.name, command);
}

// --- イベント読み込み ---
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
    console.log(`-> [Loaded Event] ${file.split('.')[0]}`);
}

// --- インタラクション (コマンド実行) 処理 ---
client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const command = client.commands.get(interaction.commandName);

    if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        // 未返信の場合のみ reply する
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'コマンドが見つかりません', flags: [MessageFlags.Ephemeral] });
        }
        return;
    }

    try {
        await command.execute(interaction);
    } catch (error) {
        console.error("Command Execution Error:", error);
        
        const errorContent = { content: 'コマンドの実行中にエラーが発生しました。', flags: [MessageFlags.Ephemeral] };
        
        // 【重要】二重返信 (already acknowledged) エラーを防止
        if (interaction.deferred || interaction.replied) {
            // すでに deferReply や reply 済みの場合は followUp (または editReply)
            await interaction.followUp(errorContent);
        } else {
            // まだ何も返していない場合は reply
            await interaction.reply(errorContent);
        }
    }
});

client.login(process.env.TOKEN);