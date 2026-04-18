const { Events } = require('discord.js');
const { ITEMS } = require('../commands/shop.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // --- 1. ボタン処理 (ショップを閉じる) ---
        if (interaction.isButton()) {
            if (interaction.customId === 'shop_close') {
                // コマンド実行者本人か確認 (他人に消されるのを防ぐ)
                if (interaction.user.id !== interaction.message.interaction.user.id) {
                    return await interaction.reply({ content: '自分のショップ画面しか閉じられません。', ephemeral: true });
                }
                return await interaction.message.delete().catch(() => null);
            }
        }

        // --- 2. セレクトメニュー処理 (購入) ---
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'shop_buy') return;

        const itemId = interaction.values[0];
        const item = ITEMS[itemId];
        const { client, user, guild, member } = interaction;

        if (!item) return;

        // 販売期間外チェック
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
            return await interaction.reply({ content: 'この商品は現在は販売期間外です。', ephemeral: true });
        }

        const moneyKey = `money_${guild.id}_${user.id}`;
        const invKey = `items_${guild.id}_${user.id}`;
        const balance = await client.db.get(moneyKey) || 0;
        let inventory = await client.db.get(invKey) || [];

        // 所持金不足
        if (balance < item.price) {
            return await interaction.reply({ content: `コインが足りません！`, ephemeral: true });
        }

        // 重複チェック
        if (item.unique) {
            if (item.type === 'role' && member.roles.cache.has(item.roleId)) {
                return await interaction.reply({ content: '既にその役職を持っています。', ephemeral: true });
            }
            if (item.type === 'item' && inventory.includes(item.name)) {
                return await interaction.reply({ content: 'そのアイテムは既に持っています。', ephemeral: true });
            }
        }

        try {
            await client.db.sub(moneyKey, item.price);
            if (item.type === 'role') {
                await member.roles.add(item.roleId);
            } else {
                inventory.push(item.name);
                await client.db.set(invKey, inventory);
            }

            await interaction.reply({ 
                content: `💸 **${item.name}** を購入しました！`, 
                ephemeral: true 
            });
        } catch (error) {
            console.error(error);
            await interaction.reply({ content: '購入エラーが発生しました。', ephemeral: true });
        }
    },
};