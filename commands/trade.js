const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trade')
        .setDescription('他のユーザーとペットをトレードします')
        .addUserOption(option => option.setName('target').setDescription('トレード相手を選択').setRequired(true)),

    async execute(interaction) {
        const initiator = interaction.user;
        const target = interaction.options.getUser('target');
        const client = interaction.client;

        if (!client.tradeSessions) client.tradeSessions = new Set();
        if (target.id === initiator.id || target.bot) return interaction.reply({ content: "無効な相手です。", flags: [MessageFlags.Ephemeral] });
        if (client.tradeSessions.has(initiator.id) || client.tradeSessions.has(target.id)) return interaction.reply({ content: "トレード中です。", flags: [MessageFlags.Ephemeral] });

        await interaction.deferReply();
        client.tradeSessions.add(initiator.id); client.tradeSessions.add(target.id);

        let tradeState = {
            [initiator.id]: { pets: [], accepted: false, data: null },
            [target.id]: { pets: [], accepted: false, data: null }
        };

        const initiatorKey = `pet_data_${interaction.guild.id}_${initiator.id}`;
        const targetKey = `pet_data_${interaction.guild.id}_${target.id}`;
        const [initiatorDoc, targetDoc] = await Promise.all([DataModel.findOne({ id: initiatorKey }), DataModel.findOne({ id: targetKey })]);

        tradeState[initiator.id].data = initiatorDoc?.value || { pets: [] };
        tradeState[target.id].data = targetDoc?.value || { pets: [] };

        const createTradeEmbed = () => {
            const formatList = (userId) => {
                const state = tradeState[userId];
                if (state.pets.length === 0) return '🎁 (なし / プレゼント)'; // 何も出さない場合[cite: 8]
                return state.pets.map(p => {
                    const prefix = EVOLUTION_STAGES[p.evoLevel || 0].name ? `[${EVOLUTION_STAGES[p.evoLevel || 0].name}] ` : "";
                    return `・${prefix}${p.name}`;
                }).join('\n');
            };
            return new EmbedBuilder()
                .setTitle('🤝 ペットトレード')
                .setColor('Yellow')
                .addFields(
                    { name: `🟦 ${initiator.username}${tradeState[initiator.id].accepted ? ' ✅' : ''}`, value: formatList(initiator.id), inline: true },
                    { name: `🟩 ${target.username}${tradeState[target.id].accepted ? ' ✅' : ''}`, value: formatList(target.id), inline: true }
                );
        };

        const createComponents = () => {
            const getPetOptions = (userId) => {
                const pets = tradeState[userId].data.pets || [];
                if (pets.length === 0) return [{ label: "ペットなし", value: "none" }];
                return pets.slice(-25).reverse().map(p => {
                    const prefix = EVOLUTION_STAGES[p.evoLevel || 0].name ? `[${EVOLUTION_STAGES[p.evoLevel || 0].name}] ` : "";
                    return { label: `${prefix}${p.name}`, value: p.petId };
                });
            };

            const rows = [
                new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`trade_select_${initiator.id}`).setPlaceholder(`${initiator.username}の選択`).setDisabled(tradeState[initiator.id].data.pets.length === 0).addOptions(getPetOptions(initiator.id)).setMaxValues(Math.min(tradeState[initiator.id].data.pets.length || 1, 5))),
                new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`trade_select_${target.id}`).setPlaceholder(`${target.username}の選択`).setDisabled(tradeState[target.id].data.pets.length === 0).addOptions(getPetOptions(target.id)).setMaxValues(Math.min(tradeState[target.id].data.pets.length || 1, 5))),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId(`trade_confirm_${initiator.id}`).setLabel(`${initiator.username} 確定`).setStyle(tradeState[initiator.id].accepted ? ButtonStyle.Success : ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId(`trade_confirm_${target.id}`).setLabel(`${target.username} 確定`).setStyle(tradeState[target.id].accepted ? ButtonStyle.Success : ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('trade_cancel').setLabel('中止').setStyle(ButtonStyle.Danger)
                )
            ];
            return rows;
        };

        const response = await interaction.editReply({ embeds: [createTradeEmbed()], components: createComponents() });
        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== initiator.id && i.user.id !== target.id) return i.reply({ content: "参加できません。", flags: [MessageFlags.Ephemeral] });
            if (i.customId === 'trade_cancel') return collector.stop('cancelled');
            await i.deferUpdate();

            if (i.customId.startsWith('trade_select_')) {
                if (i.customId.endsWith(i.user.id)) {
                    tradeState[i.user.id].pets = tradeState[i.user.id].data.pets.filter(p => i.values.includes(p.petId));
                    tradeState[initiator.id].accepted = false; tradeState[target.id].accepted = false;
                    await interaction.editReply({ embeds: [createTradeEmbed()], components: createComponents() });
                }
            }

            if (i.customId.startsWith('trade_confirm_')) {
                if (i.customId.endsWith(i.user.id)) {
                    tradeState[i.user.id].accepted = true; // 何も出さなくても確定可能[cite: 8]
                    await interaction.editReply({ embeds: [createTradeEmbed()], components: createComponents() });
                    if (tradeState[initiator.id].accepted && tradeState[target.id].accepted) collector.stop('success');
                }
            }
        });

        collector.on('end', async (_, reason) => {
            client.tradeSessions.delete(initiator.id); client.tradeSessions.delete(target.id);
            if (reason === 'success') {
                const initiatorSelectedIds = tradeState[initiator.id].pets.map(p => p.petId);
                const targetSelectedIds = tradeState[target.id].pets.map(p => p.petId);
                const newInitiatorPets = [...tradeState[initiator.id].data.pets.filter(p => !initiatorSelectedIds.includes(p.petId)), ...tradeState[target.id].pets];
                const newTargetPets = [...tradeState[target.id].data.pets.filter(p => !targetSelectedIds.includes(p.petId)), ...tradeState[initiator.id].pets];
                
                // トレード成立時、双方の図鑑に相手のペットを登録[cite: 7]
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: initiatorKey }, { 'value.pets': newInitiatorPets, $addToSet: { 'value.discovered': { $each: tradeState[target.id].pets.map(p => p.name) } } }),
                    DataModel.findOneAndUpdate({ id: targetKey }, { 'value.pets': newTargetPets, $addToSet: { 'value.discovered': { $each: tradeState[initiator.id].pets.map(p => p.name) } } })
                ]);
                await interaction.editReply({ content: `✅ トレード成立！`, embeds: [], components: [] });
            } else {
                await interaction.editReply({ content: "🚫 トレードが終了しました。", embeds: [], components: [] });
            }
        });
    }
};