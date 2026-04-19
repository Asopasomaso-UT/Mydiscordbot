const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER, EVOLUTION_STAGES } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets-inventry')
        .setDescription('所持ペットの確認・装備・合成を行います'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const invKey = `pet_data_${guildId}_${userId}`;

        const createInventoryEmbed = (pets, equippedIds) => {
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            const totalMult = equippedPets.reduce((sum, p) => sum + (p.multiplier - 1), 1);

            const embed = new EmbedBuilder()
                .setTitle('🐾 ペットインベントリ')
                .setColor('Blue')
                .setDescription(`**現在の合計倍率: x${totalMult.toLocaleString()}**\n(装備枠: ${equippedIds.length} / 3)`)
                .addFields({
                    name: '🛡️ 装備中のペット',
                    value: equippedPets.map(p => {
                        const stageName = EVOLUTION_STAGES[p.level || 0].name;
                        return `✅ **${stageName ? stageName + ' ' : ''}${p.name}** [${p.rarity}] (x${p.multiplier})`;
                    }).join('\n') || 'なし'
                });
            return embed;
        };

        const userData = await DataModel.findOne({ id: invKey });
        let pets = userData?.value?.pets || [];
        let equippedIds = userData?.value?.equippedPetIds || [];

        if (pets.length === 0) return interaction.reply('ペットをまだ持っていません。');

        const embed = createInventoryEmbed(pets, equippedIds);

        // --- コンポーネント作成 ---
        const getRows = (currentPets, currentEquipped) => {
            // 1. 装備用のセレクトメニュー
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pet_select')
                .setPlaceholder('装備するペットを選択（最大3体）')
                .setMaxValues(Math.min(currentPets.length, 3))
                .setMinValues(0);

            currentPets.slice(0, 25).forEach(p => {
                const stageName = EVOLUTION_STAGES[p.level || 0].name;
                selectMenu.addOptions({
                    label: `${stageName ? stageName + ' ' : ''}${p.name}`,
                    description: `${p.rarity} | 倍率: x${p.multiplier}`,
                    value: p.petId,
                    default: currentEquipped.includes(p.petId)
                });
            });

            // 2. クラフトボタン
            const craftBtn = new ButtonBuilder()
                .setCustomId('open_craft')
                .setLabel('ペット合成 (4体消費)')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('🛠️');

            return [
                new ActionRowBuilder().addComponents(selectMenu),
                new ActionRowBuilder().addComponents(craftBtn)
            ];
        };

        const response = await interaction.reply({ 
            embeds: [embed], 
            components: getRows(pets, equippedIds),
            fetchReply: true 
        });

        const collector = response.createMessageComponentCollector({ time: 300000 }); // 5分間有効

        collector.on('collect', async (i) => {
            if (i.user.id !== userId) return i.reply({ content: '操作できません', ephemeral: true });

            // --- 装備の更新 ---
            if (i.customId === 'pet_select') {
                equippedIds = i.values;
                await DataModel.findOneAndUpdate({ id: invKey }, { 'value.equippedPetIds': equippedIds });
                
                const newEmbed = createInventoryEmbed(pets, equippedIds);
                await i.update({ embeds: [newEmbed], components: getRows(pets, equippedIds) });
            }

            // --- クラフト画面へ切り替え ---
            if (i.customId === 'open_craft') {
                const counts = {};
                pets.forEach(p => {
                    const level = p.level || 0;
                    if (level >= 3) return;
                    const key = `${p.name}_${level}`;
                    if (!counts[key]) counts[key] = [];
                    counts[key].push(p);
                });

                const craftableKeys = Object.keys(counts).filter(k => counts[k].length >= 4);

                if (craftableKeys.length === 0) {
                    return i.reply({ content: '同じ名前・ランクのペットが4体以上必要です。', ephemeral: true });
                }

                const craftMenu = new StringSelectMenuBuilder()
                    .setCustomId('do_craft')
                    .setPlaceholder('進化させるペットを選択');

                craftableKeys.forEach(key => {
                    const [name, level] = key.split('_');
                    const nextStage = EVOLUTION_STAGES[parseInt(level) + 1];
                    craftMenu.addOptions({
                        label: `${name} (${counts[key].length}体所持)`,
                        description: `${EVOLUTION_STAGES[level].name || '通常'} ➔ ${nextStage.name} (倍率2倍)`,
                        value: key
                    });
                });

                const backBtn = new ButtonBuilder().setCustomId('back_to_inv').setLabel('戻る').setStyle(ButtonStyle.Danger);

                await i.update({ 
                    content: '🛠️ **クラフトモード**: 4体を消費して1体を強化します。',
                    components: [new ActionRowBuilder().addComponents(craftMenu), new ActionRowBuilder().addComponents(backBtn)] 
                });
            }

            // --- クラフト実行 ---
            if (i.customId === 'do_craft') {
                const [targetName, currentLevel] = i.values[0].split('_');
                const levelNum = parseInt(currentLevel);

                const targets = pets.filter(p => p.name === targetName && (p.level || 0) === levelNum).slice(0, 4);
                const targetIds = targets.map(t => t.petId);

                const nextLevel = levelNum + 1;
                const newPet = {
                    petId: uuidv4(),
                    name: targetName,
                    rarity: targets[0].rarity,
                    level: nextLevel,
                    multiplier: targets[0].multiplier * 2,
                    obtainedAt: Date.now()
                };

                // 配列更新
                pets = pets.filter(p => !targetIds.includes(p.petId));
                pets.push(newPet);
                equippedIds = equippedIds.filter(id => !targetIds.includes(id));

                await DataModel.findOneAndUpdate({ id: invKey }, { 'value.pets': pets, 'value.equippedPetIds': equippedIds });

                const newEmbed = createInventoryEmbed(pets, equippedIds);
                await i.update({ 
                    content: `✨ **${EVOLUTION_STAGES[nextLevel].name} ${targetName}** に進化しました！`, 
                    embeds: [newEmbed], 
                    components: getRows(pets, equippedIds) 
                });
            }

            // --- インベントリに戻る ---
            if (i.customId === 'back_to_inv') {
                await i.update({ content: '', embeds: [embed], components: getRows(pets, equippedIds) });
            }
        });
    }
};