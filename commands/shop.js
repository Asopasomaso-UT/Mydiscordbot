const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

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
        name: '週末の至高のひととき', 
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
        const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
        const dayOfWeek = now.getDay();
        const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

        const availableItemIds = Object.keys(ITEMS).filter(id => {
            const avail = ITEMS[id].availability;
            if (!avail || avail.type === 'daily') return true;
            if (avail.type === 'weekly' && avail.day === dayOfWeek) return true;
            if (avail.type === 'weekend' && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
            if (avail.type === 'date' && avail.date === monthDay) return true;
            return false;
        });

        if (availableItemIds.length === 0) {
            return await interaction.reply({ content: '現在、ショップに並んでいる商品はありません。', ephemeral: true });
        }

        const weekNames = ['日', '月', '火', '水', '木', '金', '土'];
        const embed = new EmbedBuilder()
            .setTitle('🛒 アソパショップ')
            .setDescription(`本日のラインナップです！\n今日は **${weekNames[dayOfWeek]}曜日 (${monthDay})** です。`)
            .setColor('Green')
            .setTimestamp();

        // セレクトメニュー（1段目）
        const select = new StringSelectMenuBuilder()
            .setCustomId('shop_buy')
            .setPlaceholder('購入したいアイテムを選んでください')
            .addOptions(
                availableItemIds.map(id => ({
                    label: ITEMS[id].name,
                    description: `${ITEMS[id].price.toLocaleString()} コイン`,
                    value: id,
                }))
            );

        // 閉じるボタン（2段目）
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