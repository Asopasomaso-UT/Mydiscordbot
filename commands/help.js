const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Botの使いかたとコマンド一覧を表示します'),

    async execute(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 めぐみんBot 使い方ガイド')
            .setDescription('サーバー内通貨とショップ機能を楽しめるBotです！\nチャットをすると少しずつコインが貯まります。')
            .setColor('LuminousVividPink')
            .addFields(
                { name: '💰 通貨・お財布', value: 
                    '• `/balance` - 自分の所持金（または他人の残高）を確認します\n' +
                    '• `/pay` - 他の人にコインを送ります' 
                },
                { name: '🛒 ショップ・持ち物', value: 
                    '• `/shop` - 貯めたコインでロールやアイテムを購入します\n' +
                    '• `/inventory` - 自分が持っているアイテムを確認します' 
                },
                { name: '🎮 ミニゲーム', value: 
                    '• `/janken` - めぐみんとじゃんけんをして遊びます' 
                },
                { name: '🛠️ 管理者専用', value: 
                    '• `/add-money` - 特定のユーザーにコインを付与/没収します' 
                }
            )
            .setFooter({ text: '素敵なDiscordライフを！', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [helpEmbed] });
    },
};