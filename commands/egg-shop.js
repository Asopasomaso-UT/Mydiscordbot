const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
// ... Mongoose等の初期化は共通 ...

module.exports = {
    data: new SlashCommandBuilder()
        .setName('egg-shop')
        .setDescription('卵ショップ（30分ごとに在庫が入れ替わります）'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const shopKey = `egg_shop_stock_${guildId}`;
        const now = Date.now();

        // 1. 在庫チェック（30分経過していたら更新）
        let shopData = await DataModel.findOne({ id: shopKey });
        if (!shopData || (now - shopData.value.lastUpdate) > 1800000) {
            const eggTypes = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythic'];
            // ランダムに3つ選出
            const newStock = Array.from({ length: 3 }, () => eggTypes[Math.floor(Math.random() * eggTypes.length)]);
            shopData = await DataModel.findOneAndUpdate(
                { id: shopKey },
                { value: { stock: newStock, lastUpdate: now } },
                { upsert: true, returnDocument: 'after' }
            );
        }

        // 2. 表示
        const embed = new EmbedBuilder()
            .setTitle('🥚 卵ショップ')
            .setDescription('30分ごとにラインナップが変わります。')
            .setColor('LuminousVividPink');

        shopData.value.stock.forEach((egg, i) => {
            const price = { 'Common': 500, 'Uncommon': 1500, 'Rare': 5000, 'Legendary': 20000, 'Mythic': 100000 }[egg];
            embed.addFields({ name: `${i + 1}. ${egg} Egg`, value: `価格: ${price.toLocaleString()} 💰` });
        });

        await interaction.reply({ embeds: [embed] });
    }
};