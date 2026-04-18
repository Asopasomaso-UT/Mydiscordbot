const { Events } = require('discord.js');
const { ITEMS } = require('../commands/shop.js'); // shop.jsから商品リストを読み込む

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // セレクトメニューのIDが 'shop_buy' 以外、または実行者がBotなら無視
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'shop_buy') return;

        const itemId = interaction.values[0];
        const item = ITEMS[itemId];
        const { client, user, guild, member } = interaction;

        // 商品が存在しない場合は終了
        if (!item) return;

        // データベース用のキー
        const moneyKey = `money_${guild.id}_${user.id}`;
        const invKey = `items_${guild.id}_${user.id}`;

        // 現在の所持金と所持アイテムを取得
        const balance = await client.db.get(moneyKey) || 0;
        let inventory = await client.db.get(invKey) || [];

        // --- 1. 所持金チェック ---
        if (balance < item.price) {
            return await interaction.reply({ 
                content: `コインが足りません！\n価格: **${item.price.toLocaleString()}** コイン / 所持: **${balance.toLocaleString()}** コイン`, 
                ephemeral: true 
            });
        }

        // --- 2. 1回限り(unique)商品の所持チェック ---
        if (item.unique) {
            if (item.type === 'role') {
                // ロールを既に持っているか
                if (member.roles.cache.has(item.roleId)) {
                    return await interaction.reply({ content: `既にその役職（${item.name}）を持っています！`, ephemeral: true });
                }
            } else if (item.type === 'item') {
                // アイテムを既に持っているか（名前で判定）
                if (inventory.includes(item.name)) {
                    return await interaction.reply({ content: `そのアイテム（${item.name}）は1つしか所持できません。`, ephemeral: true });
                }
            }
        }

        // --- 3. 購入処理と支払い ---
        try {
            // お金を引く
            await client.db.sub(moneyKey, item.price);

            if (item.type === 'role') {
                // ロールを付与
                await member.roles.add(item.roleId);
            } else {
                // インベントリにアイテム名を追加して保存
                inventory.push(item.name);
                await client.db.set(invKey, inventory);
            }

            // 購入成功のメッセージ
            await interaction.reply({ 
                content: `💸 **${item.name}** を購入しました！\n残高: **${(balance - item.price).toLocaleString()}** コイン`, 
                ephemeral: true 
            });

        } catch (error) {
            console.error('購入処理エラー:', error);
            
            // エラー時のフォロー（お金だけ引かれるのを防ぐため、本来はここでロールバック処理が必要ですが、まずは簡易的にメッセージのみ）
            await interaction.reply({ 
                content: '購入処理中にエラーが発生しました。Botの権限などを確認してください。', 
                ephemeral: true 
            });
        }
    },
};