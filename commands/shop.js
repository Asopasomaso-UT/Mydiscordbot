const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, PermissionFlagsBits } = require('discord.js');

// 🛒 商品リスト（商品ID: { 名前, 価格, ロールID }）
const ITEMS = {
    'role_Rich':   { name: '金持ちの証', price: 10000000, type: 'role', roleId: '1494849107397841107', unique: true },
    'lucky_charm': { name: '幸運のお守り', price: 500, type: 'item', unique: true },
    'bread':       { name: 'おいしいパン', price: 100, type: 'item', unique: false },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('コインを使ってアイテムやロールを購入します'),

    async execute(interaction) {
        const embed = new EmbedBuilder()
            .setTitle('🛒 めぐみんショップ')
            .setDescription('欲しい商品を選択してください。')
            .setColor('Green')
            .setTimestamp();

        // メニューに商品を追加
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

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.reply({ embeds: [embed], components: [row] });
    },
    // 他のファイルから商品データを使えるようにエクスポートしておく
    ITEMS: ITEMS 
};