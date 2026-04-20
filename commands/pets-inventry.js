const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

// 進化設定
const EVOLUTION_STAGES = [
    { name: '', multiplier: 1 },           // Level 0
    { name: 'Golden', multiplier: 2 },     // Level 1
    { name: 'Shiny', multiplier: 4 },      // Level 2
    { name: 'Neon', multiplier: 8 }        // Level 3 (最大)
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの装備管理・4体合成進化を行います'),

    async execute(interaction) {
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        /**
         * メインメニューの生成
         */
        const createMainInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const maxEquipSlot = 3 + (currentData.superRebirthCount || 0);

            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペット管理`)
                .setColor('Blue')
                .setDescription(`最大装備枠: **${maxEquipSlot}** 匹`)
                .addFields({ 
                    name: `⚔️ 現在装備中 (${equippedPets.length} / ${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => `✅ **${EVOLUTION_STAGES[p.evoLevel || 0].name} ${p.name}**`).join('\n')
                        : '装備なし'
                });

            // 装備付け替えメニュー
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pet_equip_toggle')
                .setPlaceholder('装備するペットをチェック')
                .setMinValues(0)
                .setMaxValues(Math.min(pets.length, maxEquipSlot) || 1);

            const options = pets.map(p => ({
                label: `${EVOLUTION_STAGES[p.evoLevel || 0].name} ${p.name}`,
                description: `レア: ${p.rarity} | 倍率: x${((p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier).toLocaleString()}`,
                value: p.petId,
                default: equippedIds.includes(p.petId)
            }));
            if (options.length > 0) selectMenu.addOptions(options);

            const row1 = new ActionRowBuilder().addComponents(selectMenu);
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_fusion_menu').setLabel('合成メニューを開く').setStyle(ButtonStyle.Primary).setEmoji('🧪')
            );

            return { embeds: [embed], components: [row1, row2] };
        };

        try {
            let result = await DataModel.findOne({ id: petKey });
            if (!result || !result.value?.pets?.length) return await interaction.editReply('ペットを持っていません。');

            let userData = result.value;
            // IDがないペットへの救済
            let needsSave = false;
            userData.pets = userData.pets.map(p => { if (!p.petId) { p.petId = uuidv4(); needsSave = true; } return p; });
            if (needsSave) await DataModel.findOneAndUpdate({ id: petKey }, { $set: { "value.pets": userData.pets } });

            const response = await interaction.editReply(createMainInterface(userData));
            const collector = response.createMessageComponentCollector({ time: 300000 });

            collector.on('collect', async (i) => {
                const latest = await DataModel.findOne({ id: petKey });
                const currentData = latest.value;

                // --- 1. 装備付け替え ---
                if (i.customId === 'pet_equip_toggle') {
                    const updated = await DataModel.findOneAndUpdate(
                        { id: petKey }, { $set: { 'value.equippedPetIds': i.values } }, { new: true }
                    );
                    await i.update(createMainInterface(updated.value));
                }

                // --- 2. 合成メニュー表示 (どのペットを合成するか選ぶ) ---
                if (i.customId === 'open_fusion_menu') {
                    const fusionGroups = getFusionableGroups(currentData.pets);
                    
                    if (fusionGroups.length === 0) {
                        return i.reply({ content: '❌ 合成可能なペット（同名かつ同ランクが4体）がいません！', ephemeral: true });
                    }

                    const fusionSelect = new StringSelectMenuBuilder()
                        .setCustomId('execute_fusion')
                        .setPlaceholder('進化させるペットの種類を選択してください');

                    fusionGroups.forEach(group => {
                        fusionSelect.addOptions({
                            label: `${group.evoName} ${group.name}`,
                            description: `4体を消費して ${group.nextEvoName} に進化させます`,
                            value: `${group.name}:${group.evoLevel}`
                        });
                    });

                    const row = new ActionRowBuilder().addComponents(fusionSelect);
                    await i.reply({ content: '🧪 **どのペットを合成して進化させますか？**', components: [row], ephemeral: true });
                }

                // --- 3. 合成実行 ---
                if (i.customId === 'execute_fusion') {
                    const [pName, pEvo] = i.values[0].split(':');
                    const evoLevel = parseInt(pEvo);
                    
                    // 対象となる4体を取得
                    const targets = currentData.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evoLevel).slice(0, 4);
                    if (targets.length < 4) return i.update({ content: 'データ不整合により合成に失敗しました。', components: [] });

                    const targetIds = targets.map(t => t.petId);
                    const remainingPets = currentData.pets.filter(p => !targetIds.includes(p.petId));
                    
                    // 進化個体を追加
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

                    await i.update({ content: `✨ **合成成功！** ${pName} が **${EVOLUTION_STAGES[evoLevel + 1].name}** に進化しました！`, components: [] });
                    // メインメニューも更新
                    await interaction.editReply(createMainInterface(updated.value));
                }
            });

        } catch (error) { console.error(error); }
    }
};

/**
 * 合成可能なグループ（4体以上）をリストアップする
 */
function getFusionableGroups(pets) {
    const counts = {};
    pets.forEach(p => {
        const evo = p.evoLevel || 0;
        if (evo >= 3) return; // Neonは最大
        const key = `${p.name}:${evo}`;
        if (!counts[key]) counts[key] = { name: p.name, evoLevel: evo, count: 0 };
        counts[key].count++;
    });

    return Object.values(counts)
        .filter(g => g.count >= 4)
        .map(g => ({
            name: g.name,
            evoLevel: g.evoLevel,
            evoName: EVOLUTION_STAGES[g.evoLevel].name || 'Normal',
            nextEvoName: EVOLUTION_STAGES[g.evoLevel + 1].name
        }));
}