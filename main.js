const { Client, Collection, Events, GatewayIntentBits } = require('discord.js');
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

require('dotenv').config();
const fs = require('node:fs');
const path = require('node:path');
const { Database } = require('quickmongo'); 

// ... (clientの設定など)

// MongoDBに接続
// 第1引数にMongoDBの接続文字列、第2引数（任意）にオプションを入れます
const db = new Database("mongodb+srv://xzdcn305_db_user:LletIxHe67fofiIs@cluster0.xi1v4yj.mongodb.net/?appName=Cluster0");

(async () => {
    try {
        await db.connect();
        console.log("MongoDBに接続完了！");
        client.db = db; // これで今まで通り client.db.set() などが使えます
    } catch (err) {
        console.error("MongoDB接続エラー:", err);
    }
})();

client.db = db;

//-----------commands------------

require("./deploy-commands.js");

//--------------------コマンドを読み込む--------------------------
//スラッシュコマンド
client.commands = new Collection();
const slashcommandsPath = path.join(__dirname, 'commands');
const slashcommandFiles = fs.readdirSync(slashcommandsPath).filter(file => file.endsWith('.js'));

for (const file of slashcommandFiles) {
	const slashfilePath = path.join(slashcommandsPath, file);
	const command = require(slashfilePath);
  console.log(`-> [Loaded Command] ${file.split('.')[0]}`);
	client.commands.set(command.data.name, command);
}

//イベントコマンド
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

client.on(Events.InteractionCreate, async interaction => {
	if (!interaction.isChatInputCommand()) return;

	const command = interaction.client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}

	try {
		await command.execute(interaction);
	} catch (error) {
		console.error(error);
		await interaction.reply({ content: 'コマンドがありません', ephemeral: true });
	}
});

client.login(process.env.TOKEN);