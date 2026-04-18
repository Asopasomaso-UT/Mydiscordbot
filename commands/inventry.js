const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('自分の持ち物を確認します'),

    async execute(interaction) {
        const { client, user, guild } = interaction;
        const invKey = `items_${guild.id}_${user.id}`;
        const inventory = await client.db.get(invKey) || [];

        const embed = new EmbedBuilder()
            .setTitle(`🎒 ${user.username} の持ち物`)
            .setColor('Blue');

        if (inventory.length === 0) {
            embed.setDescription('持ち物は空っぽです。');
        } else {
            // 【重要】個数をカウントする処理
            const itemCounts = {};
            inventory.forEach(itemName => {
                itemCounts[itemName] = (itemCounts[itemName] || 0) + 1;
            });

            // 「アイテム名 × 個数」の形式に変換
            const listText = Object.entries(itemCounts)
                .map(([name, count]) => `・**${name}** × ${count}`)
                .join('\n');

            embed.setDescription(listText);
        }

        await interaction.reply({ embeds: [embed] });
    },
};