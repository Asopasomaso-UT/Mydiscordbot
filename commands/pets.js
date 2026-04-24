const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const DataModel = mongoose.models.QuickData;

// 設定データの読み込み
const { PET_MASTER, EGG_CONFIG, EVOLUTION_STAGES } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの管理・進化・売却を行います'),

    async execute(interaction) {
        try {
            await interaction.deferReply();
        } catch (err) {
            return console.error("deferReply Error:", err);
        }

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        // --- 売却価格計算ロジック ---
        const calculateSellPrice = (pet) => {
            const petInfo = PET_MASTER[pet.name];
            const rarity = (petInfo?.rarity || 'Common').toLowerCase();
            const eggKey = Object.keys(EGG_CONFIG).find(k => k.toLowerCase().includes(rarity)) || 'common_egg';
            const basePrice = EGG_CONFIG[eggKey]?.price || 1000;
            
            // 進化段階倍率: 通常1倍, Golden5倍, Shiny25倍, Neon125倍 (調整可)
            const evoBonus = [1, 5, 25, 125][pet.evoLevel || 0];
            return Math.floor(basePrice * 0.1 * evoBonus);
        };

        // --- メインUI生成 ---
        const createMainInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const srCount = currentData.superRebirthCount || 0;
            const maxEquipSlot = 3 + srCount;
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            let totalMult = 0;
            equippedPets.forEach(p => {
                let m = (p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier;
                if (p.enchant?.type === 'power') m *= (1 + p.enchant.level * 0.2);
                if (p.enchant?.type === 'mimic') m *= (1 + p.enchant.level);
                totalMult += m;
            });

            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペット`)
                .setColor('Blue')
                .setDescription([
                    `最大装備枠: **${maxEquipSlot}**`,
                    `チーム合計倍率: **x${(totalMult || 1).toFixed(2)}**`,
                    `総所持数: **${pets.length}** 匹`
                ].join('\n'))
                .addFields({ 
                    name: `⚔️ 装備中 (${equippedPets.length}/${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => `✅ **${EVOLUTION_STAGES[p.evoLevel || 0].name || ''}${p.name}**`).join('\n')
                        : 'なし'
                });

            const displayPets = pets.slice(-25).reverse();
            const rows = [];

            if (displayPets.length > 0) {
                const select = new StringSelectMenuBuilder()
                    .setCustomId('pet_equip_toggle')
                    .setPlaceholder('装備切り替え（最新25匹表示）')
                    .setMinValues(0)
                    .setMaxValues(Math.min(displayPets.length, maxEquipSlot))
                    .addOptions(displayPets.map(p => ({
                        label: `${EVOLUTION_STAGES[p.evoLevel || 0].name || ''}${p.name}`,
                        description: `x${((p.multiplier || 1) * EVOLUTION_STAGES[p.evoLevel || 0].multiplier).toFixed(2)}`,
                        value: p.petId,
                        default: equippedIds.includes(p.petId)
                    })));
                rows.push(new ActionRowBuilder().addComponents(select));
            }

            const buttons = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('open_fusion_menu').setLabel('進化合成').setStyle(ButtonStyle.Primary).setEmoji('🧪'),
                new ButtonBuilder().setCustomId('open_sell_menu').setLabel('個別売却').setStyle(ButtonStyle.Danger).setEmoji('💰'),
                new ButtonBuilder().setCustomId('bulk_sell_low').setLabel('低レア一括売却').setStyle(ButtonStyle.Secondary).setEmoji('🗑️')
            );
            rows.push(buttons);

            return { embeds: [embed], components: rows };
        };

        // --- メインロジック ---
        try {
            const doc = await DataModel.findOne({ id: petKey });
            if (!doc || !doc.value?.pets?.length) return await interaction.editReply('ペットがいません。');

            const response = await interaction.editReply(createMainInterface(doc.value));
            const collector = response.createMessageComponentCollector({ filter: i => i.user.id === interaction.user.id, time: 600000 });

            collector.on('collect', async (i) => {
                await i.deferUpdate().catch(() => {});
                const latest = await DataModel.findOne({ id: petKey });
                const data = latest.value;

                // 1. 装備切り替え
                if (i.customId === 'pet_equip_toggle') {
                    const updated = await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.equippedPetIds': i.values } }, { returnDocument: 'after' });
                    await interaction.editReply(createMainInterface(updated.value));
                }

                // 2. 進化メニュー
                if (i.customId === 'open_fusion_menu') {
                    const groups = getFusionableGroups(data.pets);
                    if (!groups.length) return i.followUp({ content: '進化可能な4体セットがいません。', flags: [MessageFlags.Ephemeral] });

                    const menu = new StringSelectMenuBuilder().setCustomId('exec_fusion').setPlaceholder('進化させるペットを選択');
                    groups.forEach(g => menu.addOptions({ label: `${g.evoName}${g.name}`, description: `4体を消費して ${g.nextEvoName} へ`, value: `${g.name}:${g.evoLevel}` }));
                    await i.followUp({ content: '🧪 **進化合成**', components: [new ActionRowBuilder().addComponents(menu)], flags: [MessageFlags.Ephemeral] });
                }

                // 3. 個別売却メニュー
                if (i.customId === 'open_sell_menu') {
                    const sellable = data.pets.filter(p => !data.equippedPetIds.includes(p.petId)).slice(0, 25);
                    if (!sellable.length) return i.followUp({ content: '売却可能なペットがいません。', flags: [MessageFlags.Ephemeral] });

                    const menu = new StringSelectMenuBuilder().setCustomId('exec_sell').setPlaceholder('売却するペットを選択（複数可）').setMinValues(1).setMaxValues(sellable.length);
                    sellable.forEach(p => menu.addOptions({ label: `${p.name}`, description: `売却価格: ${calculateSellPrice(p).toLocaleString()} 💰`, value: p.petId }));
                    await i.followUp({ content: '💰 **個別売却**', components: [new ActionRowBuilder().addComponents(menu)], flags: [MessageFlags.Ephemeral] });
                }

                // 4. 低レア一括売却（Common & Uncommon）
                if (i.customId === 'bulk_sell_low') {
                    const targets = data.pets.filter(p => {
                        const r = (PET_MASTER[p.name]?.rarity || '').toLowerCase();
                        return (r === 'common' || r === 'uncommon') && !data.equippedPetIds.includes(p.petId);
                    });

                    if (!targets.length) return i.followUp({ content: '一括売却対象のペット（Common/Uncommon かつ 装備外）がいません。', flags: [MessageFlags.Ephemeral] });

                    const totalGain = targets.reduce((sum, p) => sum + calculateSellPrice(p), 0);
                    const remaining = data.pets.filter(p => !targets.some(t => t.petId === p.petId));

                    await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.pets': remaining } });
                    await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalGain } });

                    await i.followUp({ content: `🗑️ **一括売却完了**\n${targets.length}匹を売却し、**${totalGain.toLocaleString()}** 💰 獲得しました。`, flags: [MessageFlags.Ephemeral] });
                    const res = await DataModel.findOne({ id: petKey });
                    await interaction.editReply(createMainInterface(res.value));
                }

                // 実行系：進化
                if (i.customId === 'exec_fusion') {
                    const [pName, pEvo] = i.values[0].split(':');
                    const evo = parseInt(pEvo);
                    const targets = data.pets.filter(p => p.name === pName && (p.evoLevel || 0) === evo).slice(0, 4);
                    const targetIds = targets.map(t => t.petId);
                    const remaining = data.pets.filter(p => !targetIds.includes(p.petId));
                    remaining.push({ ...targets[0], petId: uuidv4(), evoLevel: evo + 1, obtainedAt: Date.now() });
                    const newEquip = data.equippedPetIds.filter(id => !targetIds.includes(id));

                    const updated = await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.pets': remaining, 'value.equippedPetIds': newEquip } }, { returnDocument: 'after' });
                    await i.editReply({ content: '✅ 進化しました！', components: [] });
                    await interaction.editReply(createMainInterface(updated.value));
                }

                // 実行系：個別売却
                if (i.customId === 'exec_sell') {
                    const selectedIds = i.values;
                    const targets = data.pets.filter(p => selectedIds.includes(p.petId));
                    const totalGain = targets.reduce((sum, p) => sum + calculateSellPrice(p), 0);
                    const remaining = data.pets.filter(p => !selectedIds.includes(p.petId));

                    await DataModel.findOneAndUpdate({ id: petKey }, { $set: { 'value.pets': remaining } });
                    await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: totalGain } });

                    await i.editReply({ content: `✅ ${targets.length}匹売却: +${totalGain.toLocaleString()} 💰`, components: [] });
                    const res = await DataModel.findOne({ id: petKey });
                    await interaction.editReply(createMainInterface(res.value));
                }
            });

        } catch (error) {
            console.error(error);
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
        name: g.name, evoLevel: g.evoLevel,
        evoName: EVOLUTION_STAGES[g.evoLevel].name,
        nextEvoName: EVOLUTION_STAGES[g.evoLevel + 1].name
    }));
}