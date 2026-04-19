const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { getRandomEnchant, ENCHANT_TYPES, ENCHANT_UPGRADE, EVOLUTION_STAGES } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('enchant')
        .setDescription('装備中のペットにエンチャントを付与・強化します'),

    async execute(interaction) {
        // 1. 最初に deferReply を実行して「インタラクション失敗」を防ぐ
        await interaction.deferReply();

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const invKey = `pet_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        const [userData, moneyData] = await Promise.all([
            DataModel.findOne({ id: invKey }),
            DataModel.findOne({ id: moneyKey })
        ]);

        const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;
        const pets = userData?.value?.pets || [];
        const equippedIds = userData?.value?.equippedPetIds || [];
        const inventory = userData?.value?.inventory || {};
        const shieldCount = inventory['enchant_shield'] || 0;

        const equippedPets = pets.filter(p => equippedIds.includes(p.petId));

        if (equippedPets.length === 0) {
            return interaction.editReply({ content: 'ペットを装備していません。`/pets` で装備してから実行してください。' });
        }

        const selectEmbed = new EmbedBuilder()
            .setTitle('✨ エンチャントするペットを選択')
            .setDescription('現在装備中のペットから選択してください。')
            .setColor('Purple');

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('select_target_to_enchant')
            .setPlaceholder('対象のペットを選択');

        equippedPets.forEach(p => {
            const stageName = EVOLUTION_STAGES[p.level || 0]?.name || '';
            const enchantName = p.enchant ? ` | ${ENCHANT_TYPES[p.enchant.type].name} Lv.${p.enchant.level}` : ' | なし';
            selectMenu.addOptions({
                label: `${stageName} ${p.name}`.trim(),
                description: `${p.rarity}${enchantName}`,
                value: p.petId
            });
        });

        const row = new ActionRowBuilder().addComponents(selectMenu);
        // editReply を使う
        const response = await interaction.editReply({ embeds: [selectEmbed], components: [row] });

        const collector = response.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '他人の操作はできません', ephemeral: true });

            // 常にDBから最新の情報を取得（連続強化時のバグ防止）
            const latestData = await DataModel.findOne({ id: invKey });
            const latestPets = latestData?.value?.pets || [];
            
            const targetPetId = i.values?.[0] || i.customId.split('_').pop();
            const targetPet = latestPets.find(p => p.petId === targetPetId);
            if (!targetPet) return;

            const currentEnchant = targetPet.enchant;

            if (i.customId === 'select_target_to_enchant') {
                const menuEmbed = new EmbedBuilder()
                    .setTitle(`✨ エンチャント: ${targetPet.name}`)
                    .setColor('Purple');

                const menuRow = new ActionRowBuilder();

                if (!currentEnchant) {
                    menuEmbed.setDescription(`費用: **50,000** 💰\nMimic(0.1%)やSecret Agent(1%)を狙えます。`);
                    menuRow.addComponents(
                        new ButtonBuilder().setCustomId(`do_new_${targetPetId}`).setLabel('新規付与 (50k)').setStyle(ButtonStyle.Primary).setDisabled(currentMoney < 50000)
                    );
                } else if (currentEnchant.level >= 5) {
                    menuEmbed.setDescription(`現在の能力: **${ENCHANT_TYPES[currentEnchant.type].name} (MAX)**`).setColor('Gold');
                } else {
                    const config = ENCHANT_UPGRADE[currentEnchant.level];
                    menuEmbed.setDescription([
                        `現在の能力: **${ENCHANT_TYPES[currentEnchant.type].name} (Lv.${currentEnchant.level})**`,
                        `次への成功率: **${config.success * 100}%**`,
                        `費用: **${config.cost.toLocaleString()}** 💰`,
                        `所持シールド: **${shieldCount}** 枚 🛡️`
                    ].join('\n'));
                    menuRow.addComponents(
                        new ButtonBuilder().setCustomId(`do_up_${targetPetId}`).setLabel(`Lv.${config.next}へ強化`).setStyle(ButtonStyle.Success).setDisabled(currentMoney < config.cost),
                        new ButtonBuilder().setCustomId(`do_new_${targetPetId}`).setLabel('付け直す (50k)').setStyle(ButtonStyle.Secondary).setDisabled(currentMoney < 50000)
                    );
                }
                return i.update({ embeds: [menuEmbed], components: menuRow.components.length > 0 ? [menuRow] : [] });
            }

            // 実行処理（新規付与/強化）
            if (i.customId.startsWith('do_new_')) {
                const newType = getRandomEnchant();
                const updatedPets = latestPets.map(p => p.petId === targetPetId ? { ...p, enchant: { type: newType, level: 1 } } : p);
                
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -50000 } }),
                    DataModel.findOneAndUpdate({ id: invKey }, { 'value.pets': updatedPets })
                ]);
                return i.update({ content: `✨ **${ENCHANT_TYPES[newType].name}** Lv.1 を付与しました！`, embeds: [], components: [] });
            }

            if (i.customId.startsWith('do_up_')) {
                const config = ENCHANT_UPGRADE[currentEnchant.level];
                const isSuccess = Math.random() < config.success;
                let finalLevel = currentEnchant.level;
                let resultMsg = '';

                if (isSuccess) {
                    finalLevel++;
                    resultMsg = `✅ **成功！** Lv.${finalLevel} に上がりました！`;
                } else {
                    if (shieldCount > 0) {
                        await DataModel.findOneAndUpdate({ id: invKey }, { $inc: { 'value.inventory.enchant_shield': -1 } });
                        resultMsg = `❌ **失敗...** シールドを消費してレベルを維持しました。`;
                    } else {
                        finalLevel = config.failLevel;
                        resultMsg = `💀 **失敗！** Lv.${finalLevel} に転落しました...`;
                    }
                }

                const updatedPets = latestPets.map(p => p.petId === targetPetId ? { ...p, enchant: { ...p.enchant, level: finalLevel } } : p);
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: -config.cost } }),
                    DataModel.findOneAndUpdate({ id: invKey }, { 'value.pets': updatedPets })
                ]);
                return i.update({ content: resultMsg, embeds: [], components: [] });
            }
        });
    }
};