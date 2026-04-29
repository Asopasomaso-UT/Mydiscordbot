const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, StringSelectMenuBuilder, ComponentType, PermissionFlagsBits 
} = require('discord.js');
const mongoose = require('mongoose');

// サーバーごとのゲーム進行状態を管理
const activeGames = new Map();

module.exports = {
    data: new SlashCommandBuilder()
        .setName('werewolf')
        .setDescription('人狼ゲームを開始/パネル呼び戻し/終了します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;

        // --- 1. すでにゲームが進行中の場合（呼び戻し処理） ---
        if (activeGames.has(guildId)) {
            const game = activeGames.get(guildId);

            // 古いパネルを削除
            if (game.lastMessage) {
                await game.lastMessage.delete().catch(() => {});
            }

            // 現在の状態のEmbedとComponentsで再送
            const res = await interaction.reply({ 
                content: '📢 パネルを最新の位置に移動しました。',
                embeds: game.currentEmbeds, 
                components: game.currentComponents,
                fetchReply: true 
            });

            game.lastMessage = res;
            return;
        }

        // --- 2. 新規ゲーム開始（募集フェーズ） ---
        const gameState = {
            host: interaction.user.id,
            players: new Map(),
            config: { wolfCount: 1, hasFortune: true, hasHunter: true, hasMedium: true, hasMadman: true },
            status: 'recruiting',
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
            
            gameState.currentEmbeds = [new EmbedBuilder()
                .setTitle('🐺 人狼ゲーム：募集パネル')
                .setColor('DarkRed')
                .addFields(
                    { name: '参加者', value: pList, inline: true },
                    { name: '構成', value: `狼:${conf.wolfCount}/占:${conf.hasFortune?'○':'×'}/狩:${conf.hasHunter?'○':'×'}/霊:${conf.hasMedium?'○':'×'}/狂:${conf.hasMadman?'○':'×'}`, inline: true }
                )
                .setFooter({ text: '埋もれたら /werewolf で呼び戻せます' })];

            gameState.currentComponents = [
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('join').setLabel('参加').setStyle(ButtonStyle.Primary),
                    new ButtonBuilder().setCustomId('leave').setLabel('退会').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('start').setLabel('開始').setStyle(ButtonStyle.Danger)
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('t_wolf').setLabel(`人狼:${gameState.config.wolfCount}`).setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('t_fortune').setLabel(`占:${gameState.config.hasFortune?'ON':'OFF'}`).setStyle(gameState.config.hasFortune?ButtonStyle.Success:ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('t_hunter').setLabel(`狩:${gameState.config.hasHunter?'ON':'OFF'}`).setStyle(gameState.config.hasHunter?ButtonStyle.Success:ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('t_medium').setLabel(`霊:${gameState.config.hasMedium?'ON':'OFF'}`).setStyle(gameState.config.hasMedium?ButtonStyle.Success:ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('t_madman').setLabel(`狂:${gameState.config.hasMadman?'ON':'OFF'}`).setStyle(gameState.config.hasMadman?ButtonStyle.Success:ButtonStyle.Secondary)
                ),
                new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('stop_game').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
                )
            ];
        };

        updateRecruitPanel();
        const response = await interaction.reply({ embeds: gameState.currentEmbeds, components: gameState.currentComponents, fetchReply: true });
        gameState.lastMessage = response;

        const collector = response.createMessageComponentCollector({ time: 3600000 });

        collector.on('collect', async i => {
            const hostOnlyIds = ['t_wolf', 't_fortune', 't_hunter', 't_medium', 't_madman', 'start', 'stop_game'];
            if (hostOnlyIds.includes(i.customId) && i.user.id !== gameState.host) {
                return i.reply({ content: 'ホストのみ操作可能です。', ephemeral: true });
            }

            if (i.customId === 'stop_game') {
                activeGames.delete(guildId);
                await setChatPermission(interaction.channel, true);
                return i.update({ content: '🛑 終了しました。', embeds: [], components: [] });
            }

            switch (i.customId) {
                case 'join': if (!gameState.players.has(i.user.id)) gameState.players.set(i.user.id, { user: i.user, role: null, alive: true }); break;
                case 'leave': gameState.players.delete(i.user.id); break;
                case 't_wolf': gameState.config.wolfCount = (gameState.config.wolfCount % 3) + 1; break;
                case 't_fortune': gameState.config.hasFortune = !gameState.config.hasFortune; break;
                case 't_hunter': gameState.config.hasHunter = !gameState.config.hasHunter; break;
                case 't_medium': gameState.config.hasMedium = !gameState.config.hasMedium; break;
                case 't_madman': gameState.config.hasMadman = !gameState.config.hasMadman; break;
                case 'start':
                    if (gameState.players.size < 4) return i.reply({ content: '4人以上必要です。', ephemeral: true });
                    collector.stop();
                    return runMainLoop(interaction, gameState);
            }
            updateRecruitPanel();
            await i.update({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });
        });
    }
};

async function runMainLoop(interaction, gameState) {
    const channel = interaction.channel;
    const players = Array.from(gameState.players.values());
    
    let pool = [];
    for(let i=0; i<gameState.config.wolfCount; i++) pool.push('wolf');
    if(gameState.config.hasFortune) pool.push('fortune');
    if(gameState.config.hasHunter) pool.push('hunter');
    if(gameState.config.hasMedium) pool.push('medium');
    if(gameState.config.hasMadman) pool.push('madman');
    while(pool.length < players.length) pool.push('villager');
    pool.sort(() => Math.random() - 0.5);

    players.forEach((p, i) => {
        p.role = pool[i];
        const rName = {wolf:'人狼',fortune:'占い師',hunter:'狩人',medium:'霊媒師',madman:'狂人',villager:'市民'};
        p.user.send(`【人狼】あなたの役職は **${rName[p.role]}** です。`).catch(() => {});
    });

    await interaction.editReply({ content: '🚀 ゲーム開始！', embeds: [], components: [] });

    while (activeGames.has(channel.guild.id)) {
        // --- 1. 夜フェーズ ---
        await setChatPermission(channel, false);
        const nightActions = { kill: null, check: null, guard: null, done: new Set() };
        const activeRoles = players.filter(p => p.alive && ['wolf', 'fortune', 'hunter'].includes(p.role));

        const updateNightState = () => {
            const status = activeRoles.map(p => {
                const rName = {wolf:'人狼',fortune:'占い師',hunter:'狩人'}[p.role];
                return `${rName}: ${nightActions.done.has(p.user.id) ? '✅ 完了' : '💤 待機中'}`;
            }).join('\n') || 'アクションが必要な生存役職はいません。';
            
            gameState.currentEmbeds = [new EmbedBuilder().setTitle(`🌙 第 ${gameState.dayCount} 夜`).setColor('Blue').setDescription(`役職者はDMで行動してください。\n\n**進行状況:**\n${status}`)];
            gameState.currentComponents = [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('to_day').setLabel('朝にする').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('stop_game_night').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
            )];
        };

        updateNightState();
        gameState.lastMessage = await channel.send({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });

        activeRoles.forEach(p => handleNightDM(p, gameState, nightActions, updateNightState));

        const nI = await gameState.lastMessage.awaitMessageComponent({ filter: i => i.user.id === gameState.host, time: 3600000 }).catch(() => null);
        if (!nI || nI.customId === 'stop_game_night') {
            activeGames.delete(channel.guild.id);
            break;
        }

        // --- 2. 昼フェーズ ---
        await setChatPermission(channel, true);
        let victim = (nightActions.kill && nightActions.kill !== nightActions.guard) ? gameState.players.get(nightActions.kill) : null;
        if (victim) victim.alive = false;

        await channel.send({ embeds: [new EmbedBuilder().setTitle(`☀️ 第 ${gameState.dayCount} 日`).setColor('Orange').setDescription(victim ? `昨晩、 **${victim.user.username}** が犠牲になりました。` : '昨晩、犠牲者は誰もいませんでした！')] });

        // --- 3. 投票フェーズ ---
        const votes = new Map();
        const aliveOnes = players.filter(p => p.alive);
        const updateVoteState = () => {
            const list = aliveOnes.map(p => `${p.user.username} ${votes.has(p.user.id) ? '✅ 完了' : '　'}`).join('\n');
            gameState.currentEmbeds = [new EmbedBuilder().setTitle('🗳️ 追放投票').setColor('Red').setDescription(`ボタンを押してDMで投票してください。\nスキップは平和村（追放なし）になります。\n\n${list}`)];
            gameState.currentComponents = [new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_vote').setLabel('投票する').setStyle(ButtonStyle.Danger),
                new ButtonBuilder().setCustomId('btn_skip').setLabel('投票スキップ').setStyle(ButtonStyle.Success),
                new ButtonBuilder().setCustomId('stop_game_vote').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
            )];
        };

        updateVoteState();
        gameState.lastMessage = await channel.send({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });

        const vColl = gameState.lastMessage.createMessageComponentCollector({ time: 600000 });
        
        let vResult = 'normal';
        const voteFinished = new Promise(resolve => {
            const listener = async (mi) => {
                if (mi.customId !== 'do_vote') return;
                await mi.deferUpdate().catch(() => {}); // 失敗対策

                votes.set(mi.user.id, mi.values[0]);
                await mi.editReply({ content: '投票を受け付けました。', components: [] });
                
                updateVoteState();
                await gameState.lastMessage.edit({ embeds: gameState.currentEmbeds }).catch(() => {});
                
                if (votes.size >= aliveOnes.length) {
                    channel.client.removeListener('interactionCreate', listener);
                    resolve('done');
                }
            };
            channel.client.on('interactionCreate', listener);
        });

        vColl.on('collect', async i => {
            if (i.customId === 'btn_vote') {
                const targets = aliveOnes.filter(t => t.user.id !== i.user.id);
                const sel = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('do_vote').addOptions(targets.map(t => ({ label: t.user.username, value: t.user.id }))));
                await i.user.send({ content: '投票先を選んでください：', components: [sel] }).catch(() => {});
                await i.reply({ content: 'DMに投票用紙を送りました。', ephemeral: true });
            } 
            else if (i.customId === 'btn_skip') {
                if (i.user.id !== gameState.host) return i.reply({ content: 'ホストのみスキップ可能です。', ephemeral: true });
                vResult = 'skipped';
                vColl.stop();
            }
            else if (i.customId === 'stop_game_vote') {
                vResult = 'stopped';
                vColl.stop();
            }
        });

        await Promise.race([voteFinished, new Promise(r => vColl.on('end', () => r()))]);
        channel.client.removeAllListeners('interactionCreate');

        if (vResult === 'stopped') {
            activeGames.delete(channel.guild.id);
            break;
        }

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
            gameState.lastExiled = null;
            await channel.send('⏩ ホストにより投票がスキップされました。誰も追放されません。');
        }

        // 勝利判定
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

        gameState.currentEmbeds = [new EmbedBuilder().setTitle('話し合い中').setDescription('次の夜へ進む場合はボタンを押してください。').setColor('Yellow')];
        gameState.currentComponents = [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('go_night').setLabel('次へ進む').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('stop_game_talk').setLabel('強制終了').setStyle(ButtonStyle.Secondary)
        )];
        gameState.lastMessage = await channel.send({ embeds: gameState.currentEmbeds, components: gameState.currentComponents });
        const nextI = await gameState.lastMessage.awaitMessageComponent({ filter: i => i.user.id === gameState.host });
        if (nextI.customId.startsWith('stop')) {
            activeGames.delete(channel.guild.id);
            break;
        }
        gameState.dayCount++;
    }
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
        } else await i.editReply({ content: '完了しました。', components: [] });
        acts.done.add(player.user.id);
        updateFn();
        if (gs.lastMessage) await gs.lastMessage.edit({ embeds: gs.currentEmbeds }).catch(() => {});
    }
}

async function giveReward(interaction, player, total) {
    const DataModel = mongoose.models.QuickData;
    const { formatCoin } = require('../utils/formatHelper');
    const { EVOLUTION_STAGES } = require('../utils/Pet-data');
    const bet = 1000;
    const petData = await DataModel.findOne({ id: `pet_data_${interaction.guild.id}_${player.user.id}` });
    let multi = 1.0;
    const equipped = (petData?.value?.pets || []).filter(p => (petData?.value?.equippedPetIds || []).map(id=>String(id)).includes(String(p.petId)));
    equipped.forEach(p => {
        const base = (p.multiplier || 1) * (EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
        multi += (base * (p.enchant?.type === 'power' ? 1 + (p.enchant.level * 0.2) : 1) - 1);
    });
    const finalMulti = ((player.role==='wolf'||player.role==='fortune')?2.5:1.5) + multi + (total * 0.2);
    const amount = Math.floor(bet * finalMulti);
    await DataModel.findOneAndUpdate({ id: `money_${interaction.guild.id}_${player.user.id}` }, { $inc: { value: amount } }, { upsert: true });
    await interaction.channel.send(`💰 **${player.user.username}** 報酬: **${formatCoin(amount)}** (x${finalMulti.toFixed(1)})`);
}

async function setChatPermission(channel, can) {
    try { await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: can }); } catch(e) {}
}