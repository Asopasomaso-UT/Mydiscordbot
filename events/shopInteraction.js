const { Events, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { ITEMS } = require('../commands/shop.js');

// Mongoose スキーマ定義
const dataSchema = new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        // --- 1. ボタン処理 (ショップを閉じる) ---
        if (interaction.isButton()) {
            if (interaction.customId === 'shop_close') {
                // コマンド実行者本人か確認
                const originalUser = interaction.message.interaction?.user;
                if (originalUser && interaction.user.id !== originalUser.id) {
                    return await interaction.reply({ content: '自分のショップ画面しか閉じられません。', flags: [MessageFlags.Ephemeral] });
                }
                return await interaction.message.delete().catch(() => null);
            }
        }

        // --- 2. セレクトメニュー処理 (購入) ---
        if (!interaction.isStringSelectMenu() || interaction.customId !== 'shop_buy') return;

        // 応答を保留する (処理が長引く可能性があるため)
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const itemId = interaction.values[0];
        const item = ITEMS[itemId];
        const { user, guild, member } = interaction;

        if (!item) return await interaction.editReply({ content: '商品データが見つかりません。' });

        // 販売期間外チェック (日本時間)
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
            return await interaction.editReply({ content: 'この商品は現在は販売期間外です。' });
        }

        const moneyKey = `money_${guild.id}_${user.id}`;
        const invKey = `items_${guild.id}_${user.id}`;

        try {
            // MongoDB 接続確認
            if (mongoose.connection.readyState !== 1) {
                await mongoose.connect(process.env.MONGO_URI);
            }

            // データ取得
            const moneyRecord = await DataModel.findOne({ id: moneyKey });
            const balance = moneyRecord ? (Number(moneyRecord.value) || 0) : 0;

            const invRecord = await DataModel.findOne({ id: invKey });
            let inventory = invRecord ? (Array.isArray(invRecord.value) ? invRecord.value : []) : [];

            // 所持金不足
            if (balance < item.price) {
                return await interaction.editReply({ content: `コインが足りません！ (必要: ${item.price} / 所持: ${balance})` });
            }

            // 重複チェック
            if (item.unique) {
                if (item.type === 'role' && member.roles.cache.has(item.roleId)) {
                    return await interaction.editReply({ content: '既にその役職を持っています。' });
                }
                if (item.type === 'item' && inventory.includes(item.name)) {
                    return await interaction.editReply({ content: 'そのアイテムは既に持っています。' });
                }
            }

            // 購入処理
            // 1. お金を引く
            await DataModel.findOneAndUpdate(
                { id: moneyKey },
                { $inc: { value: -item.price } },
                { upsert: true }
            );

            // 2. アイテム/役職付与
            if (item.type === 'role') {
                await member.roles.add(item.roleId);
            } else {
                inventory.push(item.name);
                await DataModel.findOneAndUpdate(
                    { id: invKey },
                    { value: inventory },
                    { upsert: true }
                );
            }

            await interaction.editReply({ 
                content: `💸 **${item.name}** を購入しました！`
            });

        } catch (error) {
            console.error('Shop Interaction Error:', error);
            await interaction.editReply({ content: '購入処理中にエラーが発生しました。' });
        }
    },
};