const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, StringSelectMenuBuilder 
} = require('discord.js');
const mongoose = require('mongoose');

const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('werewolf')
        .setDescription('人狼ゲームを開始/パネル呼び戻し/終了します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;

        if (activeGames.has(guildId)) {
            const game = activeGames.get(guildId);
            if (game.lastMessage) await game.lastMessage.delete().catch(() => {});
            const res = await interaction.reply({ 
                content: '📢 パネルを最新の位置に移動しました。',
                embeds: game.currentEmbeds, 
                components: game.currentComponents,
                fetchReply: true 
            });
            game.lastMessage = res;
            return;
        }

        const gameState = {
            host: interaction.user.id,
            players: new Map(),
            config: { wolfCount: 1, roles: ['fortune', 'hunter'] }, 
            dayCount: 1,
            lastExiled: null,
            lastMessage: null,
            currentEmbeds: [],
            currentComponents: []
        };
        activeGames.set(guildId, gameState);

        const updateRecruitPanel = () => {
            const pList = Array.from(gameState.players.values()).map((p, i) => `${i + 1}. ${p.user.username}`).join('\n') || 'なし';
            const conf = gameState.config;
            const roleLabels = { fortune: '🔮 占い師', hunter: '🛡️ 狩人', medium: '🔮 霊媒師', madman: '🤡 狂人' };
            const activeRolesText = conf.roles.length > 0 ? conf.roles.map(r => roleLabels[r]).join('\n') : 'なし';

            gameState.currentEmbeds = [new EmbedBuilder()
                .setTitle('🐺 人狼ゲーム：募集パネル')
                .setColor('DarkRed')
                .addFields(
                    { name: `参加者 (${gameState.players.size}人)`, value: pList, inline: true },
                    { name: '役職構成', value: `🐺 人狼: ${conf.wolfCount}名\n${activeRolesText}`, inline: true }
                )];

            gameState.currentComponents = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('join_toggle').setLabel('参加 / 抜ける').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('start').setLabel('開始').setStyle(ButtonStyle.Danger),
                    new ButtonBuilder().setCustomId('stop_game').setLabel('終了').setStyle(ButtonStyle.Secondary)
                ),
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_roles').setPlaceholder('追加役職を選択').setMinValues(0).setMaxValues(4)
                        .addOptions([
                            { label: '占い師', value: 'fortune', default: conf.roles.includes('fortune') },
                            { label: '狩人', value: 'hunter', default: conf.roles.includes('hunter') },
                            { label: '霊媒師', value: 'medium', default: conf.roles.includes('medium') },
                            { label: '狂人', value: 'madman', default: conf.roles.includes('madman') },
                        ])
                ),
                new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_wolf').setPlaceholder('人狼数').addOptions([
                        { label: '人狼 1名', value: '1', default: conf.wolfCount === 1 },
                        { label: '人狼 2名', value: '2', default: conf.wolfCount === 2 },
                        { label: '人狼 3名', value: '3', default: conf.wolfCount === 3 },
                    ])
                )
            ];
        };

        updateRecruitPanel();
        const response = await interaction.reply({ embeds: gameState.currentEmbeds, components: gameState.currentComponents, fetchReply: true });
        gameState.lastMessage = response;

        const collector = response.createMessageComponentCollector({ time: 3600000 });
        collector.on('collect', async i => {
            await i.deferUpdate().catch(() => {});
            if (i.customId === 'join_toggle') {
                if (gameState.players.has(i.user.id)) gameState.players.delete(i.user.id);
                else gameState.players.set(i.user.id, { user: i.user, role: null, alive: true });
            } else if (i.user.id === gameState.host) {
                if (i.customId === 'stop_game') {
                    activeGames.delete(guildId);
                    return i.editReply({ content: '🛑 終了しました。', embeds: [], components: [] });
                }
                if (i.customId === 'select_roles') gameState.config.roles = i.values;
                if (i.customId === 'select_wolf') gameState.config.wolfCount = parseInt(i.values[0]);
                if (i.customId === 'start') {
                    if (gameState.players.size < 4) return i.followUp({ content: '⚠ 4人以上必要です。', ephemeral: true });
                    collector.stop();
                    return runMainLoop(interaction, gameState);
                }
            }
            updateRecruitPanel();
            await i.editReply({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });
        });
    }
};

async function runMainLoop(interaction, gameState) {
    const channel = interaction.channel;
    const players = Array.from(gameState.players.values());
    const roleNames = { wolf: '人狼', fortune: '占い師', hunter: '狩人', medium: '霊媒師', madman: '狂人', villager: '市民' };
    
    let pool = [];
    for(let i=0; i<gameState.config.wolfCount; i++) pool.push('wolf');
    gameState.config.roles.forEach(r => pool.push(r));
    while(pool.length < players.length) pool.push('villager');
    pool.sort(() => Math.random() - 0.5);
    players.forEach((p, i) => {
        p.role = pool[i];
        p.user.send(`【人狼】あなたの役職は **${roleNames[p.role]}** です。`).catch(() => {});
    });

    await interaction.editReply({ content: '🚀 ゲーム開始！', embeds: [], components: [] });

    while (activeGames.has(channel.guild.id)) {
        await setChatPermission(channel, false);
        const nightActions = { kill: null, check: null, guard: null, done: new Set() };
        const activeRoles = players.filter(p => p.alive && ['wolf', 'fortune', 'hunter'].includes(p.role));

        const updateNightState = () => {
            const status = activeRoles.map(p => `${roleNames[p.role]}: ${nightActions.done.has(p.user.id) ? '✅' : '💤'}`).join('\n') || '待機なし';
            gameState.currentEmbeds = [new EmbedBuilder().setTitle(`🌙 第 ${gameState.dayCount} 夜`).setColor('Blue').setDescription(`役職者はDMを確認してください。\n\n**進行状況:**\n${status}`)];
            gameState.currentComponents = [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('to_day').setLabel('朝にする').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('stop_game').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
            )];
        };

        updateNightState();
        gameState.lastMessage = await channel.send({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });
        activeRoles.forEach(p => handleNightDM(p, gameState, nightActions, updateNightState));

        const nI = await gameState.lastMessage.awaitMessageComponent({ filter: i => i.user.id === gameState.host }).catch(() => null);
        if (!nI || nI.customId === 'stop_game') break;

        await setChatPermission(channel, true);
        let victim = (nightActions.kill && nightActions.kill !== nightActions.guard) ? gameState.players.get(nightActions.kill) : null;
        if (victim) victim.alive = false;

        await channel.send({ embeds: [new EmbedBuilder().setTitle(`☀️ 第 ${gameState.dayCount} 日`).setColor('Orange').setDescription(victim ? `昨晩、 **${victim.user.username}** が犠牲になりました。` : '昨晩、犠牲者は誰もいませんでした！')] });

        gameState.currentEmbeds = [new EmbedBuilder().setTitle('💬 話し合い中').setDescription('話し合いが終わったら、ホストはボタンを押して投票に進んでください。').setColor('Yellow')];
        gameState.currentComponents = [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('go_vote').setLabel('投票を開始する').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('stop_game').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
        )];
        gameState.lastMessage = await channel.send({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });
        
        const talkI = await gameState.lastMessage.awaitMessageComponent({ filter: i => i.user.id === gameState.host }).catch(() => null);
        if (!talkI || talkI.customId === 'stop_game') break;

        const votes = new Map();
        const aliveOnes = players.filter(p => p.alive);
        const updateVoteState = () => {
            const list = aliveOnes.map(p => `${p.user.username} ${votes.has(p.user.id) ? '✅' : '　'}`).join('\n');
            gameState.currentEmbeds = [new EmbedBuilder().setTitle('🗳️ 追放投票').setColor('Red').setDescription(`生存者はボタンからDMで投票してください。\n\n${list}`)];
            gameState.currentComponents = [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_vote').setLabel('投票する').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('btn_skip').setLabel('投票スキップ').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('stop_game').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
            )];
        };

        updateVoteState();
        await talkI.update({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });

        const vColl = gameState.lastMessage.createMessageComponentCollector({ time: 600000 });
        let vResult = 'normal';

        const voteFinished = new Promise(resolve => {
            const listener = async (mi) => {
                if (mi.customId !== 'do_vote') return;
                const voter = gameState.players.get(mi.user.id);
                if (!voter || !voter.alive) return mi.reply({ content: '幽霊は投票できません。', ephemeral: true });

                await mi.deferUpdate().catch(() => {});
                votes.set(mi.user.id, mi.values[0]);
                await mi.editReply({ content: '投票完了', components: [] });
                updateVoteState();
                await gameState.lastMessage.edit({ embeds: gameState.currentEmbeds }).catch(() => {});
                if (votes.size >= aliveOnes.length) resolve('done');
            };
            channel.client.on('interactionCreate', listener);
        });

        vColl.on('collect', async i => {
            if (i.customId === 'btn_vote') {
                const voter = gameState.players.get(i.user.id);
                if (!voter || !voter.alive) return i.reply({ content: 'あなたは死んでいるため投票できません。', ephemeral: true });
                const targets = aliveOnes.filter(t => t.user.id !== i.user.id);
                const sel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('do_vote').addOptions(targets.map(t => ({ label: t.user.username, value: t.user.id }))));
                await i.user.send({ content: '投票先を選択（生存者のみ）：', components: [sel] }).catch(() => {});
                await i.reply({ content: 'DMを確認してください。', ephemeral: true });
            } else if (i.user.id === gameState.host) {
                vResult = i.customId === 'btn_skip' ? 'skipped' : 'stopped';
                vColl.stop();
            }
        });

        await Promise.race([voteFinished, new Promise(r => vColl.on('end', () => r()))]);
        channel.client.removeAllListeners('interactionCreate');
        if (vResult === 'stopped') break;

        if (vResult !== 'skipped') {
            const counts = {};
            votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
            const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
            if (sorted[0]) {
                const exiled = gameState.players.get(sorted[0][0]);
                exiled.alive = false;
                gameState.lastExiled = exiled;
                await channel.send(`🗳️ 投票の結果、 **${exiled.user.username}** が追放されました。`);
            }
        } else {
            await channel.send('⏩ 投票がスキップされました。');
        }

        const nowAlive = players.filter(p => p.alive);
        const wCount = nowAlive.filter(p => p.role === 'wolf').length;
        if (wCount === 0 || wCount >= (nowAlive.length - wCount)) {
            const side = (wCount === 0) ? 'village' : 'wolf';
            await channel.send(`🎊 **${side==='village'?'村人':'人狼'}陣営の勝利！**`);
            for (const p of players) {
                const win = (side==='village' && p.role!=='wolf') || (side==='wolf' && p.role==='wolf');
                if (win) await giveReward(interaction, p, players.length);
            }
            break;
        }

        gameState.currentEmbeds = [new EmbedBuilder().setTitle('🌙 夜への準備').setDescription('準備ができたら次へ進んでください。').setColor('Grey')];
        gameState.currentComponents = [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('go_night').setLabel('次の夜へ進む').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stop_game').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
        )];
        gameState.lastMessage = await channel.send({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });
        const nextI = await gameState.lastMessage.awaitMessageComponent({ filter: i => i.user.id === gameState.host });
        if (nextI.customId === 'stop_game') break;
        gameState.dayCount++;
    }
    activeGames.delete(channel.guild.id);
    await setChatPermission(channel, true);
}

async function handleNightDM(player, gs, acts, updateFn) {
    const targets = Array.from(gs.players.values()).filter(p => p.alive && (player.role==='wolf' ? p.role!=='wolf' : (player.role==='fortune' ? p.user.id!==player.user.id : true)));
    const sel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('night_act').addOptions(targets.map(t => ({ label: t.user.username, value: t.user.id }))));
    const m = await player.user.send({ content: `夜の行動を選択してください:`, components: [sel] }).catch(() => null);
    if (!m) return;
    const i = await m.awaitMessageComponent({ time: 300000 }).catch(() => null);
    if (i) {
        await i.deferUpdate().catch(() => {});
        if (player.role === 'wolf') acts.kill = i.values[0];
        if (player.role === 'hunter') acts.guard = i.values[0];
        if (player.role === 'fortune') {
            const res = gs.players.get(i.values[0]).role === 'wolf' ? '人狼' : '人間';
            await i.editReply({ content: `${gs.players.get(i.values[0]).user.username} は **${res}** です。`, components: [] });
        } else await i.editReply({ content: 'アクションを完了しました。', components: [] });
        acts.done.add(player.user.id);
        updateFn();
        if (gs.lastMessage) await gs.lastMessage.edit({ embeds: gs.currentEmbeds }).catch(() => {});
    }
}

// 報酬付与（生涯獲得コインへの加算を含む）
async function giveReward(interaction, player, total) {
    try {
        const DataModel = mongoose.models.QuickData;
        const guildId = interaction.guild.id;
        const userId = player.user.id;
        
        // 報酬計算
        const bet = 1000;
        const finalMulti = ((player.role==='wolf'||player.role==='fortune')?2.5:1.5) + (total * 0.1);
        const amount = Math.floor(bet * finalMulti);
        
        // DB更新キー
        const moneyKey = `money_${guildId}_${userId}`;
        const totalEarnedKey = `total_earned_${guildId}_${userId}`;
        
        // 所持金と生涯獲得コインの両方を更新[cite: 10]
        await Promise.all([
            DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: amount } }, { upsert: true }),
            DataModel.findOneAndUpdate({ id: totalEarnedKey }, { $inc: { value: amount } }, { upsert: true })
        ]);
        
        await interaction.channel.send(`💰 **${player.user.username}** 報酬: **${amount}** コイン`);
    } catch(e) {
        console.error("報酬付与中にエラーが発生しました:", e);
    }
}

async function setChatPermission(channel, can) {
    try { await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: can }); } catch(e) {}
}