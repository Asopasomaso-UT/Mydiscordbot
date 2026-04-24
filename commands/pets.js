const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

// Pet-data.js から設定をインポート (パスは環境に合わせて調整してください)
const { PET_MASTER, EVOLUTION_STAGES, REBIRTH_CONFIG } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの管理・進化合成を行います'),

    async execute(interaction) {
        // --- 1. 応答の遅延 (3秒ルール対策) ---
        try {
            await interaction.deferReply();
        } catch (err) {
            return console.error("deferReply Error:", err);
        }

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        // --- UI生成関数 (計算ロジック統合) ---
        const createMainInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const srCount = currentData.superRebirthCount || 0;
            const maxEquipSlot = 3 + srCount; // Super Rebirth回数に応じて枠増加
            
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            // 合計倍率の計算 (基本倍率 × 進化段階倍率)
            let totalMultiplier = 0;
            equippedPets.forEach(p => {
                const baseMult = p.multiplier || 1;
                const evoBonus = EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
                totalMultiplier += baseMult * evoBonus;
            });

            // 装備していない場合は最低 1倍
            const displayTotal = totalMultiplier > 0 ? totalMultiplier.toFixed(2) : "1.00";

            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペットチーム`)
                .setColor('Blue')
                .setDescription(`最大装備枠: **${maxEquipSlot}** 匹\nチーム合計倍率: **x${displayTotal}**`)
                .addFields({ 
                    name: `⚔️ 装備中 (${equippedPets.length} / ${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => {
                            const evo = EVOLUTION_STAGES[p.evoLevel || 0].name;
                            const enchant = p.enchant ? ` \`[${p.enchant.type} Lv.${p.enchant.level}]\`` : '';
                            return `✅ **${evo ? `[${evo}] ` : ''}${p.name}**${enchant}`;
                        }).join('\n')
                        : '装備なし'
                });

            // 直近25匹を表示
            const displayPets = pets.slice(-25).reverse();
            const maxSelectable = Math.min(displayPets.length, maxEquipSlot, 25);

            const components = [];

            // 選択メニュー (装備の切り替え)
            if (displayPets.length > 0) {
                const selectMenu = new StringSelectMenuBuilder()
                    .setCustomId('pet_equip_toggle')
                    .setPlaceholder('装備するペットを選択')
                    .setMinValues(0)
                    .setMaxValues(maxSelectable || 1)
                    .addOptions(displayPets.map(p => {
                        const evo = EVOLUTION_STAGES[p.evoLevel || 0].name;
                        const finalMult = (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
                        return {
                            label: `${evo ? `[${evo}] ` : ''}${p.name}`,
                            description: `倍率: x${finalMult.toFixed(2)}${p.enchant ? ` | ${p.enchant.type}Lv.${p.enchant.level}` : ''}`,
                            value: p.petId,
                            default: equippedIds.includes(p.petId)
                        };
                    }));
                components.push(new ActionRowBuilder().addComponents(selectMenu));
            }

            // ボタン
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_fusion_menu').setLabel('合成メニュー').setStyle(ButtonStyle.Primary).setEmoji('🧪')
            ));

            return { embeds: [embed], components };
        };

        try {
            const initialDoc = await DataModel.findOne({ id: petKey });
            if (!initialDoc || !initialDoc.value?.pets?.length) {
                return await interaction.editReply('ペットを所持していません。');
            }

            const response = await interaction.editReply(createMainInterface(initialDoc.value));
            
            const collector = response.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id,
                time: 300000 
            });

            collector.on('collect', async (i) => {
                try {
                    // --- インタラクション失敗を回避するための即時応答 ---
                    await i.deferUpdate().catch(() => {});

                    const latestDoc = await DataModel.findOne({ id: petKey });
                    const currentData = latestDoc.value;

                    // 1. 装備の切り替え
                    if (i.customId === 'pet_equip_toggle') {
                        const updated = await DataModel.findOneAndUpdate(
                            { id: petKey }, 
                            { $set: { 'value.equippedPetIds': i.values } }, 
                            { returnDocument: 'after' }
                        );
                        await interaction.editReply(createMainInterface(updated.value));
                    }

                    // 2. 合成メニューを開く
                    if (i.customId === 'open_fusion_menu') {
                        const fusionGroups = getFusionableGroups(currentData.pets);
                        if (fusionGroups.length === 0) {
                            return await i.followUp({ 
                                content: '❌ 合成可能な同じペット（4体セット）がいません。', 
                                flags: [MessageFlags.Ephemeral] 
                            });
                        }

                        const fusionSelect = new StringSelectMenuBuilder()
                            .setCustomId('execute_fusion')
                            .setPlaceholder('進化させるペットを選択');

                        fusionGroups.forEach(g => {
                            fusionSelect.addOptions({
                                label: `${g.evoName ? `[${g.evoName}] ` : ''}${g.name}`,
                                description: `4体を消費して ${g.nextEvoName} (x${g.nextMult}倍) へ進化`,
                                value: `${g.name}:${g.evoLevel}`
                            });
                        });

                        await i.followUp({ 
                            content: '🧪 **進化合成**\n同じ進化段階のペット4体を消費して、次の段階へ進化させます。', 
                            components: [new ActionRowBuilder().addComponents(fusionSelect)], 
                            flags: [MessageFlags.Ephemeral] 
                        });
                    }

                    // 3. 合成実行
                    if (i.customId === 'execute_fusion') {
                        const [pName, pEvo] = i.values[0].split(':');
                        const evoLevel = parseInt(pEvo);
                        const targets = currentData.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evoLevel).slice(0, 4);

                        if (targets.length < 4) return;

                        const targetIds = targets.map(t => t.petId);
                        
                        // DB衝突を避けるためJS側で新配列を作成
                        const remainingPets = currentData.pets.filter(p => !targetIds.includes(p.petId));
                        const evolvedPet = {
                            ...targets[0],
                            petId: uuidv4(),
                            evoLevel: evoLevel + 1,
                            obtainedAt: Date.now()
                        };
                        remainingPets.push(evolvedPet);

                        // 装備中リストからも削除
                        const newEquippedIds = (currentData.equippedPetIds || []).filter(id => !targetIds.includes(id));

                        const updated = await DataModel.findOneAndUpdate(
                            { id: petKey },
                            { $set: { 'value.pets': remainingPets, 'value.equippedPetIds': newEquippedIds } },
                            { returnDocument: 'after' }
                        );

                        await i.editReply({ content: `✅ **${pName}** (${EVOLUTION_STAGES[evoLevel+1].name}) に進化しました！`, components: [] });
                        await interaction.editReply(createMainInterface(updated.value));
                    }
                } catch (err) {
                    console.error("Collector Collect Error:", err);
                }
            });

        } catch (error) {
            console.error("Main Loop Error:", error);
        }
    }
};

// 合成可能なグループを探すロジック
function getFusionableGroups(pets) {
    const counts = {};
    pets.forEach(p => {
        const evo = p.evoLevel || 0;
        if (evo >= 3) return; // Neonが最大
        const key = `${p.name}:${evo}`;
        if (!counts[key]) counts[key] = { name: p.name, evoLevel: evo, count: 0 };
        counts[key].count++;
    });

    return Object.values(counts)
        .filter(g => g.count >= 4)
        .map(g => ({
            name: g.name,
            evoLevel: g.evoLevel,
            evoName: EVOLUTION_STAGES[g.evoLevel].name,
            nextEvoName: EVOLUTION_STAGES[g.evoLevel + 1].name,
            nextMult: EVOLUTION_STAGES[g.evoLevel + 1].multiplier
        }));
}