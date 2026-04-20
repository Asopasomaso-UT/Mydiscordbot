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

        if (!client.tradeSessions) client.tradeSessions = new Set();

        if (target.id === initiator.id || target.bot) {
            return interaction.reply({ content: "無効な相手です。", flags: [MessageFlags.Ephemeral] });
        }

        if (client.tradeSessions.has(initiator.id) || client.tradeSessions.has(target.id)) {
            return interaction.reply({ content: "現在トレード進行中です。", flags: [MessageFlags.Ephemeral] });
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
            return interaction.editReply("ペット不足のためトレードできません。");
        }

        tradeState[initiator.id].data = initiatorDoc.value;
        tradeState[target.id].data = targetDoc.value;

        // --- UI生成ロジック ---
        const createTradeEmbed = () => {
            const formatList = (userId) => {
                const state = tradeState[userId];
                if (state.pets.length === 0) return '選択中...';
                return state.pets.map(p => `・${p.name}`).join('\n');
            };

            return new EmbedBuilder()
                .setTitle('🤝 トレードセッション')
                .setColor('Yellow')
                .addFields(
                    { name: `🟦 ${initiator.username}${tradeState[initiator.id].accepted ? ' ✅' : ''}`, value: formatList(initiator.id), inline: true },
                    { name: `🟩 ${target.username}${tradeState[target.id].accepted ? ' ✅' : ''}`, value: formatList(target.id), inline: true }
                );
        };

        const createComponents = () => {
            const rows = [];

            // 1. initiator(自分) 用のメニュー
            const initiatorSelect = new StringSelectMenuBuilder()
                .setCustomId(`trade_select_${initiator.id}`)
                .setPlaceholder(`${initiator.username}のペット選択`)
                .setMaxValues(Math.min(tradeState[initiator.id].data.pets.length, 5))
                .addOptions(tradeState[initiator.id].data.pets.slice(-25).map(p => ({ label: p.name, value: p.petId })));

            // 2. target(相手) 用のメニュー
            const targetSelect = new StringSelectMenuBuilder()
                .setCustomId(`trade_select_${target.id}`)
                .setPlaceholder(`${target.username}のペット選択`)
                .setMaxValues(Math.min(tradeState[target.id].data.pets.length, 5))
                .addOptions(tradeState[target.id].data.pets.slice(-25).map(p => ({ label: p.name, value: p.petId })));

            // 3. ボタン行 (自分用ボタン, 相手用ボタン, 中止)
            const buttons = new ActionRowBuilder().addComponents(
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
            );

            rows.push(new ActionRowBuilder().addComponents(initiatorSelect));
            rows.push(new ActionRowBuilder().addComponents(targetSelect));
            rows.push(buttons);
            return rows;
        };

        const response = await interaction.editReply({
            content: `双方、自分の名前がついたメニューとボタンを操作してください。`,
            embeds: [createTradeEmbed()],
            components: createComponents()
        });

        const collector = response.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            // 当事者以外を弾く
            if (i.user.id !== initiator.id && i.user.id !== target.id) {
                return i.reply({ content: "あなたはこのトレードに参加していません。", flags: [MessageFlags.Ephemeral] });
            }

            // 中止処理
            if (i.customId === 'trade_cancel') {
                return collector.stop('cancelled');
            }

            // 自分のIDが含まれるコンポーネントのみ操作可能にするチェック
            if (i.customId.includes('_') && !i.customId.endsWith(i.user.id)) {
                return i.reply({ content: "自分の名前のついた項目を操作してください。", flags: [MessageFlags.Ephemeral] });
            }

            // ペット選択
            if (i.customId.startsWith('trade_select_')) {
                tradeState[i.user.id].pets = tradeState[i.user.id].data.pets.filter(p => i.values.includes(p.petId));
                tradeState[initiator.id].accepted = false;
                tradeState[target.id].accepted = false;
                await i.update({ embeds: [createTradeEmbed()], components: createComponents() });
            }

            // 確定ボタン
            if (i.customId.startsWith('trade_confirm_')) {
                if (tradeState[i.user.id].pets.length === 0) {
                    return i.reply({ content: "ペットを1匹以上選択してください。", flags: [MessageFlags.Ephemeral] });
                }
                tradeState[i.user.id].accepted = true;
                await i.update({ embeds: [createTradeEmbed()], components: createComponents() });

                if (tradeState[initiator.id].accepted && tradeState[target.id].accepted) {
                    collector.stop('success');
                }
            }
        });

        collector.on('end', async (_, reason) => {
            client.tradeSessions.delete(initiator.id);
            client.tradeSessions.delete(target.id);

            if (reason === 'success') {
                // ...DB更新処理 (前回のロジックと同じなので省略可) ...
                try {
                    const initiatorSelectedIds = tradeState[initiator.id].pets.map(p => p.petId);
                    const targetSelectedIds = tradeState[target.id].pets.map(p => p.petId);

                    await Promise.all([
                        DataModel.findOneAndUpdate({ id: initiatorKey }, {
                            $pull: { 'value.pets': { petId: { $in: initiatorSelectedIds } } },
                            $push: { 'value.pets': { $each: tradeState[target.id].pets } }
                        }),
                        DataModel.findOneAndUpdate({ id: targetKey }, {
                            $pull: { 'value.pets': { petId: { $in: targetSelectedIds } } },
                            $push: { 'value.pets': { $each: tradeState[initiator.id].pets } }
                        })
                    ]);
                    await interaction.editReply({ content: `🎉 トレード成立！`, embeds: [], components: [] });
                } catch (e) { console.error(e); }
            } else {
                await interaction.editReply({ content: "トレードがキャンセルまたはタイムアウトしました。", embeds: [], components: [] });
            }
        });
    }
};