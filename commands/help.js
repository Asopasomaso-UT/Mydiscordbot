const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('help')
        .setDescription('Botの使いかたとコマンド一覧を表示します'),

    async execute(interaction) {
        const helpEmbed = new EmbedBuilder()
            .setTitle('📖 めぐみんBot 使い方ガイド')
            .setDescription('サーバー内通貨とミニゲームが楽しめるBotです！\nチャットをすると少しずつコインが貯まります。')
            .setColor('LuminousVividPink')
            .addFields(
                { name: '💰 通貨システム', value: 
                    '• `/balance` - 所持金を確認します（相手を選べばその人の残高も！）\n' +
                    '• `/pay` - 他の人にコインを送ります\n' +
                    '• `/add-money` - 【管理者】コインを付与/没収します' 
                },
                { name: '🎮 ミニゲーム', value: 
                    '• `/janken` - めぐみんとじゃんけんをします' 
                },
                { name: 'ℹ️ その他', value: 
                    '• `/ping` - Botの反応速度を確認します\n' +
                    '• `/help` - このメニューを表示します' 
                }
            )
            .setFooter({ text: '素敵なDiscordライフを！', iconURL: interaction.client.user.displayAvatarURL() })
            .setTimestamp();

        await interaction.reply({ embeds: [helpEmbed] });
    },
};