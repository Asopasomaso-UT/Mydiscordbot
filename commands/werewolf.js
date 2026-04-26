const { 
    SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, 
    ButtonStyle, StringSelectMenuBuilder, ComponentType, PermissionFlagsBits 
} = require('discord.js');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('werewolf')
        .setDescription('人狼ゲームを開始します（詳細設定モード）'),

    async execute(interaction) {
        // --- 1. ゲームの初期状態 ---
        const gameState = {
            host: interaction.user.id,
            players: new Map(), // ID -> { user, role, alive: true }
            // 役職設定（デフォルト）
            config: {
                wolfCount: 1,
                hasFortune: true,  // 占い師
                hasHunter: true,   // 狩人
                hasMedium: true,   // 霊媒師
                hasMadman: true,   // 狂人
                startPhase: 'night'
            }
        };

        // --- 2. 募集＆設定Embed生成 ---
        const createMainEmbed = () => {
            const pList = Array.from(gameState.players.values()).map((p, i) => `${i + 1}. ${p.user.username}`).join('\n') || 'なし';
            
            const conf = gameState.config;
            const roleIcons = [
                `🐺 人狼: ${conf.wolfCount}名`,
                `🔮 占い師: ${conf.hasFortune ? 'ON' : 'OFF'}`,
                `🛡️ 狩人: ${conf.hasHunter ? 'ON' : 'OFF'}`,
                `🔮 霊媒師: ${conf.hasMedium ? 'ON' : 'OFF'}`,
                `🤡 狂人: ${conf.hasMadman ? 'ON' : 'OFF'}`,
                `👨 市民: 残り全員`
            ].join('\n');

            return new EmbedBuilder()
                .setTitle('🐺 人狼ゲーム：ロビー')
                .setColor('DarkRed')
                .addFields(
                    { name: '参加者', value: pList, inline: true },
                    { name: '役職設定', value: roleIcons, inline: true },
                    { name: '設定', value: `開始: ${conf.startPhase === 'night' ? '🌙 夜' : '☀️ 昼'}\n合計人数: ${gameState.players.size}名`, inline: false }
                )
                .setFooter({ text: 'ホストは設定ボタンで構成を変更できます' });
        };

        // --- 3. 操作用コンポーネント ---
        const getButtons = () => new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('join').setLabel('参加').setStyle(ButtonStyle.Primary),
            new ButtonBuilder().setCustomId('leave').setLabel('退会').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId('open_config').setLabel('役職設定').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId('start').setLabel('ゲーム開始').setStyle(ButtonStyle.Danger)
        );

        const response = await interaction.reply({
            embeds: [createMainEmbed()],
            components: [getButtons()]
        });

        const collector = response.createMessageComponentCollector({ time: 900000 });

        collector.on('collect', async i => {
            // --- 参加・退会処理 ---
            if (i.customId === 'join') {
                if (gameState.players.has(i.user.id)) return i.reply({ content: '既に参加しています', ephemeral: true });
                gameState.players.set(i.user.id, { user: i.user, role: null, alive: true });
                await i.update({ embeds: [createMainEmbed()] });
            }
            if (i.customId === 'leave') {
                gameState.players.delete(i.user.id);
                await i.update({ embeds: [createMainEmbed()] });
            }

            // --- 役職設定メニューの表示 (ホストのみ) ---
            if (i.customId === 'open_config') {
                if (i.user.id !== gameState.host) return i.reply({ content: 'ホスト専用です', ephemeral: true });
                
                const configRow = new ActionRowBuilder().addComponents(
                    new StringSelectMenuBuilder().setCustomId('select_wolf').setPlaceholder('人狼の人数を選択')
                        .addOptions([
                            { label: '人狼 1名', value: '1' },
                            { label: '人狼 2名', value: '2' },
                            { label: '人狼 3名', value: '3' }
                        ])
                );
                const toggleRow = new ActionRowBuilder().addComponents(
                    new ButtonBuilder().setCustomId('toggle_fortune').setLabel('占い師 ON/OFF').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('toggle_hunter').setLabel('狩人 ON/OFF').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('toggle_medium').setLabel('霊媒師 ON/OFF').setStyle(ButtonStyle.Secondary),
                    new ButtonBuilder().setCustomId('toggle_madman').setLabel('狂人 ON/OFF').setStyle(ButtonStyle.Secondary)
                );

                await i.reply({ content: '役職の構成を変更してください：', components: [configRow, toggleRow], ephemeral: true });
            }

            // --- 設定メニュー内での操作反映 (ephemeralメッセージへの応答) ---
            if (i.customId === 'select_wolf') {
                gameState.config.wolfCount = parseInt(i.values[0]);
                await interaction.editReply({ embeds: [createMainEmbed()] });
                await i.update({ content: `人狼を ${i.values[0]} 名に設定しました。` });
            }
            if (i.customId.startsWith('toggle_')) {
                const key = i.customId.replace('toggle_', '');
                const configKey = key === 'fortune' ? 'hasFortune' : key === 'hunter' ? 'hasHunter' : key === 'medium' ? 'hasMedium' : 'hasMadman';
                gameState.config[configKey] = !gameState.config[configKey];
                await interaction.editReply({ embeds: [createMainEmbed()] });
                await i.update({ content: `${key} を ${gameState.config[configKey] ? 'ON' : 'OFF'} にしました。` });
            }

            // --- ゲーム開始ロジック ---
            if (i.customId === 'start') {
                if (i.user.id !== gameState.host) return i.reply({ content: 'ホスト専用です', ephemeral: true });
                
                const players = Array.from(gameState.players.values());
                const conf = gameState.config;

                // 役職プールの作成
                let rolePool = [];
                for (let n = 0; n < conf.wolfCount; n++) rolePool.push('wolf');
                if (conf.hasFortune) rolePool.push('fortune');
                if (conf.hasHunter) rolePool.push('hunter');
                if (conf.hasMedium) rolePool.push('medium');
                if (conf.hasMadman) rolePool.push('madman');
                
                if (players.size < rolePool.length) return i.reply({ content: '役職の数に対して参加者が足りません！', ephemeral: true });

                // 残りを市民で埋める
                while (rolePool.length < players.length) {
                    rolePool.push('villager');
                }

                // シャッフル
                rolePool = rolePool.sort(() => Math.random() - 0.5);

                // 配布
                for (let j = 0; j < players.length; j++) {
                    players[j].role = rolePool[j];
                    const roleNames = { 
                        wolf: '🐺人狼', fortune: '🔮占い師', hunter: '🛡️狩人', 
                        medium: '🔮霊媒師', madman: '🤡狂人', villager: '👨市民' 
                    };
                    
                    try {
                        await players[j].user.send(`【人狼ゲーム】\nあなたの役職は **${roleNames[players[j].role]}** です！`);
                    } catch (e) {
                        await interaction.channel.send(`⚠️ ${players[j].user.username} さんにDMが送れませんでした！`);
                    }
                }

                collector.stop();
                await i.update({ content: '✅ ゲーム開始！全員に役職を送信しました。', embeds: [], components: [] });
                
                // ここで前回の startMainGame(interaction, gameState) を呼ぶ
            }
        });
    }
};