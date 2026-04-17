const { SlashCommandBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('janken')
        .setDescription('じゃんけんぽん！！'),

    async execute(interaction) {
        // 1. じゃんけんの選択肢
        const janken = ['グー', 'チョキ', 'パー'];
        const janken_r = Math.floor(Math.random() * 3);

        // 2. 最初のメッセージを送信
        await interaction.reply({ content: "じゃんけん... (g, c, p) をチャットに打ってね！", fetchReply: true });

        // 3. メッセージコレクターの設定
        const filter = response => {
            return interaction.user.id === response.author.id && ['g', 'c', 'p'].includes(response.content.toLowerCase());
        };

        try {
            const collected = await interaction.channel.awaitMessages({ filter, max: 1, time: 30000, errors: ['time'] });
            const userChoiceRaw = collected.first().content.toLowerCase();
            
            // ユーザーの手を数値に変換
            const choiceMap = { 'g': 0, 'c': 1, 'p': 2 };
            const janken_p = choiceMap[userChoiceRaw];

            // 判定ロジック
            let result = "";
            if (janken_r === janken_p) {
                result = "あいこです";
            } else if (
                (janken_p === 0 && janken_r === 1) ||
                (janken_p === 1 && janken_r === 2) ||
                (janken_p === 2 && janken_r === 0)
            ) {
                result = "あなたの **勝ち** です！";
            } else {
                result = "あなたの **負け** です...";
            }

            await interaction.followUp(`あなたは ${janken[janken_p]} を出して、私は ${janken[janken_r]} を出しました。\n${result}`);

        } catch (error) {
            await interaction.followUp(`時間切れだよ！じゃんけんの返事が来なかったね...`);
        }
    },
};