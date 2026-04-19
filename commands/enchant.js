const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { getRandomEnchant, ENCHANT_TYPES, ENCHANT_UPGRADE } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enchant')
        .setDescription('装備中のペットにエンチャントを付与・強化します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        const [userData, moneyData] = await Promise.all([
            DataModel.findOne({ id: petKey }),
            DataModel.findOne({ id: moneyKey })
        ]);

        const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;
        const inventory = userData?.value?.inventory || {};
        const equippedPet = userData?.value?.equippedPet;

        // 1. ペットを装備しているかチェック
        if (!equippedPet) {
            return interaction.reply({ content: 'ペットを装備していないとエンチャントできません。', ephemeral: true });
        }

        const currentEnchant = equippedPet.enchant; // { type: 'power', level: 1 } または undefined
        const shieldCount = inventory['enchant_shield'] || 0;

        const embed = new EmbedBuilder()
            .setTitle(`✨ ペットエンチャント: ${equippedPet.name || '装備中のペット'}`)
            .setColor('Purple');

        const row = new ActionRowBuilder();

        // --- ケースA: エンチャントをまだ持っていない場合（新規付与） ---
        if (!currentEnchant) {
            const COST = 50000;
            embed.setDescription(`現在エンチャントが付いていません。\n\n**費用:** ${COST.toLocaleString()} 💰\n**レア枠:** Secret Agent(1%), Mimic(0.1%)`);
            
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('enchant_new')
                    .setLabel('新規エンチャント付与')
                    .setStyle(ButtonStyle.Primary)
                    .setDisabled(currentMoney < COST)
            );
        } 
        // --- ケースB: すでに最大レベルの場合 ---
        else if (currentEnchant.level >= 5) {
            embed.setDescription(`現在の能力: **${ENCHANT_TYPES[currentEnchant.type].name} (MAX Lv.5)**\nこれ以上強化することはできません。`)
                 .setColor('Gold');
            return interaction.reply({ embeds: [embed] });
        } 
        // --- ケースC: 強化が可能な場合 ---
        else {
            const config = ENCHANT_UPGRADE[currentEnchant.level];
            embed.setDescription([
                `現在の能力: **${ENCHANT_TYPES[currentEnchant.type].name} (Lv.${currentEnchant.level})**`,
                `次への成功率: **${config.success * 100}%**`,
                `失敗時の転落先: **Lv.${config.failLevel}**`,
                `費用: **${config.cost.toLocaleString()}** 💰`,
                `所持シールド: **${shieldCount}** 枚 ${shieldCount > 0 ? '🛡️' : ''}`
            ].join('\n'));

            row.addComponents(
                new ButtonBuilder()
                    .setCustomId('enchant_upgrade')
                    .setLabel(`Lv.${config.next} へ強化`)
                    .setStyle(ButtonStyle.Success)
                    .setDisabled(currentMoney < config.cost),
                new ButtonBuilder()
                    .setCustomId('enchant_reroll')
                    .setLabel('別の能力に付け直す (50,000💰)')
                    .setStyle(ButtonStyle.Secondary)
            );
        }

        const response = await interaction.reply({ embeds: [embed], components: row.components.length > 0 ? [row] : [], fetchReply: true });
        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return;

            // --- 新規付与 / 付け直しロジック ---
            if (i.customId === 'enchant_new' || i.customId === 'enchant_reroll') {
                const newType = getRandomEnchant();
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -50000 } }),
                    DataModel.findOneAndUpdate({ id: petKey }, { 'value.equippedPet.enchant': { type: newType, level: 1 } })
                ]);
                return i.update({ content: `✨ **${ENCHANT_TYPES[newType].name}** が付与されました！`, embeds: [], components: [] });
            }

            // --- 強化ロジック ---
            if (i.customId === 'enchant_upgrade') {
                const config = ENCHANT_UPGRADE[currentEnchant.level];
                const isSuccess = Math.random() < config.success;
                let finalLevel = currentEnchant.level;
                let msg = '';

                // 支払い
                await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -config.cost } });

                if (isSuccess) {
                    finalLevel++;
                    msg = `✅ **成功！** Lv.${finalLevel} に上がりました！`;
                } else {
                    if (shieldCount > 0) {
                        await DataModel.findOneAndUpdate({ id: petKey }, { $inc: { 'value.inventory.enchant_shield': -1 } });
                        msg = `❌ **失敗...** ですがシールドを消費してレベルを維持しました。`;
                    } else {
                        finalLevel = config.failLevel;
                        msg = `💀 **失敗！** Lv.${finalLevel} に下がってしまいました...`;
                    }
                }

                await DataModel.findOneAndUpdate({ id: petKey }, { 'value.equippedPet.enchant.level': finalLevel });
                return i.update({ content: msg, embeds: [], components: [] });
            }
        });
    }
};