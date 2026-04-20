const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

const EVOLUTION_STAGES = [
    { name: 'Normal', multiplier: 1 },
    { name: 'Golden', multiplier: 2 },
    { name: 'Shiny', multiplier: 4 },
    { name: 'Neon', multiplier: 8 }
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの管理・4体合成を行います（全員に見えるモード）'),

    async execute(interaction) {
        // 自分以外にも見えるように設定（ephemeral: false）
        // 処理落ち防止のため先に deferReply を実行
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
                        ? equippedPets.map(p => `✅ **${EVOLUTION_STAGES[p.evoLevel || 0].name} ${p.name}**`).join('\n')
                        : '装備なし'
                });

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
                new ButtonBuilder().setCustomId('open_fusion_menu').setLabel('合成メニュー').setStyle(ButtonStyle.Primary).setEmoji('🧪')
            );

            return { embeds: [embed], components: [row1, row2] };
        };

        try {
            let result = await DataModel.findOne({ id: petKey });
            if (!result || !result.value?.pets?.length) return await interaction.editReply('ペットを持っていません。');

            let userData = result.value;

            // --- ID救済・データ修正 ---
            let needsSave = false;
            userData.pets = userData.pets.map(p => {
                if (!p.petId) { p.petId = uuidv4(); needsSave = true; }
                return p;
            });
            if (needsSave) {
                await DataModel.findOneAndUpdate({ id: petKey }, { $set: { "value.pets": userData.pets } });
            }

            const response = await interaction.editReply(createMainInterface(userData));

            // コレクター（自分だけが操作できるように設定）
            const collector = response.createMessageComponentCollector({ 
                filter: i => i.user.id === interaction.user.id,
                time: 300000 
            });

            collector.on('collect', async (i) => {
                try {
                    // 各インタラクションのたびに最新DBを確認
                    const latestDoc = await DataModel.findOne({ id: petKey });
                    const currentData = latestDoc.value;

                    if (i.customId === 'pet_equip_toggle') {
                        const updated = await DataModel.findOneAndUpdate(
                            { id: petKey }, { $set: { 'value.equippedPetIds': i.values } }, { new: true }
                        );
                        await i.update(createMainInterface(updated.value));
                    }

                    if (i.customId === 'open_fusion_menu') {
                        const fusionGroups = getFusionableGroups(currentData.pets);
                        if (fusionGroups.length === 0) {
                            return i.reply({ content: '❌ 合成可能な4体のセットがいません！', ephemeral: true });
                        }

                        const fusionSelect = new StringSelectMenuBuilder()
                            .setCustomId('execute_fusion')
                            .setPlaceholder('進化させるペットを選んでください');

                        fusionGroups.forEach(group => {
                            fusionSelect.addOptions({
                                label: `${group.evoName} ${group.name}`,
                                description: `4体を消費して ${group.nextEvoName} へ進化`,
                                value: `${group.name}:${group.evoLevel}`
                            });
                        });

                        const row = new ActionRowBuilder().addComponents(fusionSelect);
                        await i.reply({ content: '🧪 **進化させる種類を選んでください**', components: [row], ephemeral: true });
                    }

                    if (i.customId === 'execute_fusion') {
                        const [pName, pEvo] = i.values[0].split(':');
                        const evoLevel = parseInt(pEvo);
                        const targets = currentData.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evoLevel).slice(0, 4);

                        if (targets.length < 4) return i.update({ content: 'エラー：対象が足りません', components: [] });

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

                        // 合成完了後、元のメッセージを更新して、返信を消す
                        await i.update({ content: `✅ **${pName}** が進化しました！`, components: [] });
                        await interaction.editReply(createMainInterface(updated.value));
                    }
                } catch (err) {
                    console.error(err);
                    if (!i.replied && !i.deferred) await i.reply({ content: "エラーが発生しました。", ephemeral: true });
                }
            });

        } catch (error) {
            console.error(error);
            await interaction.editReply('データの読み込みに失敗しました。');
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