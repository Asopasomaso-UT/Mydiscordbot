const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

// 進化設定：Normal(0)の時は名前を空にする
const EVOLUTION_STAGES = [
    { name: '', multiplier: 1 },         // Level 0
    { name: 'Golden', multiplier: 2 },   // Level 1
    { name: 'Shiny', multiplier: 4 },    // Level 2
    { name: 'Neon', multiplier: 8 }      // Level 3
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの管理・4体合成を行います'),

    async execute(interaction) {
        // 全員に見えるモード。処理遅延によるエラーを防ぐため先に保留応答
        await interaction.deferReply({ ephemeral: false });

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        const createMainInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const maxEquipSlot = 3 + (currentData.superRebirthCount || 0);
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペット管理`)
                .setColor('Blue')
                .addFields({ 
                    name: `⚔️ 現在装備中 (${equippedPets.length} / ${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => {
                            const evo = EVOLUTION_STAGES[p.evoLevel || 0].name;
                            return `✅ **${evo ? `[${evo}] ` : ''}${p.name}**`;
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
                const displayMult = (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
                return {
                    label: `${evo ? `[${evo}] ` : ''}${p.name}`,
                    description: `レア: ${p.rarity} | 倍率: x${displayMult.toLocaleString()}`,
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

            let userData = result.value;

            // ID未付与データの修復
            let needsSave = false;
            userData.pets = userData.pets.map(p => {
                if (!p.petId) { p.petId = uuidv4(); needsSave = true; }
                return p;
            });
            if (needsSave) {
                await DataModel.findOneAndUpdate({ id: petKey }, { $set: { "value.pets": userData.pets } });
            }

            const response = await interaction.editReply(createMainInterface(userData));

            const collector = response.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id,
                time: 300000 
            });

            collector.on('collect', async (i) => {
                // エラー回避のため、まず「処理中」の状態にする
                if (!i.deferred && !i.replied) await i.deferUpdate();

                try {
                    const latestDoc = await DataModel.findOne({ id: petKey });
                    const currentData = latestDoc.value;

                    if (i.customId === 'pet_equip_toggle') {
                        const updated = await DataModel.findOneAndUpdate(
                            { id: petKey }, { $set: { 'value.equippedPetIds': i.values } }, { new: true }
                        );
                        await interaction.editReply(createMainInterface(updated.value));
                    }

                    if (i.customId === 'open_fusion_menu') {
                        const fusionGroups = getFusionableGroups(currentData.pets);
                        if (fusionGroups.length === 0) {
                            return await i.followUp({ content: '❌ 合成可能な4体のセット（同名・同ランク）がいません！', ephemeral: true });
                        }

                        const fusionSelect = new StringSelectMenuBuilder()
                            .setCustomId('execute_fusion')
                            .setPlaceholder('進化させるペットを選んでください');

                        fusionGroups.forEach(group => {
                            fusionSelect.addOptions({
                                label: `${group.evoName ? `[${group.evoName}] ` : ''}${group.name}`,
                                description: `4体を消費して ${group.nextEvoName} へ進化`,
                                value: `${group.name}:${group.evoLevel}`
                            });
                        });

                        const row = new ActionRowBuilder().addComponents(fusionSelect);
                        // 合成選択メニューは本人にだけ見えるように ephemeral で出す
                        await i.followUp({ content: '🧪 **進化させる種類を選んでください**', components: [row], ephemeral: true });
                    }

                    if (i.customId === 'execute_fusion') {
                        const [pName, pEvo] = i.values[0].split(':');
                        const evoLevel = parseInt(pEvo);
                        const targets = currentData.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evoLevel).slice(0, 4);

                        if (targets.length < 4) return await i.followUp({ content: 'エラー：対象が足りなくなりました', ephemeral: true });

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

                        // 成功通知（ephemeralの返信を更新）
                        await i.editReply({ content: `✅ **${pName}** が進化しました！`, components: [] });
                        // メインUIを最新状態へ
                        await interaction.editReply(createMainInterface(updated.value));
                    }
                } catch (err) {
                    console.error(err);
                }
            });

            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => null);
            });

        } catch (error) {
            console.error(error);
            if (interaction.deferred) await interaction.editReply('データの読み込みに失敗しました。');
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