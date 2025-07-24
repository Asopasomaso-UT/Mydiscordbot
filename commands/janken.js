const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
  data: new SlashCommandBuilder()
		.setName('janken')
		.setDescription('じゃんけんぽん！！！'),
	
		async execute(interaction) {
		const filter = response => {
			return interaction.user.id == response.author.id;
		};
		let janken = ['グー','チョキ','パー',];
		let janken_r = Math.floor( Math.random() * 3);
		interaction.reply({ content: "じゃんけん... (g, c, p)", fetchReply: true })
			.then(() => {
				interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] })
					.then(collected => {
						let janken_pC = collected.first().content;
						let janken_p = 5;
						switch (janken_pC) {
							case "g":
								janken_p = 0;
								break;
							case "c":
								janken_p = 1;
								break;
							case "p":
								janken_p = 2;
								break;
						}
						let result = "";
						if (janken_r === janken_p) {
							result = "あいこです";
						} else if (janken_p === 0 && janken_r === 1) {
							result = "あなたの 勝ち です";
						} else if (janken_p === 1 && janken_r === 2) {
							result = "あなたの 勝ち です";
						} else if (janken_p === 2 && janken_r === 0) {
							result = "あなたの 勝ち です";
						} else {
							result = "あなたの 負け です";
						}
						interaction.followUp(`あなたは ${janken[janken_p]} を出して、めぐみんは ${janken[janken_r]} を出しました。\n${result}`);
					})
					.catch(collected => {
						interaction.followUp(`じゃんけんの返事が来なかったみたいだね...`);
					});
			});
	},
};
