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

        // --- セッション管理の初期化ガード ---
        if (!client.tradeSessions) {
            client.tradeSessions = new Set();
        }

        // 基本チェック
        if (target.id === initiator.id) return interaction.reply({ content: "自分自身とはトレードできません。", flags: [MessageFlags.Ephemeral] });
        if (target.bot) return interaction.reply({ content: "ボットとはトレードできません。", flags: [MessageFlags.Ephemeral] });

        // 重複トレードチェック
        if (client.tradeSessions.has(initiator.id) || client.tradeSessions.has(target.id)) {
            return interaction.reply({ content: "あなた、または相手は現在別のトレード中です。", flags: [MessageFlags.Ephemeral] });
        }

        // タイムアウト対策の即時応答
        try {
            await interaction.deferReply();
        } catch (e) { return; }

        // セッション開始
        client.tradeSessions.add(initiator.id);
        client.tradeSessions.add(target.id);

        let tradeState = {
            [initiator.id]: { pets: [], accepted: false, data: null },
            [target.id]: { pets: [], accepted: false, data: null }
        };

        const initiatorKey = `pet_data_${interaction.guild.id}_${initiator.id}`;
        const targetKey = `pet_data_${interaction.guild.id}_${target.id}`;
        
        // --- データ取得 ---
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

        // --- UI生成ロジック ---
        const createTradeEmbed = () => {
            const evoLevels = ['', 'Golden', 'Shiny', 'Neon'];
            const formatPetList = (userPets) => {
                if (userPets.length === 0) return '選択中...';
                return userPets.map(p => {
                    const evo = evoLevels[p.evoLevel || 0];
                    const enchant = p.enchant ? ` [${p.enchant.type}Lv.${p.enchant.level}]` : '';
                    return `・${evo ? `[${evo}] ` : ''}${p.name}${enchant}`;
                }).join('\n');
            };

            return new EmbedBuilder()
                .setTitle('🤝 ペットトレードセッション')
                .setColor('Yellow')
                .setDescription(`${initiator} ⇄ ${target}\n\n※ ペットを選択すると承認がリセットされます。`)
                .addFields(
                    { name: `🟦 ${initiator.username} の提示`, value: formatPetList(tradeState[initiator.id].pets), inline: true },
                    { name: `🟩 ${target.username} の提示`, value: formatPetList(tradeState[target.id].pets), inline: true }
                )
                .setFooter({ text: '双方が「確定」を押すとトレードが成立します。' });
        };

        const createComponents = (userId) => {
            const userPets = tradeState[userId].data.pets.slice(-25).reverse(); // 最新25匹
            const rows = [];

            const select = new StringSelectMenuBuilder()
                .setCustomId(`trade_select_${userId}`)
                .setPlaceholder('渡すペットを選択（最大5匹）')
                .setMinValues(0)
                .setMaxValues(Math.min(userPets.length, 5));

            userPets.forEach(p => {
                const evo = ['', 'Golden', 'Shiny', 'Neon'][p.evoLevel || 0];
                select.addOptions({
                    label: `${evo ? `[${evo}] ` : ''}${p.name}`,
                    description: `倍率: x${p.multiplier || 1}${p.enchant ? ` | ${p.enchant.type} Lv.${p.enchant.level}` : ''}`,
                    value: p.petId
                });
            });

            rows.push(new ActionRowBuilder().addComponents(select));
            rows.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`trade_confirm_${userId}`)
                    .setLabel(tradeState[userId].accepted ? '✅ 確定済み' : 'トレードを確定する')
                    .setStyle(tradeState[userId].accepted ? ButtonStyle.Success : ButtonStyle.Primary),
                new ButtonBuilder()
                    .setCustomId(`trade_cancel`)
                    .setLabel('中止')
                    .setStyle(ButtonStyle.Danger)
            ));

            return rows;
        };

        const msg = await interaction.editReply({
            content: `🔔 ${target}さん、${initiator}さんからトレードの申し込みです！\n**操作パネルは「自分が渡すペット」を選ぶためのものです。**`,
            embeds: [createTradeEmbed()],
            components: createComponents(initiator.id) 
        });

        const collector = msg.createMessageComponentCollector({ time: 300000 });

        collector.on('collect', async (i) => {
            if (i.user.id !== initiator.id && i.user.id !== target.id) {
                return i.reply({ content: "このトレードの当事者ではありません。", flags: [MessageFlags.Ephemeral] });
            }

            if (i.customId === 'trade_cancel') {
                return collector.stop('cancelled');
            }

            // ペット選択
            if (i.customId.startsWith('trade_select_')) {
                const userId = i.user.id;
                // 他人のメニューを操作させない
                if (i.customId !== `trade_select_${userId}`) {
                    return i.reply({ content: "自分のメニューでペットを選んでください。", flags: [MessageFlags.Ephemeral] });
                }

                tradeState[userId].pets = tradeState[userId].data.pets.filter(p => i.values.includes(p.petId));
                tradeState[userId].accepted = false; // 内容変更で承認解除
                tradeState[userId === initiator.id ? target.id : initiator.id].accepted = false; // 相手の承認も解除（重要：すり替え防止）

                await i.update({
                    embeds: [createTradeEmbed()],
                    components: createComponents(userId)
                });
            }

            // 確定ボタン
            if (i.customId.startsWith('trade_confirm_')) {
                const userId = i.user.id;
                if (i.customId !== `trade_confirm_${userId}`) {
                    return i.reply({ content: "自分のボタンを押してください。", flags: [MessageFlags.Ephemeral] });
                }

                if (tradeState[userId].pets.length === 0) {
                    return i.reply({ content: "ペットを1匹以上選んでください。", flags: [MessageFlags.Ephemeral] });
                }

                tradeState[userId].accepted = true;

                // メッセージを更新して、相手にも操作を促す
                await i.update({
                    embeds: [createTradeEmbed()],
                    components: createComponents(userId)
                });

                // 全員承認チェック
                if (tradeState[initiator.id].accepted && tradeState[target.id].accepted) {
                    collector.stop('success');
                }
            }
        });

        collector.on('end', async (collected, reason) => {
            // セッション解放
            client.tradeSessions.delete(initiator.id);
            client.tradeSessions.delete(target.id);

            if (reason === 'success') {
                try {
                    const initiatorSelected = tradeState[initiator.id].pets;
                    const targetSelected = tradeState[target.id].pets;

                    const initiatorSelectedIds = initiatorSelected.map(p => p.petId);
                    const targetSelectedIds = targetSelected.map(p => p.petId);

                    // DB一括更新
                    await Promise.all([
                        DataModel.findOneAndUpdate({ id: initiatorKey }, {
                            $pull: { 'value.pets': { petId: { $in: initiatorSelectedIds } } },
                            $push: { 'value.pets': { $each: targetSelected } }
                        }),
                        DataModel.findOneAndUpdate({ id: targetKey }, {
                            $pull: { 'value.pets': { petId: { $in: targetSelectedIds } } },
                            $push: { 'value.pets': { $each: initiatorSelected } }
                        })
                    ]);

                    await interaction.editReply({
                        content: `🎉 **トレード成立！**\n${initiator} ⇄ ${target}`,
                        embeds: [],
                        components: []
                    });
                } catch (err) {
                    console.error(err);
                    await interaction.editReply("❌ DB更新中に致命的なエラーが発生しました。");
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