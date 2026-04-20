const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

const EVOLUTION_STAGES = [
    { name: '', multiplier: 1 },
    { name: 'Golden', multiplier: 2 },
    { name: 'Shiny', multiplier: 4 },
    { name: 'Neon', multiplier: 8 }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの管理・合成を行います'),

    async execute(interaction) {
        // メインメッセージを「考え中」にする
        await interaction.deferReply({ ephemeral: false });

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        const createMainInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const srCount = currentData.superRebirthCount || 0;
            const maxEquipSlot = 3 + srCount;
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            let totalMultiplier = 0;
            equippedPets.forEach(p => {
                totalMultiplier += (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
            });

            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペットチーム`)
                .setColor('Blue')
                .setDescription(`最大装備枠: **${maxEquipSlot}** 匹\n現在のチーム合計倍率: **x${totalMultiplier.toLocaleString()}**`)
                .addFields({ 
                    name: `⚔️ 現在装備中 (${equippedPets.length} / ${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => {
                            const evo = EVOLUTION_STAGES[p.evoLevel || 0].name;
                            const enchant = p.enchant ? ` \`[${p.enchant.type} Lv.${p.enchant.level}]\`` : '';
                            return `✅ **${evo ? `[${evo}] ` : ''}${p.name}**${enchant}`;
                        }).join('\n')
                        : '装備なし'
                });

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pet_equip_toggle')
                .setPlaceholder('装備するペットをチェック')
                .setMinValues(0)
                .setMaxValues(Math.min(pets.length, maxEquipSlot) || 1);

            const options = pets.map(p => {
                const evo = EVOLUTION_STAGES[p.evoLevel || 0].name;
                const finalMult = (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
                return {
                    label: `${evo ? `[${evo}] ` : ''}${p.name}`,
                    description: `倍率: x${finalMult.toLocaleString()}${p.enchant ? ` | ${p.enchant.type}Lv.${p.enchant.level}` : ''}`,
                    value: p.petId,
                    default: equippedIds.includes(p.petId)
                };
            });

            if (options.length > 0) selectMenu.addOptions(options);

            return { embeds: [embed], components: [
                new ActionRowBuilder().addComponents(selectMenu),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('open_fusion_menu').setLabel('合成メニュー').setStyle(ButtonStyle.Primary).setEmoji('🧪')
                )
            ] };
        };

        try {
            let result = await DataModel.findOne({ id: petKey });
            if (!result || !result.value?.pets?.length) return await interaction.editReply('ペットを持っていません。');

            const response = await interaction.editReply(createMainInterface(result.value));
            const collector = response.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id,
                time: 300000 
            });

            collector.on('collect', async (i) => {
                try {
                    // 全ての操作に対し、まず「処理中」の状態を確立する
                    await i.deferUpdate();

                    const latestDoc = await DataModel.findOne({ id: petKey });
                    const currentData = latestDoc.value;

                    // --- 1. 装備付け替え ---
                    if (i.customId === 'pet_equip_toggle') {
                        const updated = await DataModel.findOneAndUpdate(
                            { id: petKey }, { $set: { 'value.equippedPetIds': i.values } }, { new: true }
                        );
                        await interaction.editReply(createMainInterface(updated.value));
                    }

                    // --- 2. 合成メニューを開く ---
                    if (i.customId === 'open_fusion_menu') {
                        const fusionGroups = getFusionableGroups(currentData.pets);
                        if (fusionGroups.length === 0) {
                            return await i.followUp({ content: '❌ 合成可能な4体のセットがいません。', ephemeral: true });
                        }

                        const fusionSelect = new StringSelectMenuBuilder()
                            .setCustomId('execute_fusion')
                            .setPlaceholder('進化させるペットを選択');

                        fusionGroups.forEach(g => {
                            fusionSelect.addOptions({
                                label: `${g.evoName ? `[${g.evoName}] ` : ''}${g.name}`,
                                description: `4体を消費して ${g.nextEvoName} へ進化`,
                                value: `${g.name}:${g.evoLevel}`
                            });
                        });

                        await i.followUp({ 
                            content: '🧪 **進化させる種類を選んでください**', 
                            components: [new ActionRowBuilder().addComponents(fusionSelect)], 
                            ephemeral: true 
                        });
                    }

                    // --- 3. 合成実行 (ここが失敗しやすいポイント) ---
                    if (i.customId === 'execute_fusion') {
                        const [pName, pEvo] = i.values[0].split(':');
                        const evoLevel = parseInt(pEvo);
                        const targets = currentData.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evoLevel).slice(0, 4);

                        if (targets.length < 4) return; // すでに消費されている場合

                        const targetIds = targets.map(t => t.petId);
                        const remainingPets = currentData.pets.filter(p => !targetIds.includes(p.petId));
                        
                        const evolvedPet = {
                            ...targets[0],
                            petId: uuidv4(),
                            evoLevel: evoLevel + 1,
                            obtainedAt: Date.now()
                        };
                        remainingPets.push(evolvedPet);

                        const updated = await DataModel.findOneAndUpdate(
                            { id: petKey },
                            { 
                                $set: { 'value.pets': remainingPets },
                                $pull: { 'value.equippedPetIds': { $in: targetIds } } 
                            },
                            { new: true }
                        );

                        // 重要なポイント：
                        // i.followUp または i.editReply で「合成しました」と出し、
                        // interaction.editReply で「メインのペット画面」を更新する。
                        await i.editReply({ content: `✅ **${pName}** が進化しました！`, components: [] });
                        await interaction.editReply(createMainInterface(updated.value));
                    }
                } catch (err) {
                    console.error("Collector Error:", err);
                }
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => null);
            });

        } catch (error) {
            console.error("Main Execution Error:", error);
        }
    }
};

function getFusionableGroups(pets) {
    const counts = {};
    pets.forEach(p => {
        const evo = p.evoLevel || 0;
        if (evo >= 3) return;
        const key = `${p.name}:${evo}`;
        if (!counts[key]) counts[key] = { name: p.name, evoLevel: evo, count: 0 };
        counts[key].count++;
    });
    return Object.values(counts).filter(g => g.count >= 4).map(g => ({
        name: g.name,
        evoLevel: g.evoLevel,
        evoName: EVOLUTION_STAGES[g.evoLevel].name,
        nextEvoName: EVOLUTION_STAGES[g.evoLevel + 1].name
    }));
}