const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper');
const { SC_SHOP_ITEMS } = require('../utils/Pet-data'); // SCショップのデータ

const DataModel = mongoose.models.QuickData;

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
        .setDescription('ショップを開きます（通常コイン / Super Coin）'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const moneyKey = `money_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        const [moneyData, userData] = await Promise.all([
            DataModel.findOne({ id: moneyKey }),
            DataModel.findOne({ id: petKey })
        ]);

        const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;
        const currentSC = userData?.value?.superCoin || 0;

        // --- ページ作成関数 ---
        const createShopPage = (page) => {
            if (page === 0) {
                // 通常ショップ
                const now = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tokyo" }));
                const dayOfWeek = now.getDay();
                const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

                const availableIds = Object.keys(ITEMS).filter(id => {
                    const avail = ITEMS[id].availability;
                    if (!avail || avail.type === 'daily') return true;
                    if (avail.type === 'weekly' && avail.day === dayOfWeek) return true;
                    if (avail.type === 'weekend' && (dayOfWeek === 0 || dayOfWeek === 6)) return true;
                    if (avail.type === 'date' && avail.date === monthDay) return true;
                    return false;
                });

                const embed = new EmbedBuilder()
                    .setTitle('🛒 アソパショップ (通常)')
                    .setDescription(`所持金: **${formatCoin(currentMoney)}** 💰\nアイテムを選択して購入してください。`)
                    .setColor('Green');

                const select = new StringSelectMenuBuilder()
                    .setCustomId('shop_buy_normal')
                    .setPlaceholder('通常アイテムを選択')
                    .addOptions(availableIds.map(id => ({
                        label: ITEMS[id].name,
                        description: `${formatCoin(ITEMS[id].price)} コイン`,
                        value: id
                    })));

                return { embed, select };
            } else {
                // Super Coin ショップ
                const embed = new EmbedBuilder()
                    .setTitle('💎 Super Coin ショップ')
                    .setDescription(`所持 SC: **${currentSC}** 枚\nSRで手に入れた貴重なコインを使えます。`)
                    .setColor('LuminousVividPink');

                const select = new StringSelectMenuBuilder()
                    .setCustomId('shop_buy_sc')
                    .setPlaceholder('SC限定アイテムを選択')
                    .addOptions(Object.keys(SC_SHOP_ITEMS).map(id => ({
                        label: SC_SHOP_ITEMS[id].label,
                        description: `${SC_SHOP_ITEMS[id].price} SC`,
                        value: id
                    })));

                return { embed, select };
            }
        };

        const getButtons = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('page_normal')
                    .setLabel('通常ショップ')
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(page === 0),
                new ButtonBuilder()
                    .setCustomId('page_sc')
                    .setLabel('SCショップ')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(page === 1),
                new ButtonBuilder()
                    .setCustomId('shop_close')
                    .setLabel('閉じる')
                    .setStyle(ButtonStyle.Danger)
            );
        };

        // 初期表示 (通常ショップ)
        let currentPage = 0;
        let { embed, select } = createShopPage(currentPage);
        
        const response = await interaction.reply({
            embeds: [embed],
            components: [new ActionRowBuilder().addComponents(select), getButtons(currentPage)],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '操作できません', ephemeral: true });

            // ページ切り替え
            if (i.customId === 'page_normal') {
                currentPage = 0;
                const next = createShopPage(currentPage);
                return await i.update({ embeds: [next.embed], components: [new ActionRowBuilder().addComponents(next.select), getButtons(currentPage)] });
            }
            if (i.customId === 'page_sc') {
                currentPage = 1;
                const next = createShopPage(currentPage);
                return await i.update({ embeds: [next.embed], components: [new ActionRowBuilder().addComponents(next.select), getButtons(currentPage)] });
            }

            // 購入処理 (通常/SC)
            if (i.customId === 'shop_buy_normal' || i.customId === 'shop_buy_sc') {
                const itemId = i.values[0];
                const item = i.customId === 'shop_buy_normal' ? ITEMS[itemId] : SC_SHOP_ITEMS[itemId];
                
                // ここで購入ロジックを実装（残高チェック・DB更新・役職付与など）
                // ...
                
                await i.reply({ content: `✅ **${item.name || item.label}** を購入しました！`, ephemeral: true });
            }

            if (i.customId === 'shop_close') {
                await i.update({ content: 'ショップを閉じました。', embeds: [], components: [] });
                collector.stop();
            }
        });
    }
};