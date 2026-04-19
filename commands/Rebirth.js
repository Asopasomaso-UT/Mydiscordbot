const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper');
const { REBIRTH_CONFIG } = require('../utils/Pet-data');

// モデルの安全な定義
const dataSchema = mongoose.models.QuickData?.schema || new mongoose.Schema({
    id: String,
    value: mongoose.Schema.Types.Mixed
}, { collection: 'quickmongo' });

const DataModel = mongoose.models.QuickData || mongoose.model('QuickData', dataSchema);

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rebirth')
        .setDescription('リバースを行い、Super Coinの獲得や能力解放を目指します'),

    async execute(interaction) {
        // deferReplyを最初に行い、DB操作中のタイムアウトを防ぐ
        await interaction.deferReply();

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const moneyKey = `money_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        try {
            // データの取得
            const [moneyData, userData] = await Promise.all([
                DataModel.findOne({ id: moneyKey }),
                DataModel.findOne({ id: petKey })
            ]);

            const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;
            const rebirths = userData?.value?.rebirthCount || 0;
            const srCount = userData?.value?.superRebirthCount || 0;
            const currentMaxSlots = userData?.value?.maxSlots || 3;

            // SRに必要な条件の計算 (30, 40, 50...)
            const requiredRebirths = 30 + (srCount * 10); 
            // もらえるSCの計算 (1, 2, 3...)
            const scReward = srCount + 1; 

            // --- 1. スーパーリバース (SR) の判定 ---
            if (rebirths >= requiredRebirths) {
                const canExtendSlot = currentMaxSlots < (3 + 7); // 初期3 + 拡張7 = 最大10
                
                const srEmbed = new EmbedBuilder()
                    .setTitle('✨ SUPER REBIRTH READY')
                    .setColor('LuminousVividPink')
                    .setDescription([
                        `リバース回数が **${rebirths}/${requiredRebirths}** に達しました！`,
                        `スーパーリバースを実行して、次元を超越しますか？`,
                        `━━━━━━━━━━━━━━`,
                        `🎁 **今回のSR報酬:**`,
                        `💎 **Super Coin +${scReward} 枚**`,
                        `🔥 **ベース獲得倍率 +0.1倍** (永久加算)`,
                        canExtendSlot ? `🎒 **ペット装備枠 +1** (現在: ${currentMaxSlots} ➔ ${currentMaxSlots + 1})` : `🎒 **ペット装備枠** (既に最大10枠です)`,
                        `━━━━━━━━━━━━━━`,
                        `⚠️ **リセットされるもの:**`,
                        `・所持金 ➔ **0**`,
                        `・通常リバース回数 ➔ **0**`,
                        `※所持ペットやSCショップの強化は維持されます`
                    ].join('\n'));

                const srBtn = new ButtonBuilder()
                    .setCustomId('do_super_rebirth')
                    .setLabel('SUPER REBIRTHを実行する')
                    .setStyle(ButtonStyle.Danger);

                const row = new ActionRowBuilder().addComponents(srBtn);
                const response = await interaction.editReply({ embeds: [srEmbed], components: [row] });

                const collector = response.createMessageComponentCollector({ time: 60000 });

                collector.on('collect', async (i) => {
                    if (i.user.id !== userId) return i.reply({ content: '自分のリバースしか操作できません。', ephemeral: true });

                    // SR 実行処理
                    await Promise.all([
                        DataModel.findOneAndUpdate({ id: moneyKey }, { value: 0 }),
                        DataModel.findOneAndUpdate({ id: petKey }, { 
                            $set: { 'value.rebirthCount': 0 },
                            $inc: { 
                                'value.superRebirthCount': 1,
                                'value.superCoin': scReward,
                                'value.maxSlots': canExtendSlot ? 1 : 0
                            }
                        })
                    ]);

                    await i.update({ 
                        content: `🌌 **SUPER REBIRTH 成功！**\n**${scReward}枚** のSuper Coinを獲得しました。\n倍率と装備枠が強化され、新たな冒険が始まります。`, 
                        embeds: [], 
                        components: [] 
                    });
                    collector.stop();
                });
                return;
            }

            // --- 2. 通常リバースの判定 ---
            // 必要金額の計算 (1M, 2M, 3M...)
            const nextRebirthCost = 1000000 * (rebirths + 1);

            const embed = new EmbedBuilder()
                .setTitle('♻️ REBIRTH')
                .setColor(currentMoney >= nextRebirthCost ? 'Green' : 'Grey')
                .setDescription([
                    `現在の通常リバース: **${rebirths}** / **${requiredRebirths}**`,
                    `SRまであと **${requiredRebirths - rebirths}** 回のリバースが必要です。`,
                    `━━━━━━━━━━━━━━`,
                    `次回の通常リバース費用:`,
                    `**${formatCoin(nextRebirthCost)}** 💰`,
                    `━━━━━━━━━━━━━━`,
                    `現在の所持金: **${formatCoin(currentMoney)}** 💰`,
                    `※リバースすると所持金は **0** になります。`
                ].join('\n'))
                .setFooter({ text: 'リバースを重ねて Super Coin を手に入れよう！' });

            // お金が足りない場合はメッセージのみ表示
            if (currentMoney < nextRebirthCost) {
                return await interaction.editReply({ embeds: [embed] });
            }

            const btn = new ButtonBuilder()
                .setCustomId('do_rebirth')
                .setLabel('リバースを実行')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(btn);
            const response = await interaction.editReply({ embeds: [embed], components: [row] });

            const collector = response.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== userId) return i.reply({ content: '他人のリバースは操作できません。', ephemeral: true });

                // 通常リバース実行処理
                await Promise.all([
                    DataModel.findOneAndUpdate({ id: moneyKey }, { value: 0 }),
                    DataModel.findOneAndUpdate({ id: petKey }, { 
                        $inc: { 'value.rebirthCount': 1 }
                    }, { upsert: true })
                ]);

                await i.update({ 
                    content: `✅ **リバース成功！** (${rebirths + 1}回目)\n所持金と引き換えに、SRへの階段を一歩昇りました。`, 
                    embeds: [], 
                    components: [] 
                });
                collector.stop();
            });

        } catch (error) {
            console.error('Rebirth Error:', error);
            if (interaction.deferred) {
                await interaction.editReply('データの読み込み中にエラーが発生しました。');
            } else {
                await interaction.reply('エラーが発生しました。');
            }
        }
    }
};