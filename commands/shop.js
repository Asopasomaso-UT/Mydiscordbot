const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// 🛒 商品リスト
const ITEMS = {
    'role_rich': { name: '大富豪の証', price: 1000000000, type: 'role', roleId: '1494849107397841107', unique: true },
    'lucky_charm': { name: '幸運のお守り', price: 500, type: 'item', unique: true },
    'bread':       { name: 'おいしいパン', price: 100, type: 'item', unique: false },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('コインを使ってアイテムやロールを購入します'),

    async execute(interaction) {
        const { client, user, guild } = interaction;
        
        // 残高を取得
        const moneyKey = `money_${guild.id}_${user.id}`;
        const balance = await client.db.get(moneyKey) || 0;

        const embed = new EmbedBuilder()
            .setTitle('🛒 めぐみんショップ')
            .setDescription(`欲しい商品を選択してください。\n\n現在の所持金: **${balance.toLocaleString()}** コイン 💰`)
            .setColor('Green')
            .setTimestamp();

        // 商品選択メニュー
        const select = new StringSelectMenuBuilder()
            .setCustomId('shop_buy')
            .setPlaceholder('商品を選んでください')
            .addOptions(
                Object.keys(ITEMS).map(id => ({
                    label: ITEMS[id].name,
                    description: `${ITEMS[id].price.toLocaleString()} コイン`,
                    value: id,
                }))
            );

        // 閉じるボタン
        const closeButton = new ButtonBuilder()
            .setCustomId('shop_close')
            .setLabel('ショップを閉じる')
            .setStyle(ButtonStyle.Danger);

        const row1 = new ActionRowBuilder().addComponents(select);
        const row2 = new ActionRowBuilder().addComponents(closeButton);

        await interaction.reply({ embeds: [embed], components: [row1, row2] });
    },
    ITEMS: ITEMS 
};