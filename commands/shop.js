const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');

// 🛒 商品リストの定義
// availability の設定例:
// - { type: 'daily' } : 毎日販売
// - { type: 'weekly', day: 1 } : 毎週月曜 (0:日, 1:月, 2:火, 3:水, 4:木, 5:金, 6:土)
// - { type: 'weekend' } : 土日のみ
// - { type: 'date', date: '12-25' } : 毎年12月25日のみ (MM-DD)
const ITEMS = {
    'role_silver': { 
        name: '大富豪の証', 
        price: 1000000000, 
        type: 'role', 
        roleId: '1494849107397841107', 
        unique: true, 
        availability: { type: 'daily' } 
    },
    'monday_bread': { 
        name: '特製チョコパン', 
        price: 50, 
        type: 'item', 
        unique: false, 
        availability: { type: 'weekly', day: 1 } 
    },
    'weekend_charm': { 
        name: '週末', 
        price: 2000, 
        type: 'item', 
        unique: true, 
        availability: { type: 'weekend' } 
    },
    'birthday_cake': { 
        name: 'アソパソの誕生日ケーキ', 
        price: 999, 
        type: 'item', 
        unique: false, 
        availability: { type: 'date', date: '01-22' } 
    },
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('コインを使ってアイテムや役職を購入します'),

    async execute(interaction) {
        // --- 1. 日本時間の現在時刻を取得 ---
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        const dayOfWeek = now.getDay();
        const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        // --- 2. 今買える商品だけを抽出 ---
        const availableItemIds = Object.keys(ITEMS).filter(id => {
            const avail = ITEMS[id].availability;
            if (!avail || avail.type === 'daily') return true;
            if (avail.type === 'weekly' && avail.day === dayOfWeek) return true;
            if (avail.type === 'weekend' && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
            if (avail.type === 'date' && avail.date === monthDay) return true;
            return false;
        });

        if (availableItemIds.length === 0) {
            return await interaction.reply({ content: '現在、ショップに並んでいる商品はありません。また明日来てくださいね！', ephemeral: true });
        }

        // --- 3. 埋め込みメッセージ作成 ---
        const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
        const embed = new EmbedBuilder()
            .setTitle('🛒 限定ショップ')
            .setDescription(`本日のラインナップです！\n今日は **${weekNames[dayOfWeek]}曜日 (${monthDay})** です。`)
            .setColor('Green')
            .setTimestamp();

        // --- 4. セレクトメニュー作成 ---
        const select = new StringSelectMenuBuilder()
            .setCustomId('shop_buy')
            .setPlaceholder('購入したいアイテムを選んでください')
            .addOptions(
                availableItemIds.map(id => ({
                    label: ITEMS[id].name,
                    description: `${ITEMS[id].price.toLocaleString()} コイン ${ITEMS[id].unique ? ' (1個限定)' : ''}`,
                    value: id,
                }))
            );

        const row = new ActionRowBuilder().addComponents(select);

        await interaction.reply({ embeds: [embed], components: [row] });
    },
    // 他のファイル（shopInteraction.js）からITEMSを使えるようにエクスポート
    ITEMS: ITEMS 
};