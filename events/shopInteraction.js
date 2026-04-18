const { Events } = require('discord.js');
const { ITEMS } = require('../commands/shop.js');

module.exports = {
    name: Events.InteractionCreate,
    // ここに必ず "async" が必要です！
    async execute(interaction) {
        // セレクトメニューのIDチェック
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'shop_buy') return;

        const itemId = interaction.values[0];
        const item = ITEMS[itemId];
        const { client, user, guild, member } = interaction;

        if (!item) return;

        // --- 1. 販売期間外チェック (ここでも await を使う可能性があるため async 関数内である必要がある) ---
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        const dayOfWeek = now.getDay();
        const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        let isAvailable = false;
        const avail = item.availability;
        if (!avail || avail.type === 'daily') isAvailable = true;
        else if (avail.type === 'weekly' && avail.day === dayOfWeek) isAvailable = true;
        else if (avail.type === 'weekend' && (dayOfWeek === 0 || dayOfWeek === 6)) isAvailable = true;
        else if (avail.type === 'date' && avail.date === monthDay) isAvailable = true;

        if (!isAvailable) {
            return await interaction.reply({ content: '申し訳ありません、その商品は現在は販売期間外です。', ephemeral: true });
        }

        // --- 2. データベース準備 ---
        const moneyKey = `money_${guild.id}_${user.id}`;
        const invKey = `items_${guild.id}_${user.id}`;

        // ここで await を使うので、execute の前に async が必須
        const balance = await client.db.get(moneyKey) || 0;
        let inventory = await client.db.get(invKey) || [];

        // --- 3. 所持金チェック ---
        if (balance < item.price) {
            return await interaction.reply({ 
                content: `コインが足りません！ (所持: ${balance.toLocaleString()} / 必要: ${item.price.toLocaleString()})`, 
                ephemeral: true 
            });
        }

        // --- 4. ユニーク(1回限り)商品のチェック ---
        if (item.unique) {
            if (item.type === 'role' && member.roles.cache.has(item.roleId)) {
                return await interaction.reply({ content: '既にその役職を持っています。', ephemeral: true });
            }
            if (item.type === 'item' && inventory.includes(item.name)) {
                return await interaction.reply({ content: 'そのアイテムは既に持っています。', ephemeral: true });
            }
        }

        // --- 5. 購入確定処理 ---
        try {
            await client.db.sub(moneyKey, item.price);

            if (item.type === 'role') {
                await member.roles.add(item.roleId);
            } else {
                inventory.push(item.name);
                await client.db.set(invKey, inventory);
            }

            await interaction.reply({ 
                content: `💸 **${item.name}** を購入しました！\n残高: **${(balance - item.price).toLocaleString()}** コイン`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'エラーが発生しました。Botの権限を確認してください。', ephemeral: true });
        }
    },
};