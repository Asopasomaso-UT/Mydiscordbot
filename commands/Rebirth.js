const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const { formatCoin } = require('../utils/formatHelper');
const { REBIRTH_CONFIG } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('rebirth')
        .setDescription('リバースを行い、Super Coinの獲得や能力解放を目指します'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const moneyKey = `money_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        // データの取得
        const [moneyData, userData] = await Promise.all([
            DataModel.findOne({ id: moneyKey }),
            DataModel.findOne({ id: petKey })
        ]);

        const currentMoney = moneyData ? (Number(moneyData.value) || 0) : 0;
        const rebirths = userData?.value?.rebirthCount || 0;
        const srCount = userData?.value?.superRebirthCount || 0;
        const currentMaxSlots = userData?.value?.maxSlots || 3;

        // SRに必要な条件の計算
        const requiredRebirths = 30 + (srCount * 10); // 30, 40, 50...
        const scReward = srCount + 1; // 1枚, 2枚, 3枚...

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
                    `🎁 **今回の報酬:**`,
                    `💎 **Super Coin +${scReward} 枚**`,
                    `🔥 **ベース獲得倍率 +0.1倍** (永久)`,
                    canExtendSlot ? `🎒 **ペット装備枠 +1** (最大10枠まで)` : `🎒 **ペット装備枠** (既に最大です)`,
                    `━━━━━━━━━━━━━━`,
                    `⚠️ **注意:**`,
                    `・所持金が **0** にリセットされます`,
                    `・通常リバース回数が **0** にリセットされます`,
                    `・所持ペットは維持されます`
                ].join('\n'));

            const srBtn = new ButtonBuilder()
                .setCustomId('do_super_rebirth')
                .setLabel('SUPER REBIRTHを実行する')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(srBtn);
            const response = await interaction.reply({ embeds: [srEmbed], components: [row] });

            const collector = response.createMessageComponentCollector({ time: 30000 });

            collector.on('collect', async (i) => {
                if (i.user.id !== userId) return i.reply({ content: '他人のリバースは操作できません。', ephemeral: true });

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
                    content: `🌌 **SUPER REBIRTH 成功！**\n${scReward}枚のSuper Coinを獲得し、全ての常識が塗り替えられました。`, 
                    embeds: [], 
                    components: [] 
                });
            });
            return;
        }

        // --- 2. 通常リバースの判定 ---
        const nextRebirthCost = 1000000 * (rebirths + 1); // 1M, 2M... (調整可能)

        const embed = new EmbedBuilder()
            .setTitle('♻️ REBIRTH')
            .setColor(currentMoney >= nextRebirthCost ? 'Green' : 'Grey')
            .setDescription([
                `現在のリバース回数: **${rebirths}** / **${requiredRebirths}** (SRまであと ${requiredRebirths - rebirths}回)`,
                `━━━━━━━━━━━━━━`,
                `次のリバースに必要なコイン:`,
                `**${formatCoin(nextRebirthCost)}** 💰`,
                `━━━━━━━━━━━━━━`,
                `現在の所持金: **${formatCoin(currentMoney)}** 💰`,
                `※リバースすると所持金は **0** になります。`
            ].join('\n'))
            .setFooter({ text: 'リバースを重ねてスーパーリバースを目指そう！' });

        if (currentMoney < nextRebirthCost) {
            return interaction.reply({ embeds: [embed] });
        }

        const btn = new ButtonBuilder()
            .setCustomId('do_rebirth')
            .setLabel('リバースを実行')
            .setStyle(ButtonStyle.Primary);

        const row = new ActionRowBuilder().addComponents(btn);
        const response = await interaction.reply({ embeds: [embed], components: [row] });

        const collector = response.createMessageComponentCollector({ time: 30000 });

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
                content: `✅ **リバース成功！** (${rebirths + 1}回目)\n所持金を捧げて、次なる高みへ一歩近づきました。`, 
                embeds: [], 
                components: [] 
            });
        });
    }
};