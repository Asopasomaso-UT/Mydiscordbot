const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

const { PET_MASTER, EGG_CONFIG, EVOLUTION_STAGES } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペット管理'),

    async execute(interaction) {
        await interaction.deferReply();

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        const getPetDisplayName = (p) => {
            const evoPrefix = EVOLUTION_STAGES[p.evoLevel || 0].name ? `[${EVOLUTION_STAGES[p.evoLevel || 0].name}] ` : "";
            const enchantInfo = p.enchant ? ` ${p.enchant.type} Lv.${p.enchant.level}` : "";
            return `${evoPrefix}${p.name}${enchantInfo}`;
        };

        const createMainInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = (currentData.equippedPetIds || []).map(id => String(id));
            const srCount = currentData.superRebirthCount || 0;
            const maxEquipSlot = 3 + srCount;
            const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));
            
            let totalMult = 0;
            const equippedListStrings = equippedPets.map(p => {
                const baseValue = Number(p.multiplier || 1);
                const evoMultiplier = Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
                const baseTotal = baseValue * evoMultiplier;

                let bonusFactor = 1.0;
                if (p.enchant && p.enchant.type) {
                    const type = String(p.enchant.type).toLowerCase();
                    const level = Number(p.enchant.level || 0);
                    if (type === 'mimic') bonusFactor += level;
                    else if (type === 'power') bonusFactor += (level * 0.2);
                }

                const finalIndividual = baseTotal * bonusFactor;
                totalMult += finalIndividual;
                return `✅ **${getPetDisplayName(p)}** (x${finalIndividual.toFixed(2)})`;
            });

            const displayTotal = totalMult <= 0 ? "1.00" : totalMult.toFixed(2);

            const embed = new EmbedBuilder()
                .setTitle(`🐾 ペットチーム管理`)
                .setColor('Blue')
                .setDescription(`最大枠: **${maxEquipSlot}** | チーム倍率: **x${displayTotal}**\n所持数: **${pets.length}** 匹`)
                .addFields({ 
                    name: `⚔️ 装備中 (${equippedPets.length}/${maxEquipSlot})`, 
                    value: equippedListStrings.length > 0 ? equippedListStrings.join('\n') : 'なし'
                });

            const rows = [];
            const displayPets = pets.slice(-25).reverse();
            if (displayPets.length > 0) {
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId('pet_equip_toggle')
                        .setPlaceholder('装備を切り替える')
                        .setMinValues(0)
                        .setMaxValues(Math.min(displayPets.length, maxEquipSlot))
                        .addOptions(displayPets.map(p => ({
                            label: getPetDisplayName(p),
                            description: `基本: x${((p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier).toFixed(2)}`,
                            value: String(p.petId),
                            default: equippedIds.includes(String(p.petId))
                        })))
                ));
            }
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('goto_fusion').setLabel('進化画面へ').setStyle(ButtonStyle.Primary).setEmoji('🧪'),
                new ButtonBuilder().setCustomId('goto_sell').setLabel('売却画面へ').setStyle(ButtonStyle.Danger).setEmoji('💰'),
                new ButtonBuilder().setCustomId('bulk_sell_low').setLabel('低レア一括処分').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
            ));
            return { embeds: [embed], components: rows };
        };

        const createFusionInterface = (pets) => {
            const groups = getFusionableGroups(pets);
            const embed = new EmbedBuilder().setTitle('🧪 ペット進化合成').setColor('Purple');
            const rows = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('goto_main').setLabel('戻る').setStyle(ButtonStyle.Secondary))];
            if (groups.length > 0) {
                rows.unshift(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('exec_fusion').setPlaceholder('進化させるペットを選択')
                        .addOptions(groups.map(g => ({ label: `${g.evoName}${g.name}`, description: `4体を消費して ${g.nextEvoName} に進化`, value: `${g.name}:${g.evoLevel}` })))
                ));
            }
            return { embeds: [embed], components: rows };
        };

        const createSellInterface = (pets, equippedIds) => {
            const eIds = (equippedIds || []).map(id => String(id));
            const sellable = pets.filter(p => !eIds.includes(String(p.petId))).slice(0, 25);
            const embed = new EmbedBuilder().setTitle('💰 ペット個別売却').setColor('Red');
            const rows = [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('goto_main').setLabel('戻る').setStyle(ButtonStyle.Secondary))];
            if (sellable.length > 0) {
                rows.unshift(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('exec_sell').setPlaceholder('売却するペットを選択').setMinValues(1).setMaxValues(sellable.length)
                        .addOptions(sellable.map(p => ({ label: getPetDisplayName(p), value: String(p.petId) })))
                ));
            }
            return { embeds: [embed], components: rows };
        };

        const initialDoc = await DataModel.findOne({ id: petKey });
        if (!initialDoc || !initialDoc.value?.pets?.length) return await interaction.editReply('ペットを所持していません。');

        const response = await interaction.editReply(createMainInterface(initialDoc.value));
        const collector = response.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 600000 });

        collector.on('collect', async (i) => {
            await i.deferUpdate().catch(() => {});
            const latest = await DataModel.findOne({ id: petKey });
            const data = latest.value;

            if (i.customId === 'goto_main') await interaction.editReply(createMainInterface(data));
            if (i.customId === 'goto_fusion') await interaction.editReply(createFusionInterface(data.pets));
            if (i.customId === 'goto_sell') await interaction.editReply(createSellInterface(data.pets, data.equippedPetIds));

            if (i.customId === 'pet_equip_toggle') {
                const updated = await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.equippedPetIds': i.values } }, { returnDocument: 'after' });
                await interaction.editReply(createMainInterface(updated.value));
            }

            if (i.customId === 'exec_fusion') {
                const [pName, pEvo] = i.values[0].split(':');
                const evo = parseInt(pEvo);
                const nextEvo = evo + 1;
                
                const targets = data.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evo).slice(0, 4);
                if (targets.length < 4) return;
                
                const targetIds = targets.map(t => String(t.petId));
                const remaining = data.pets.filter(p => !targetIds.includes(String(p.petId)));
                remaining.push({ ...targets[0], petId: uuidv4(), evoLevel: nextEvo, obtainedAt: Date.now() });
                const newEquip = (data.equippedPetIds || []).filter(id => !targetIds.includes(String(id)));

                // --- 図鑑更新のロジック追加 ---[cite: 10]
                const discovered = data.discovered || [];
                // 進化後の名前を作成（例：Golden Slime）
                const nextEvoTag = EVOLUTION_STAGES[nextEvo].name;
                const nextEvoFullName = nextEvoTag ? `${nextEvoTag} ${pName}` : pName;

                // 上位の段階がすでに埋まっているかチェック
                let alreadyHasHigher = false;
                for (let lv = nextEvo + 1; lv < EVOLUTION_STAGES.length; lv++) {
                    const higherTag = EVOLUTION_STAGES[lv].name;
                    if (higherTag && discovered.includes(`${higherTag} ${pName}`)) {
                        alreadyHasHigher = true;
                        break;
                    }
                }

                const updateQuery = {
                    $set: { 'value.pets': remaining, 'value.equippedPetIds': newEquip }
                };

                // 上位種が未発見の場合のみ、現在の進化後を図鑑に追加
                if (!alreadyHasHigher) {
                    updateQuery.$addToSet = { 'value.discovered': nextEvoFullName };
                }

                const updated = await DataModel.findOneAndUpdate(
                    { id: petKey }, 
                    updateQuery, 
                    { returnDocument: 'after' }
                );
                await interaction.editReply(createFusionInterface(updated.value.pets));
            }

            if (i.customId === 'exec_sell') {
                const remaining = data.pets.filter(p => !i.values.includes(String(p.petId)));
                const totalGain = data.pets.filter(p => i.values.includes(String(p.petId))).reduce((s, p) => s + 100, 0); 
                await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.pets': remaining } });
                await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalGain } });
                const res = await DataModel.findOne({ id: petKey });
                await interaction.editReply(createSellInterface(res.value.pets, res.value.equippedPetIds));
            }
        });
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
        name: g.name, evoLevel: g.evoLevel,
        evoName: EVOLUTION_STAGES[g.evoLevel].name ? `[${EVOLUTION_STAGES[g.evoLevel].name}] ` : "",
        nextEvoName: EVOLUTION_STAGES[g.evoLevel + 1].name
    }));
}