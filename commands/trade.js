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

        // 自己トレード・ボットとのトレード禁止
        if (target.id === initiator.id) return interaction.reply({ content: "自分自身とはトレードできません。", flags: [MessageFlags.Ephemeral] });
        if (target.bot) return interaction.reply({ content: "ボットとはトレードできません。", flags: [MessageFlags.Ephemeral] });

        // 重複トレードチェック
        if (interaction.client.tradeSessions.has(initiator.id) || interaction.client.tradeSessions.has(target.id)) {
            return interaction.reply({ content: "現在、あなたまたは相手は他のトレードに参加中です。", flags: [MessageFlags.Ephemeral] });
        }

        await interaction.deferReply();

        // セッション開始
        interaction.client.tradeSessions.add(initiator.id);
        interaction.client.tradeSessions.add(target.id);

        let tradeState = {
            [initiator.id]: { pets: [], accepted: false, data: null },
            [target.id]: { pets: [], accepted: false, data: null }
        };

        // DBから双方のペットデータを取得
        const initiatorKey = `pet_data_${interaction.guild.id}_${initiator.id}`;
        const targetKey = `pet_data_${interaction.guild.id}_${target.id}`;
        
        const [initiatorDoc, targetDoc] = await Promise.all([
            DataModel.findOne({ id: initiatorKey }),
            DataModel.findOne({ id: targetKey })
        ]);

        if (!initiatorDoc?.value?.pets?.length || !targetDoc?.value?.pets?.length) {
            interaction.client.tradeSessions.delete(initiator.id);
            interaction.client.tradeSessions.delete(target.id);
            return interaction.editReply("双方、または片方がペットを所持していないためトレードできません。");
        }

        tradeState[initiator.id].data = initiatorDoc.value;
        tradeState[target.id].data = targetDoc.value;

        // --- UI生成関数 ---
        const createTradeEmbed = () => {
            return new EmbedBuilder()
                .setTitle('🤝 ペットトレード')
                .setColor('Yellow')
                .setDescription(`${initiator} ⇄ ${target}`)
                .addFields(
                    { 
                        name: `🟦 ${initiator.username} の出すペット`, 
                        value: tradeState[initiator.id].pets.length > 0 
                            ? tradeState[initiator.id].pets.map(p => `・${p.name}`).join('\n') 
                            : '選択中...', 
                        inline: true 
                    },
                    { 
                        name: `🟩 ${target.username} の出すペット`, 
                        value: tradeState[target.id].pets.length > 0 
                            ? tradeState[target.id].pets.map(p => `・${p.name}`).join('\n') 
                            : '選択中...', 
                        inline: true 
                    }
                )
                .setFooter({ text: '双方がペットを選択し、確定ボタンを押してください。' });
        };

        const createComponents = (userId) => {
            const userPets = tradeState[userId].data.pets.slice(-25); // 最新25匹
            const rows = [];

            const select = new StringSelectMenuBuilder()
                .setCustomId(`trade_select_${userId}`)
                .setPlaceholder('渡すペットを選択')
                .setMinValues(0)
                .setMaxValues(Math.min(userPets.length, 5)); // 一度に5匹まで

            userPets.forEach(p => {
                select.addOptions({
                    label: p.name,
                    description: `倍率: x${p.multiplier || 1}`,
                    value: p.petId
                });
            });

            rows.push(new ActionRowBuilder().addComponents(select));
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`trade_confirm_${userId}`)
                    .setLabel(tradeState[userId].accepted ? '準備完了済み' : 'トレードを確定する')
                    .setStyle(tradeState[userId].accepted ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`trade_cancel`)
                    .setLabel('中止')
                    .setStyle(ButtonStyle.Danger)
            ));

            return rows;
        };

        const msg = await interaction.editReply({
            content: `${target}さん、トレードの申し込みが届いています。`,
            embeds: [createTradeEmbed()],
            components: createComponents(initiator.id) // 最初は開始者に操作盤を出す
        });

        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            // トレード当事者以外は無視
            if (i.user.id !== initiator.id && i.user.id !== target.id) {
                return i.reply({ content: "このトレードには参加できません。", flags: [MessageFlags.Ephemeral] });
            }

            if (i.customId === 'trade_cancel') {
                collector.stop('cancelled');
                return;
            }

            // ペット選択処理
            if (i.customId.startsWith('trade_select_')) {
                const userId = i.user.id;
                const selectedIds = i.values;
                tradeState[userId].pets = tradeState[userId].data.pets.filter(p => selectedIds.includes(p.petId));
                tradeState[userId].accepted = false; // 内容が変わったら承認リセット
                
                await i.update({
                    embeds: [createTradeEmbed()],
                    components: createComponents(i.user.id)
                });
            }

            // 確定ボタン処理
            if (i.customId.startsWith('trade_confirm_')) {
                const userId = i.user.id;
                if (tradeState[userId].pets.length === 0) {
                    return i.reply({ content: "ペットを1匹以上選択してください。", flags: [MessageFlags.Ephemeral] });
                }

                tradeState[userId].accepted = true;
                await i.update({
                    embeds: [createTradeEmbed()],
                    components: createComponents(i.user.id)
                });

                // 双方が承認したかチェック
                if (tradeState[initiator.id].accepted && tradeState[target.id].accepted) {
                    collector.stop('success');
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            interaction.client.tradeSessions.delete(initiator.id);
            interaction.client.tradeSessions.delete(target.id);

            if (reason === 'success') {
                try {
                    // --- DB更新処理（アイテム交換） ---
                    const initiatorSelected = tradeState[initiator.id].pets;
                    const targetSelected = tradeState[target.id].pets;

                    const initiatorSelectedIds = initiatorSelected.map(p => p.petId);
                    const targetSelectedIds = targetSelected.map(p => p.petId);

                    // 発信者の更新: 自分のを消して、相手のを追加
                    await DataModel.findOneAndUpdate({ id: initiatorKey }, {
                        $pull: { 'value.pets': { petId: { $in: initiatorSelectedIds } } },
                        $push: { 'value.pets': { $each: targetSelected } }
                    });

                    // 相手の更新: 自分のを消して、発信者のを追加
                    await DataModel.findOneAndUpdate({ id: targetKey }, {
                        $pull: { 'value.pets': { petId: { $in: targetSelectedIds } } },
                        $push: { 'value.pets': { $each: initiatorSelected } }
                    });

                    await interaction.editReply({
                        content: `✅ **トレード成立！**\n${initiator.username} ⇄ ${target.username}`,
                        embeds: [],
                        components: []
                    });
                } catch (err) {
                    console.error(err);
                    await interaction.editReply("トレード処理中にエラーが発生しました。");
                }
            } else {
                await interaction.editReply({ content: "トレードがキャンセルされたか、タイムアウトしました。", embeds: [], components: [] });
            }
        });
    }
};