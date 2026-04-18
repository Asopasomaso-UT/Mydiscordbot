const { Events } = require('discord.js');
const { ITEMS } = require('../commands/shop.js');

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // --- ショップを閉じるボタンの処理 ---
        if (interaction.isButton() && interaction.customId === 'shop_close') {
            // メッセージを削除する
            return await interaction.message.delete();
        }

        // --- 商品購入（セレクトメニュー）の処理 ---
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'shop_buy') return;

        const itemId = interaction.values[0];
        const item = ITEMS[itemId];
        const { client, user, guild, member } = interaction;

        if (!item) return;

        const moneyKey = `money_${guild.id}_${user.id}`;
        const invKey = `items_${guild.id}_${user.id}`;

        const balance = await client.db.get(moneyKey) || 0;
        let inventory = await client.db.get(invKey) || [];

        // 所持金チェック
        if (balance < item.price) {
            return await interaction.reply({ 
                content: `コインが足りません！ (所持: ${balance.toLocaleString()} / 必要: ${item.price.toLocaleString()})`, 
                ephemeral: true 
            });
        }

        // 重複チェック
        if (item.unique) {
            if (item.type === 'role' && member.roles.cache.has(item.roleId)) {
                return await interaction.reply({ content: `既に持っています！`, ephemeral: true });
            }
            if (item.type === 'item' && inventory.includes(item.name)) {
                return await interaction.reply({ content: `そのアイテムは1つしか所持できません。`, ephemeral: true });
            }
        }

        try {
            await client.db.sub(moneyKey, item.price);
            const newBalance = balance - item.price;

            if (item.type === 'role') {
                await member.roles.add(item.roleId);
            } else {
                inventory.push(item.name);
                await client.db.set(invKey, inventory);
            }

            // 購入成功を通知（ephemeral: true で本人にだけ見せる）
            await interaction.reply({ 
                content: `💸 **${item.name}** を購入しました！\n新しい残高: **${newBalance.toLocaleString()}** コイン`, 
                ephemeral: true 
            });

            // 【おまけ】元のショップ画面の残高表示も更新したい場合は、interaction.message.edit を使いますが、
            // 誰でも触れる画面だと他の人の残高が表示されてしまうため、購入通知だけで留めるのが安全です。

        } catch (error) {
            console.error(error);
            await interaction.reply({ content: 'エラーが発生しました。', ephemeral: true });
        }
    },
};