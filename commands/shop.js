const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper');
const { SC_SHOP_ITEMS } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

// 通常ショップのアイテム定義
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
    'enchant_shield': { 
        name: '🛡️ エンチャントシールド', 
        price: 5000, 
        type: 'item', 
        unique: false, 
        availability: { type: 'daily' },
        desc: '強化失敗時のレベルダウンを防ぐ(1回消費)'
    },
    'rare_candy': {
        name: '不思議なあめ',
        price: 150000, 
        type: 'item', 
        unique: false,
        availability: { type: 'daily' },
        desc: '食べるとレベルが1上がります。',
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

        const fetchUserData = async () => {
            const [m, u] = await Promise.all([
                DataModel.findOne({ id: moneyKey }),
                DataModel.findOne({ id: petKey })
            ]);
            return {
                money: m ? (Number(m.value) || 0) : 0,
                sc: u?.value?.superCoin || 0,
                fullPetData: u?.value || {}
            };
        };

        let { money: currentMoney, sc: currentSC } = await fetchUserData();

        const createShopPage = (page, money, sc) => {
            if (page === 0) {
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
                    .setDescription(`所持金: **${formatCoin(money)}** 💰\nアイテムを選択して購入してください。`)
                    .setColor('Green');

                const select = new StringSelectMenuBuilder()
                    .setCustomId('shop_buy_normal')
                    .setPlaceholder('通常アイテムを選択')
                    .addOptions(availableIds.map(id => ({
                        label: ITEMS[id].name,
                        description: `${formatCoin(ITEMS[id].price)} コイン${ITEMS[id].desc ? ` | ${ITEMS[id].desc}` : ''}`,
                        value: id
                    })));

                return { embed, select };
            } else {
                const embed = new EmbedBuilder()
                    .setTitle('💎 Super Coin ショップ')
                    .setDescription(`所持 SC: **${sc}** 枚\nSRで手に入れた貴重なコインを使えます。`)
                    .setColor('LuminousVividPink');

                const select = new StringSelectMenuBuilder()
                    .setCustomId('shop_buy_sc')
                    .setPlaceholder('SC限定アイテムを選択')
                    .addOptions(Object.keys(SC_SHOP_ITEMS).map(id => ({
                        label: SC_SHOP_ITEMS[id].name || SC_SHOP_ITEMS[id].label,
                        description: `${SC_SHOP_ITEMS[id].price} SC`,
                        value: id
                    })));

                return { embed, select };
            }
        };

        const getButtons = (page) => {
            return new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('page_normal').setLabel('通常ショップ').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
                new ButtonBuilder().setCustomId('page_sc').setLabel('SCショップ').setStyle(ButtonStyle.Primary).setDisabled(page === 1),
                new ButtonBuilder().setCustomId('shop_close').setLabel('閉じる').setStyle(ButtonStyle.Danger)
            );
        };

        let currentPage = 0;
        let pageData = createShopPage(currentPage, currentMoney, currentSC);
        
        const response = await interaction.reply({
            embeds: [pageData.embed],
            components: [new ActionRowBuilder().addComponents(pageData.select), getButtons(currentPage)],
            fetchReply: true
        });

        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '操作できません', ephemeral: true });

            if (i.customId === 'page_normal' || i.customId === 'page_sc') {
                currentPage = i.customId === 'page_normal' ? 0 : 1;
                const updated = await fetchUserData();
                const next = createShopPage(currentPage, updated.money, updated.sc);
                return await i.update({ embeds: [next.embed], components: [new ActionRowBuilder().addComponents(next.select), getButtons(currentPage)] });
            }

            if (i.customId === 'shop_buy_normal' || i.customId === 'shop_buy_sc') {
                const itemId = i.values[0];
                const isSC = i.customId === 'shop_buy_sc';
                const item = isSC ? SC_SHOP_ITEMS[itemId] : ITEMS[itemId];

                const updated = await fetchUserData();
                const balance = isSC ? updated.sc : updated.money;

                if (balance < item.price) {
                    return i.reply({ content: `${isSC ? 'Super Coin' : 'コイン'}が足りません！`, ephemeral: true });
                }

                // 支払い処理
                if (isSC) {
                    await DataModel.findOneAndUpdate({ id: petKey }, { $inc: { 'value.superCoin': -item.price } });
                } else {
                    await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -item.price } });
                }

                // --- 重要：アイテムの付与ロジック ---
                let resultMessage = `✅ **${item.name || item.label}** を購入しました！`;

                if (item.type === 'item') {
                    // 不思議なあめやシールドをインベントリ（pet_data 内）に追加
                    await DataModel.findOneAndUpdate(
                        { id: petKey },
                        { $inc: { [`value.inventory.${itemId}`]: 1 } },
                        { upsert: true }
                    );
                } else if (item.type === 'egg') {
                    await DataModel.findOneAndUpdate(
                        { id: petKey },
                        { $inc: { [`value.inventory.${item.eggKey}`]: 1 } }
                    );
                    resultMessage += `\n\`/hatch-egg\` で孵化させることができます。`;
                } else if (item.type === 'role') {
                    const role = interaction.guild.roles.cache.get(item.roleId);
                    if (role) {
                        await i.member.roles.add(role).catch(() => {});
                        resultMessage += `\n役職がプロファイルに追加されました。`;
                    }
                } else if (item.type === 'buff') {
                    await DataModel.findOneAndUpdate(
                        { id: petKey },
                        { $inc: { 'value.permanentMultiplier': 0.1 } }
                    );
                }

                await i.reply({ content: resultMessage, ephemeral: true });

                const refreshed = await fetchUserData();
                const next = createShopPage(currentPage, refreshed.money, refreshed.sc);
                await interaction.editReply({ embeds: [next.embed], components: [new ActionRowBuilder().addComponents(next.select), getButtons(currentPage)] });
            }

            if (i.customId === 'shop_close') {
                await i.update({ content: 'ショップを閉じました。', embeds: [], components: [] });
                collector.stop();
            }
        });
    }
};