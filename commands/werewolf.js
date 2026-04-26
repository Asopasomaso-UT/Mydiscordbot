const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, StringSelectMenuBuilder, ComponentType, PermissionFlagsBits 
} = require('discord.js');

// サーバーごとのゲーム進行状態を管理
const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('werewolf')
        .setDescription('人狼ゲームを開始/停止します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;

        // --- 強制終了チェック ---
        if (activeGames.has(guildId)) {
            const game = activeGames.get(guildId);
            if (interaction.user.id !== game.host) {
                return interaction.reply({ content: '現在ゲーム進行中です。ホストのみが強制終了できます。', ephemeral: true });
            }

            const stopBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('stop_confirm').setLabel('強制終了する').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('stop_cancel').setLabel('キャンセル').setStyle(ButtonStyle.Secondary)
            );
            return interaction.reply({ content: '⚠️ ゲームが進行中です。強制終了しますか？', components: [stopBtn], ephemeral: true });
        }

        // --- 1. 初期状態 ---
        const gameState = {
            host: interaction.user.id,
            players: new Map(),
            config: { wolfCount: 1, hasFortune: true, hasHunter: true, hasMedium: true, hasMadman: true },
            status: 'recruiting',
            dayCount: 1,
            lastExiled: null,
            interaction: interaction // 強制終了時に参照
        };
        activeGames.set(guildId, gameState);

        // --- 2. パネル描画 ---
        const createEmbed = () => {
            const pList = Array.from(gameState.players.values()).map((p, i) => `${i + 1}. ${p.user.username}`).join('\n') || 'なし';
            const conf = gameState.config;
            return new EmbedBuilder()
                .setTitle('🐺 人狼ゲーム：募集パネル')
                .setColor('DarkRed')
                .addFields(
                    { name: '参加者', value: pList, inline: true },
                    { name: '役職構成', value: `狼:${conf.wolfCount}/占:${conf.hasFortune ? '○' : '×'}/狩:${conf.hasHunter ? '○' : '×'}/霊:${conf.hasMedium ? '○' : '×'}/狂:${conf.hasMadman ? '○' : '×'}`, inline: true }
                );
        };

        const createComponents = () => [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join').setLabel('参加').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('leave').setLabel('退会').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('start').setLabel('開始').setStyle(ButtonStyle.Danger)
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('t_wolf').setLabel(`人狼:${gameState.config.wolfCount}`).setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_fortune').setLabel(`占:${gameState.config.hasFortune ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasFortune ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_hunter').setLabel(`狩:${gameState.config.hasHunter ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasHunter ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_medium').setLabel(`霊:${gameState.config.hasMedium ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasMedium ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_madman').setLabel(`狂:${gameState.config.hasMadman ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasMadman ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        ];

        const response = await interaction.reply({ embeds: [createEmbed()], components: createComponents(), fetchReply: true });
        const collector = response.createMessageComponentCollector({ time: 900000 });

        collector.on('collect', async i => {
            // 強制終了の確認処理
            if (i.customId === 'stop_confirm') {
                activeGames.delete(guildId);
                await setChatPermission(interaction.channel, true);
                return i.update({ content: '🛑 ゲームを強制終了しました。', embeds: [], components: [] });
            }
            if (i.customId === 'stop_cancel') return i.update({ content: '続行します。', components: [] });

            if (i.user.id !== gameState.host && i.customId !== 'join' && i.customId !== 'leave') {
                return i.reply({ content: 'ホストのみ操作可能です。', ephemeral: true });
            }

            switch (i.customId) {
                case 'join':
                    if (!gameState.players.has(i.user.id)) gameState.players.set(i.user.id, { user: i.user, role: null, alive: true });
                    break;
                case 'leave': gameState.players.delete(i.user.id); break;
                case 't_wolf': gameState.config.wolfCount = (gameState.config.wolfCount % 3) + 1; break;
                case 't_fortune': gameState.config.hasFortune = !gameState.config.hasFortune; break;
                case 't_hunter': gameState.config.hasHunter = !gameState.config.hasHunter; break;
                case 't_medium': gameState.config.hasMedium = !gameState.config.hasMedium; break;
                case 't_madman': gameState.config.hasMadman = !gameState.config.hasMadman; break;
                case 'start':
                    if (gameState.players.size < 4) return i.reply({ content: '4人以上必要です。', ephemeral: true });
                    collector.stop();
                    return startGame(interaction, gameState);
            }
            await i.update({ embeds: [createEmbed()], components: createComponents() });
        });
    }
};

// --- ゲームループ ---
async function startGame(interaction, gameState) {
    const channel = interaction.channel;
    const players = Array.from(gameState.players.values());
    const conf = gameState.config;

    // 役職配布
    let rolePool = [];
    for (let n = 0; n < conf.wolfCount; n++) rolePool.push('wolf');
    if (conf.hasFortune) rolePool.push('fortune');
    if (conf.hasHunter) rolePool.push('hunter');
    if (conf.hasMedium) rolePool.push('medium');
    if (conf.hasMadman) rolePool.push('madman');
    while (rolePool.length < players.length) rolePool.push('villager');
    rolePool.sort(() => Math.random() - 0.5);

    const names = { wolf: '🐺人狼', fortune: '🔮占い師', hunter: '🛡️狩人', medium: '🔮霊媒師', madman: '🤡狂人', villager: '👨市民' };
    for (let j = 0; j < players.length; j++) {
        players[j].role = rolePool[j];
        await players[j].user.send(`【人狼】あなたの役職: **${names[players[j].role]}**`).catch(() => null);
    }

    gameState.status = 'playing';
    await interaction.editReply({ content: '✅ ゲーム開始！', embeds: [], components: [] });

    while (gameState.status === 'playing') {
        if (!activeGames.has(channel.guild.id)) break; // 強制終了チェック

        // --- 夜 ---
        await setChatPermission(channel, false);
        await channel.send({ embeds: [new EmbedBuilder().setTitle(`🌙 第 ${gameState.dayCount} 夜`).setColor('Blue').setDescription('役職者はDMを確認してください。')] });

        const nightActions = { kill: null, check: null, guard: null };
        const promises = [];
        for (const [id, p] of gameState.players) {
            if (!p.alive) continue;
            if (p.role === 'wolf') promises.push(handleRoleDM(p.user, gameState, 'w', '🐺 襲撃先を選んでください', nightActions));
            if (p.role === 'fortune') promises.push(handleRoleDM(p.user, gameState, 'f', '🔮 占う先を選んでください', nightActions));
            if (p.role === 'hunter') promises.push(handleRoleDM(p.user, gameState, 'h', '🛡️ 守る先を選んでください', nightActions));
            if (p.role === 'medium' && gameState.lastExiled) {
                const res = gameState.lastExiled.role === 'wolf' ? '人狼' : '人間';
                await p.user.send(`🔮 霊媒結果: ${gameState.lastExiled.user.username} は **${res}** でした。`).catch(() => null);
            }
        }
        await Promise.all(promises);

        // --- 昼 ---
        await setChatPermission(channel, true);
        let victim = (nightActions.kill && nightActions.kill !== nightActions.guard) ? gameState.players.get(nightActions.kill) : null;
        if (victim) victim.alive = false;

        await channel.send({ embeds: [new EmbedBuilder().setTitle(`☀️ 第 ${gameState.dayCount} 日`).setColor('Orange').setDescription(victim ? `昨晩、 **${victim.user.username}** が犠牲になりました。` : '昨晩の犠牲者はいませんでした。')] });

        // --- 投票 (DM送信型) ---
        const votes = new Map();
        const alivePlayers = Array.from(gameState.players.values()).filter(p => p.alive);

        const getVoteEmbed = () => {
            const list = alivePlayers.map(p => `${p.user.username} ${votes.has(p.user.id) ? '✅ 投票済み' : '　'}`).join('\n');
            return new EmbedBuilder().setTitle('🗳️ 追放投票').setDescription(`下のボタンを押して、DMで投票先を選んでください。\n\n${list}`).setColor('Red');
        };

        const voteMsg = await channel.send({ embeds: [getVoteEmbed()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_vote_dm').setLabel('投票する (DM送信)').setStyle(ButtonStyle.Danger))] });

        const vColl = voteMsg.createMessageComponentCollector({ time: 600000 });
        vColl.on('collect', async i => {
            if (i.customId === 'open_vote_dm') {
                const p = gameState.players.get(i.user.id);
                if (!p || !p.alive) return i.reply({ content: '生存者のみ可能です', ephemeral: true });
                
                const targets = alivePlayers.filter(tp => tp.user.id !== i.user.id);
                const sel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('submit_vote_dm').addOptions(targets.map(t => ({ label: t.user.username, value: t.user.id }))));
                
                try {
                    await i.user.send({ content: '追放する人を選んでください：', components: [sel] });
                    await i.reply({ content: 'DMに投票メニューを送りました。', ephemeral: true });
                } catch(e) {
                    await i.reply({ content: 'DMが送れませんでした。設定を確認してください。', ephemeral: true });
                }
            }
        });

        // DMでの投票を別口で受け取る
        const checkVotes = async () => {
            return new Promise((resolve) => {
                const filter = (mi) => mi.customId === 'submit_vote_dm';
                const dmCollector = channel.client.on('interactionCreate', async mi => {
                    if (!mi.isStringSelectMenu() || mi.customId !== 'submit_vote_dm') return;
                    if (!gameState.players.has(mi.user.id)) return;

                    votes.set(mi.user.id, mi.values[0]);
                    await mi.update({ content: `**${gameState.players.get(mi.values[0]).user.username}** さんに投票しました。`, components: [] });
                    await voteMsg.edit({ embeds: [getVoteEmbed()] });

                    if (votes.size >= alivePlayers.length) {
                        channel.client.removeListener('interactionCreate', arguments.callee);
                        resolve();
                    }
                });
            });
        };

        await Promise.race([checkVotes(), new Promise(r => setTimeout(r, 300000))]);
        vColl.stop();

        // 集計
        const counts = {};
        votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
        const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
        if (sorted[0]) {
            const exiled = gameState.players.get(sorted[0][0]);
            exiled.alive = false;
            gameState.lastExiled = exiled;
            await channel.send(`🗳️ 投票の結果、 **${exiled.user.username}** が追放されました。`);
        }

        // 終了判定
        const nowAlive = Array.from(gameState.players.values()).filter(p => p.alive);
        const wolves = nowAlive.filter(p => p.role === 'wolf').length;
        if (wolves === 0) { await channel.send('🎉 村人勝利！'); break; }
        if (wolves >= (nowAlive.length - wolves)) { await channel.send('🐺 人狼勝利！'); break; }

        const nMsg = await channel.send({ content: 'ホストは「次へ」を押してください。', components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('next').setLabel('次へ進む').setStyle(ButtonStyle.Primary))] });
        await nMsg.awaitMessageComponent({ filter: i => i.user.id === gameState.host });
        gameState.dayCount++;
    }
    activeGames.delete(channel.guild.id);
    await setChatPermission(channel, true);
}

// --- 共通DM関数 ---
async function handleRoleDM(user, gs, type, text, acts) {
    const targets = Array.from(gs.players.values()).filter(p => p.alive && (type === 'w' ? p.role !== 'wolf' : (type === 'f' ? p.user.id !== user.id : true)));
    const sel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(type).addOptions(targets.map(t => ({ label: t.user.username, value: t.user.id }))));
    const m = await user.send({ content: text, components: [sel] }).catch(() => null);
    if (!m) return;
    const i = await m.awaitMessageComponent({ time: 60000 }).catch(() => null);
    if (i) {
        if (type === 'w') acts.kill = i.values[0];
        else if (type === 'h') acts.guard = i.values[0];
        else if (type === 'f') {
            const res = gs.players.get(i.values[0]).role === 'wolf' ? '人狼' : '人間';
            return i.update({ content: `${gs.players.get(i.values[0]).user.username} は **${res}** です。`, components: [] });
        }
        await i.update({ content: '完了', components: [] });
    }
}

async function setChatPermission(channel, can) {
    try { await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: can }); } catch(e) {}
}