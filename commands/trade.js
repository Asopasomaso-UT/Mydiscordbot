const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('trade')
        .setDescription('他のユーザーとペットをトレードします')
        .addUserOption(option => 
            option.setName('target')
                .setDescription('トレード相手を選択してください')
                .setRequired(true)
        ),

    async execute(interaction) {
        const initiator = interaction.user;
        const target = interaction.options.getUser('target');
        const client = interaction.client;

        // セッション管理の初期化
        if (!client.tradeSessions) client.tradeSessions = new Set();

        // 基本バリデーション
        if (target.id === initiator.id || target.bot) {
            return interaction.reply({ content: "無効なトレード相手です。", flags: [MessageFlags.Ephemeral] });
        }

        if (client.tradeSessions.has(initiator.id) || client.tradeSessions.has(target.id)) {
            return interaction.reply({ content: "現在、あなたまたは相手は別のトレードに参加中です。", flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply();
        client.tradeSessions.add(initiator.id);
        client.tradeSessions.add(target.id);

        let tradeState = {
            [initiator.id]: { pets: [], accepted: false, data: null },
            [target.id]: { pets: [], accepted: false, data: null }
        };

        const initiatorKey = `pet_data_${interaction.guild.id}_${initiator.id}`;
        const targetKey = `pet_data_${interaction.guild.id}_${target.id}`;
        
        const [initiatorDoc, targetDoc] = await Promise.all([
            DataModel.findOne({ id: initiatorKey }),
            DataModel.findOne({ id: targetKey })
        ]);

        if (!initiatorDoc?.value?.pets?.length || !targetDoc?.value?.pets?.length) {
            client.tradeSessions.delete(initiator.id);
            client.tradeSessions.delete(target.id);
            return interaction.editReply("双方、または片方がペットを所持していないためトレードできません。");
        }

        tradeState[initiator.id].data = initiatorDoc.value;
        tradeState[target.id].data = targetDoc.value;

        // --- UI生成関数 ---
        const createTradeEmbed = () => {
            const formatList = (userId) => {
                const state = tradeState[userId];
                if (state.pets.length === 0) return '❌ 渡すペットを選択してください';
                return state.pets.map(p => `・${p.name}`).join('\n');
            };

            return new EmbedBuilder()
                .setTitle('🤝 ペットトレードセッション')
                .setColor('Yellow')
                .setDescription(`${initiator} ⇄ ${target}\n\n**自分の名前がついたメニューとボタンを操作してください。**`)
                .addFields(
                    { name: `🟦 ${initiator.username}${tradeState[initiator.id].accepted ? ' ✅確定済み' : ''}`, value: formatList(initiator.id), inline: true },
                    { name: `🟩 ${target.username}${tradeState[target.id].accepted ? ' ✅確定済み' : ''}`, value: formatList(target.id), inline: true }
                )
                .setFooter({ text: '※ペットを選択し直すと、双方の確定状態がリセットされます。' });
        };

        const createComponents = () => {
            const getPetOptions = (userId) => {
                return tradeState[userId].data.pets.slice(-25).reverse().map(p => ({
                    label: p.name,
                    description: `倍率: x${p.multiplier || 1}`,
                    value: p.petId
                }));
            };

            const rows = [
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`trade_select_${initiator.id}`)
                        .setPlaceholder(`${initiator.username}のペット選択`)
                        .setMaxValues(Math.min(tradeState[initiator.id].data.pets.length, 5))
                        .addOptions(getPetOptions(initiator.id))
                ),
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder()
                        .setCustomId(`trade_select_${target.id}`)
                        .setPlaceholder(`${target.username}のペット選択`)
                        .setMaxValues(Math.min(tradeState[target.id].data.pets.length, 5))
                        .addOptions(getPetOptions(target.id))
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId(`trade_confirm_${initiator.id}`)
                        .setLabel(`${initiator.username} 確定`)
                        .setStyle(tradeState[initiator.id].accepted ? ButtonStyle.Success : ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId(`trade_confirm_${target.id}`)
                        .setLabel(`${target.username} 確定`)
                        .setStyle(tradeState[target.id].accepted ? ButtonStyle.Success : ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setCustomId('trade_cancel')
                        .setLabel('トレード中止')
                        .setStyle(ButtonStyle.Danger)
                )
            ];
            return rows;
        };

        const response = await interaction.editReply({
            embeds: [createTradeEmbed()],
            components: createComponents()
        });

        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== initiator.id && i.user.id !== target.id) {
                return i.reply({ content: "このトレードには参加できません。", flags: [MessageFlags.Ephemeral] });
            }

            if (i.customId === 'trade_cancel') {
                return collector.stop('cancelled');
            }

            // インタラクション失敗を回避
            await i.deferUpdate().catch(() => {});

            // IDチェック
            if (i.customId.includes('_') && !i.customId.endsWith(i.user.id)) {
                return i.followUp({ content: "自分のパネルのみ操作可能です。", flags: [MessageFlags.Ephemeral] });
            }

            // ペット選択
            if (i.customId.startsWith('trade_select_')) {
                tradeState[i.user.id].pets = tradeState[i.user.id].data.pets.filter(p => i.values.includes(p.petId));
                tradeState[initiator.id].accepted = false;
                tradeState[target.id].accepted = false;
                await interaction.editReply({ embeds: [createTradeEmbed()], components: createComponents() });
            }

            // 確定ボタン
            if (i.customId.startsWith('trade_confirm_')) {
                if (tradeState[i.user.id].pets.length === 0) {
                    return i.followUp({ content: "交換するペットを1匹以上選んでください。", flags: [MessageFlags.Ephemeral] });
                }
                tradeState[i.user.id].accepted = true;
                await interaction.editReply({ embeds: [createTradeEmbed()], components: createComponents() });

                if (tradeState[initiator.id].accepted && tradeState[target.id].accepted) {
                    collector.stop('success');
                }
            }
        });

        collector.on('end', async (_, reason) => {
            client.tradeSessions.delete(initiator.id);
            client.tradeSessions.delete(target.id);

            if (reason === 'success') {
                try {
                    const initiatorSelectedIds = tradeState[initiator.id].pets.map(p => p.petId);
                    const targetSelectedIds = tradeState[target.id].pets.map(p => p.petId);

                    // MongoDBのConflictingUpdateOperatorsを回避するため、新しい配列を計算
                    const newInitiatorPets = [
                        ...tradeState[initiator.id].data.pets.filter(p => !initiatorSelectedIds.includes(p.petId)),
                        ...tradeState[target.id].pets
                    ];

                    const newTargetPets = [
                        ...tradeState[target.id].data.pets.filter(p => !targetSelectedIds.includes(p.petId)),
                        ...tradeState[initiator.id].pets
                    ];

                    // $set で一括上書き
                    await Promise.all([
                        DataModel.findOneAndUpdate({ id: initiatorKey }, { 'value.pets': newInitiatorPets }),
                        DataModel.findOneAndUpdate({ id: targetKey }, { 'value.pets': newTargetPets })
                    ]);

                    await interaction.editReply({ content: `✅ **トレード成立！**\nアイテムの交換に成功しました。`, embeds: [], components: [] });
                } catch (e) {
                    console.error("TRADE DB ERROR:", e);
                    await interaction.editReply({ content: "❌ トレード処理中にエラーが発生しました。", embeds: [], components: [] });
                }
            } else {
                await interaction.editReply({ 
                    content: reason === 'cancelled' ? "🚫 トレードが中止されました。" : "⏰ タイムアウトしました。", 
                    embeds: [], 
                    components: [] 
                });
            }
        });
    }
};