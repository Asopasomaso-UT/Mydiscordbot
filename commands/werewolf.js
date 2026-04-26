const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, StringSelectMenuBuilder, ComponentType, PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('werewolf')
        .setDescription('人狼ゲームを開始します（設定・進行完全統合版）'),

    async execute(interaction) {
        // --- 1. ゲームの状態管理 ---
        const gameState = {
            host: interaction.user.id,
            players: new Map(), // ID -> { user, role, alive: true }
            config: {
                wolfCount: 1,
                hasFortune: true,
                hasHunter: true,
                hasMedium: true,
                hasMadman: true,
            },
            status: 'recruiting',
            dayCount: 1,
            lastExiled: null
        };

        // --- 2. パネル描画用関数 ---
        const createEmbed = () => {
            const pList = Array.from(gameState.players.values()).map((p, i) => `${i + 1}. ${p.user.username}`).join('\n') || 'なし';
            const conf = gameState.config;
            return new EmbedBuilder()
                .setTitle('🐺 人狼ゲーム：募集＆設定パネル')
                .setColor('DarkRed')
                .addFields(
                    { name: '参加者', value: pList, inline: true },
                    { name: '役職構成', value: [
                        `🐺 人狼: ${conf.wolfCount}名`,
                        `🔮 占い師: ${conf.hasFortune ? '✅' : '❌'}`,
                        `🛡️ 狩人: ${conf.hasHunter ? '✅' : '❌'}`,
                        `🔮 霊媒師: ${conf.hasMedium ? '✅' : '❌'}`,
                        `🤡 狂人: ${conf.hasMadman ? '✅' : '❌'}`,
                        `👨 市民: 残り全員`
                    ].join('\n'), inline: true }
                )
                .setFooter({ text: `合計: ${gameState.players.size}名 | ホスト: ${interaction.user.username}` });
        };

        const createComponents = () => [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('join').setLabel('参加').setStyle(ButtonStyle.Primary),
                new ButtonBuilder().setCustomId('leave').setLabel('退会').setStyle(ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('start').setLabel('ゲーム開始').setStyle(ButtonStyle.Danger)
            ),
            new ActionRowBuilder().addComponents(
                new StringSelectMenuBuilder().setCustomId('set_wolf').setPlaceholder('人狼の人数を選択')
                    .addOptions([
                        { label: '人狼 1名', value: '1', default: gameState.config.wolfCount === 1 },
                        { label: '人狼 2名', value: '2', default: gameState.config.wolfCount === 2 },
                        { label: '人狼 3名', value: '3', default: gameState.config.wolfCount === 3 },
                    ])
            ),
            new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('t_fortune').setLabel(`占い師:${gameState.config.hasFortune ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasFortune ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_hunter').setLabel(`狩人:${gameState.config.hasHunter ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasHunter ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_medium').setLabel(`霊媒師:${gameState.config.hasMedium ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasMedium ? ButtonStyle.Success : ButtonStyle.Secondary),
                new ButtonBuilder().setCustomId('t_madman').setLabel(`狂人:${gameState.config.hasMadman ? 'ON' : 'OFF'}`).setStyle(gameState.config.hasMadman ? ButtonStyle.Success : ButtonStyle.Secondary)
            )
        ];

        const response = await interaction.reply({ embeds: [createEmbed()], components: createComponents() });
        const collector = response.createMessageComponentCollector({ time: 900000 });

        collector.on('collect', async i => {
            const isHostAction = i.customId.startsWith('t_') || i.customId === 'set_wolf' || i.customId === 'start';
            if (isHostAction && i.user.id !== gameState.host) return i.reply({ content: 'ホストのみ操作可能です。', ephemeral: true });

            switch (i.customId) {
                case 'join':
                    if (gameState.players.has(i.user.id)) return i.reply({ content: '参加済みです', ephemeral: true });
                    gameState.players.set(i.user.id, { user: i.user, role: null, alive: true });
                    break;
                case 'leave': gameState.players.delete(i.user.id); break;
                case 'set_wolf': gameState.config.wolfCount = parseInt(i.values[0]); break;
                case 't_fortune': gameState.config.hasFortune = !gameState.config.hasFortune; break;
                case 't_hunter': gameState.config.hasHunter = !gameState.config.hasHunter; break;
                case 't_medium': gameState.config.hasMedium = !gameState.config.hasMedium; break;
                case 't_madman': gameState.config.hasMadman = !gameState.config.hasMadman; break;
                case 'start':
                    if (gameState.players.size < 4) return i.reply({ content: '4人以上必要です。', ephemeral: true });
                    await i.deferUpdate();
                    collector.stop();
                    return startGame(interaction, gameState);
            }
            await i.update({ embeds: [createEmbed()], components: createComponents() });
        });
    }
};

// --- ゲーム進行ロジック ---
async function startGame(interaction, gameState) {
    const players = Array.from(gameState.players.values());
    const conf = gameState.config;
    let rolePool = [];
    for (let n = 0; n < conf.wolfCount; n++) rolePool.push('wolf');
    if (conf.hasFortune) rolePool.push('fortune');
    if (conf.hasHunter) rolePool.push('hunter');
    if (conf.hasMedium) rolePool.push('medium');
    if (conf.hasMadman) rolePool.push('madman');

    if (players.length < rolePool.length) return interaction.followUp({ content: '役職が多すぎます！', ephemeral: true });
    while (rolePool.length < players.length) rolePool.push('villager');
    rolePool.sort(() => Math.random() - 0.5);

    const names = { wolf: '🐺人狼', fortune: '🔮占い師', hunter: '🛡️狩人', medium: '🔮霊媒師', madman: '🤡狂人', villager: '👨市民' };
    for (let j = 0; j < players.length; j++) {
        players[j].role = rolePool[j];
        await players[j].user.send(`【人狼】役職は **${names[players[j].role]}** です！`).catch(() => null);
    }

    gameState.status = 'playing';
    await interaction.editReply({ content: '✅ ゲーム開始！DMを確認してください。', embeds: [], components: [] });

    const channel = interaction.channel;
    while (gameState.status === 'playing') {
        // 夜フェーズ
        await setChatPermission(channel, false);
        await channel.send({ embeds: [new EmbedBuilder().setTitle(`🌙 第 ${gameState.dayCount} 夜`).setColor('Blue').setDescription('役職者はDMを確認してください。')] });

        const nightActions = { kill: null, check: null, guard: null };
        const promises = [];
        for (const [id, p] of gameState.players) {
            if (!p.alive) continue;
            if (p.role === 'wolf') promises.push(handleRoleDM(p.user, gameState, 'w', '🐺 誰を襲撃しますか？', nightActions));
            if (p.role === 'fortune') promises.push(handleRoleDM(p.user, gameState, 'f', '🔮 誰を占いますか？', nightActions));
            if (p.role === 'hunter') promises.push(handleRoleDM(p.user, gameState, 'h', '🛡️ 誰を護衛しますか？', nightActions));
            if (p.role === 'medium' && gameState.lastExiled) {
                const res = gameState.lastExiled.role === 'wolf' ? '人狼' : '人間';
                await p.user.send(`🔮 霊媒結果: 昨日追放された ${gameState.lastExiled.user.username} は **${res}** でした。`).catch(() => null);
            }
        }
        await Promise.all(promises);

        // 昼フェーズ
        await setChatPermission(channel, true);
        let victimMsg = '昨晩の犠牲者はいませんでした。';
        if (nightActions.kill && nightActions.kill !== nightActions.guard) {
            const victim = gameState.players.get(nightActions.kill);
            victim.alive = false;
            victimMsg = `昨晩、 **${victim.user.username}** が無残な姿で発見されました。`;
        }
        await channel.send({ embeds: [new EmbedBuilder().setTitle(`☀️ 第 ${gameState.dayCount} 日`).setColor('Orange').setDescription(`${victimMsg}\n\n話し合いの後、投票してください。`)] });

        // 投票処理
        const voteBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('v').setLabel('投票する').setStyle(ButtonStyle.Danger));
        const vMsg = await channel.send({ content: '🗳️ 投票ボタンを押してください。', components: [voteBtn] });
        const votes = new Map();
        const vColl = vMsg.createMessageComponentCollector({ time: 300000 });

        vColl.on('collect', async i => {
            const p = gameState.players.get(i.user.id);
            if (!p || !p.alive) return i.reply({ content: '生存者のみ可能です。', ephemeral: true });
            if (i.customId === 'v') {
                const targets = Array.from(gameState.players.values()).filter(tp => tp.alive && tp.user.id !== i.user.id);
                const sel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('sv').addOptions(targets.map(t => ({ label: t.user.username, value: t.user.id }))));
                await i.reply({ content: '誰を追放？', components: [sel], ephemeral: true });
            }
            if (i.customId === 'sv') {
                votes.set(i.user.id, i.values[0]);
                await i.update({ content: '投票完了', components: [] });
                const aliveCount = Array.from(gameState.players.values()).filter(p => p.alive).length;
                if (votes.size >= aliveCount) vColl.stop();
            }
        });
        await new Promise(r => vColl.on('end', r));

        const counts = {};
        votes.forEach(v => counts[v] = (counts[v] || 0) + 1);
        const sorted = Object.entries(counts).sort((a,b) => b[1]-a[1]);
        if (sorted[0]) {
            const exiled = gameState.players.get(sorted[0][0]);
            exiled.alive = false;
            gameState.lastExiled = exiled;
            await channel.send(`🗳️ 投票の結果、 **${exiled.user.username}** が追放されました。`);
        }

        // 勝利判定
        const alive = Array.from(gameState.players.values()).filter(p => p.alive);
        const wolves = alive.filter(p => p.role === 'wolf').length;
        if (wolves === 0) { await channel.send('🎉 **村人陣営の勝利！**'); break; }
        if (wolves >= (alive.length - wolves)) { await channel.send('🐺 **人狼陣営の勝利！**'); break; }

        const nextRow = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('next').setLabel('次の夜へ進む').setStyle(ButtonStyle.Primary));
        const nMsg = await channel.send({ content: 'ホストは次のフェーズへ進めてください。', components: [nextRow] });
        await nMsg.awaitMessageComponent({ filter: i => i.user.id === gameState.host });
        gameState.dayCount++;
    }
    await setChatPermission(channel, true);
}

// --- 共通DM処理 ---
async function handleRoleDM(user, gs, type, text, acts) {
    const targets = Array.from(gs.players.values()).filter(p => p.alive && (type === 'w' ? p.role !== 'wolf' : (type === 'f' ? p.user.id !== user.id : true)));
    const sel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('s').addOptions(targets.map(t => ({ label: t.user.username, value: t.user.id }))));
    const m = await user.send({ content: text, components: [sel] }).catch(() => null);
    if (!m) return;
    const i = await m.awaitMessageComponent({ time: 60000 }).catch(() => null);
    if (i) {
        const val = i.values[0];
        if (type === 'w') acts.kill = val;
        else if (type === 'h') acts.guard = val;
        else if (type === 'f') {
            const res = gs.players.get(val).role === 'wolf' ? '人狼' : '人間';
            await i.update({ content: `${gs.players.get(val).user.username} は **${res}** でした。`, components: [] });
            return;
        }
        await i.update({ content: '確定しました。', components: [] });
    }
}

async function setChatPermission(channel, can) {
    try { await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: can }); } catch(e) {}
}