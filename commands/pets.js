const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

// 設定データの読み込み
const { PET_MASTER, EGG_CONFIG, EVOLUTION_STAGES } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペット管理（Mimic倍率計算を修正）'),

    async execute(interaction) {
        await interaction.deferReply();

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        // --- 共通：売却価格計算 ---
        const calculateSellPrice = (pet) => {
            const petInfo = PET_MASTER[pet.name];
            const rarity = (petInfo?.rarity || 'Common').toLowerCase();
            const eggKey = Object.keys(EGG_CONFIG).find(k => k.toLowerCase().includes(rarity)) || 'common_egg';
            const basePrice = EGG_CONFIG[eggKey]?.price || 1000;
            const evoBonus = [1, 5, 25, 125][pet.evoLevel || 0];
            return Math.floor(basePrice * 0.1 * evoBonus);
        };

        // --- 共通：表示名作成 ---
        const getPetDisplayName = (p) => {
            const evoPrefix = EVOLUTION_STAGES[p.evoLevel || 0].name ? `[${EVOLUTION_STAGES[p.evoLevel || 0].name}] ` : "";
            const enchantInfo = p.enchant ? ` ${p.enchant.type} Lv.${p.enchant.level}` : "";
            return `${evoPrefix}${p.name}${enchantInfo}`;
        };

        // --- 画面A: メインUI ---
        const createMainInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const srCount = currentData.superRebirthCount || 0;
            const maxEquipSlot = 3 + srCount;
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            let totalMult = 0;
            equippedPets.forEach(p => {
                // 1. 基本倍率 × 進化倍率
                let m = (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
                
                // 2. エンチャント計算（ここを修正！）
                if (p.enchant) {
                    if (p.enchant.type === 'power') {
                        m *= (1 + p.enchant.level * 0.2); // +20% / Lv
                    } else if (p.enchant.type === 'mimic') {
                        m *= (1 + p.enchant.level); // +100% / Lv (Lv.1で2倍、Lv.2で3倍...)
                    }
                }
                totalMult += m;
            });

            // チームに何もいない場合は 1.0 倍とする
            const displayTotal = totalMult === 0 ? "1.00" : totalMult.toFixed(2);

            const embed = new EmbedBuilder()
                .setTitle(`🐾 ペットチーム管理`)
                .setColor('Blue')
                .setDescription(`最大枠: **${maxEquipSlot}** | チーム倍率: **x${displayTotal}** | 所持: **${pets.length}**匹`)
                .addFields({ 
                    name: `⚔️ 装備中 (${equippedPets.length}/${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => `✅ **${getPetDisplayName(p)}**`).join('\n') 
                        : 'なし'
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
                            description: `単品倍率: x${((p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier).toFixed(2)}`,
                            value: p.petId,
                            default: equippedIds.includes(p.petId)
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

        // --- 画面B: 進化メニューUI ---
        const createFusionInterface = (pets) => {
            const groups = getFusionableGroups(pets);
            const embed = new EmbedBuilder().setTitle('🧪 ペット進化合成').setColor('Purple').setDescription('同じペット4体を消費して進化させます。');
            const rows = [];
            if (groups.length > 0) {
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('exec_fusion').setPlaceholder('進化させるペットを選択')
                        .addOptions(groups.map(g => ({ 
                            label: `${g.evoName}${g.name}`, 
                            description: `4体を消費して ${g.nextEvoName} に進化`, 
                            value: `${g.name}:${g.evoLevel}` 
                        })))
                ));
            } else {
                embed.setDescription('❌ 現在進化可能な4体セットのペットはいません。');
            }
            rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('goto_main').setLabel('戻る').setStyle(ButtonStyle.Secondary)));
            return { embeds: [embed], components: rows };
        };

        // --- 画面C: 売却メニューUI ---
        const createSellInterface = (pets, equippedIds) => {
            const sellable = pets.filter(p => !equippedIds.includes(p.petId)).slice(0, 25);
            const embed = new EmbedBuilder().setTitle('💰 ペット個別売却').setColor('Red').setDescription('売却するペットを選択してください。');
            const rows = [];
            if (sellable.length > 0) {
                rows.push(new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('exec_sell').setPlaceholder('売却するペットを選択').setMinValues(1).setMaxValues(sellable.length)
                        .addOptions(sellable.map(p => ({ 
                            label: getPetDisplayName(p), 
                            description: `売却価格: ${calculateSellPrice(p).toLocaleString()} 💰`, 
                            value: p.petId 
                        })))
                ));
            } else {
                embed.setDescription('❌ 売却できるペット（装備外）がいません。');
            }
            rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('goto_main').setLabel('戻る').setStyle(ButtonStyle.Secondary)));
            return { embeds: [embed], components: rows };
        };

        // --- ロジック実行 ---
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
                const targets = data.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evo).slice(0, 4);
                if (targets.length < 4) return;
                const targetIds = targets.map(t => t.petId);
                const remaining = data.pets.filter(p => !targetIds.includes(p.petId));
                remaining.push({ ...targets[0], petId: uuidv4(), evoLevel: evo + 1, obtainedAt: Date.now() });
                const newEquip = (data.equippedPetIds || []).filter(id => !targetIds.includes(id));
                const updated = await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.pets': remaining, 'value.equippedPetIds': newEquip } }, { returnDocument: 'after' });
                await interaction.editReply(createFusionInterface(updated.value.pets));
            }

            if (i.customId === 'exec_sell') {
                const targets = data.pets.filter(p => i.values.includes(p.petId));
                const totalGain = targets.reduce((sum, p) => sum + calculateSellPrice(p), 0);
                const remaining = data.pets.filter(p => !i.values.includes(p.petId));
                await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.pets': remaining } });
                await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalGain } });
                const res = await DataModel.findOne({ id: petKey });
                await interaction.editReply(createSellInterface(res.value.pets, res.value.equippedPetIds));
            }

            if (i.customId === 'bulk_sell_low') {
                const targets = data.pets.filter(p => {
                    const r = (PET_MASTER[p.name]?.rarity || '').toLowerCase();
                    return (r === 'common' || r === 'uncommon') && !data.equippedPetIds.includes(p.petId);
                });
                if (!targets.length) return;
                const totalGain = targets.reduce((sum, p) => sum + calculateSellPrice(p), 0);
                const remaining = data.pets.filter(p => !targets.some(t => t.petId === p.petId));
                await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.pets': remaining } });
                await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalGain } });
                await interaction.editReply(createMainInterface({ ...data, pets: remaining }));
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