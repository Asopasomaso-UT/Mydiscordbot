const { SlashCommandBuilder, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('デイリークエストを確認・報酬を受け取ります'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const dailyKey = `daily_quest_${guildId}_${userId}`;
        const petKey = `pet_data_${guildId}_${userId}`;

        const now = new Date();
        const todayStr = `${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;

        let doc = await DataModel.findOne({ id: dailyKey });
        
        // データがない、または日付が変わっていたらリセット
        if (!doc || doc.value.lastDate !== todayStr) {
            doc = await DataModel.findOneAndUpdate(
                { id: dailyKey },
                { 
                    value: { 
                        lastDate: todayStr, 
                        hatch: 0, 
                        massage: 0, // メッセージ送信数
                        rps: 0, 
                        claimed: false 
                    } 
                },
                { upsert: true, new: true }
            );
        }

        const q = doc.value;
        const isComplete = q.hatch >= 3 && q.massage >= 10 && q.rps >= 3;

        const embed = new EmbedBuilder()
            .setTitle('📅 デイリークエスト')
            .setColor(isComplete ? 'Green' : 'Blue')
            .setDescription('すべてのクエストをクリアして報酬をゲットしよう！')
            .addFields(
                { name: `🥚 卵を孵化 (${Math.min(q.hatch, 3)}/3)`, value: q.hatch >= 3 ? '✅ 完了' : '進行中', inline: true },
                { name: `💬 メッセージ送信 (${Math.min(q.massage, 10)}/10)`, value: q.massage >= 10 ? '✅ 完了' : '進行中', inline: true },
                { name: `✊ じゃんけん勝利 (${Math.min(q.rps, 3)}/3)`, value: q.rps >= 3 ? '✅ 完了' : '進行中', inline: true }
            );

        const row = new ActionRowBuilder();
        const claimBtn = new ButtonBuilder()
            .setCustomId('claim_daily')
            .setLabel(q.claimed ? '受取り済み' : (isComplete ? '報酬を受け取る' : '未達成'))
            .setStyle(q.claimed ? ButtonStyle.Secondary : (isComplete ? ButtonStyle.Success : ButtonStyle.Secondary))
            .setDisabled(!isComplete || q.claimed);
        
        row.addComponents(claimBtn);

        const response = await interaction.reply({ embeds: [embed], components: [row] });

        const collector = response.createMessageComponentCollector({ time: 60000 });
        collector.on('collect', async i => {
            if (i.customId === 'claim_daily') {
                await DataModel.findOneAndUpdate({ id: dailyKey }, { 'value.claimed': true });
                
                // 報酬（ポーション）をインベントリに追加
                await DataModel.findOneAndUpdate(
                    { id: petKey },
                    { 
                        $inc: { 
                            'value.inventory.luck_potion': 1,
                            'value.inventory.power_potion': 1 
                        }
                    }
                );
                await i.update({ content: '🎁 **報酬獲得！**\n`🍀Lucky potion` と `💪power potion` を1つずつ受け取りました！', embeds: [], components: [] });
            }
        });
    }
};