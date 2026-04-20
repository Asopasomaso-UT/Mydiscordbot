const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
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
                .setDescription(`最大装備枠: **${maxEquipSlot}** 匹\nチーム合計倍率: **x${totalMultiplier.toLocaleString()}**`)
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

            // --- エラー回避の核心部分 ---
            // 1. 選択肢は最大25個までに制限する（新しい順に表示）
            const displayPets = pets.slice(-25).reverse(); 
            // 2. 選択可能な数は「表示数」「装備枠」「25」の最小値にする
            const maxSelectable = Math.min(displayPets.length, maxEquipSlot, 25);

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pet_equip_toggle')
                .setPlaceholder('装備するペットを選択（最大25匹表示）')
                .setMinValues(0)
                .setMaxValues(maxSelectable || 1);

            const options = displayPets.map(p => {
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

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_fusion_menu').setLabel('合成メニュー').setStyle(ButtonStyle.Primary).setEmoji('🧪')
            );

            return { embeds: [embed], components: [row1, row2] };
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
                    await i.deferUpdate();
                    const latestDoc = await DataModel.findOne({ id: petKey });
                    const currentData = latestDoc.value;

                    if (i.customId === 'pet_equip_toggle') {
                        const updated = await DataModel.findOneAndUpdate(
                            { id: petKey }, 
                            { $set: { 'value.equippedPetIds': i.values } }, 
                            { returnDocument: 'after' }
                        );
                        await interaction.editReply(createMainInterface(updated.value));
                    }

                    if (i.customId === 'open_fusion_menu') {
                        const fusionGroups = getFusionableGroups(currentData.pets);
                        if (fusionGroups.length === 0) {
                            return await i.followUp({ 
                                content: '❌ 合成可能な4体のセット（同名・同ランク）がいません。', 
                                flags: [MessageFlags.Ephemeral] 
                            });
                        }

                        const fusionSelect = new StringSelectMenuBuilder()
                            .setCustomId('execute_fusion')
                            .setPlaceholder('進化させるペットを選択');

                        // 合成メニューも最大25種類までに制限
                        fusionGroups.slice(0, 25).forEach(g => {
                            fusionSelect.addOptions({
                                label: `${g.evoName ? `[${g.evoName}] ` : ''}${g.name}`,
                                description: `4体を消費して ${g.nextEvoName} へ進化`,
                                value: `${g.name}:${g.evoLevel}`
                            });
                        });

                        await i.followUp({ 
                            content: '🧪 **どのペットを進化させますか？**', 
                            components: [new ActionRowBuilder().addComponents(fusionSelect)], 
                            flags: [MessageFlags.Ephemeral] 
                        });
                    }

                    if (i.customId === 'execute_fusion') {
                        const [pName, pEvo] = i.values[0].split(':');
                        const evoLevel = parseInt(pEvo);
                        const targets = currentData.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evoLevel).slice(0, 4);

                        if (targets.length < 4) return;

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
                            { returnDocument: 'after' }
                        );

                        await i.editReply({ content: `✅ **${pName}** を進化させました！`, components: [] });
                        await interaction.editReply(createMainInterface(updated.value));
                    }
                } catch (err) {
                    console.error("Collector Error:", err);
                }
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