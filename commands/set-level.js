const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

// 他のファイルと同じ報酬ロジック（本来は共通化するのがベストです）
function getLevelBonus(level) {
    let bonusMoney = 0;
    let bonusText = "";
    let bonusItems = null;

    switch (level) {
        case 10:
            bonusMoney = 50000;
            bonusText = "🔓 **レベル10到達!**";
            break;
        case 20:
            bonusMoney = 150000;
            bonusText = "🌟 **レベル20到達!**";
            bonusItems = { "value.inventory.Exotic_egg": 1 };
            break;
        case 30:
            bonusMoney = 500000;
            bonusText = "🔥 **レベル30到達!**";
            bonusItems = { "value.inventory.Exotic_egg": 3 };
            break;
        case 40:
            bonusMoney = 1000000;
            bonusText = "💎 **レベル40到達!**";
            bonusItems = { "value.inventory.slime_egg": 3 };
            break;
        case 50:
            bonusMoney = 5000000;
            bonusText = "👑 **レベル50到達!**";
            bonusItems = { "value.inventory.Undertale_egg": 1 };
            break;
    }
    return { bonusMoney, bonusText, bonusItems };
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('set-level')
        .setDescription('【デバッグ用】ユーザーのレベルを強制的に設定します')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator) // 管理者のみ実行可能
        .addIntegerOption(option => 
            option.setName('level')
                .setDescription('設定するレベル')
                .setRequired(true)
                .setMinValue(1))
        .addUserOption(option => 
            option.setName('target')
                .setDescription('対象のユーザー（未指定なら自分）')),

    async execute(interaction) {
        const newLevel = interaction.options.getInteger('level');
        const targetUser = interaction.options.getUser('target') || interaction.user;
        
        const guildId = interaction.guild.id;
        const userId = targetUser.id;

        const invKey = `pet_data_${guildId}_${userId}`;
        const levelKey = `level_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        // 設定したレベルの報酬を計算
        const { bonusMoney, bonusText, bonusItems } = getLevelBonus(newLevel);
        const normalReward = newLevel * 2000;
        const totalMoney = normalReward + bonusMoney;

        try {
            const updateOps = [
                // 1. レベルとXPの強制書き換え
                DataModel.findOneAndUpdate(
                    { id: levelKey }, 
                    { value: { level: newLevel, xp: 0 } }, 
                    { upsert: true }
                ),
                // 2. お金の付与
                DataModel.findOneAndUpdate(
                    { id: moneyKey }, 
                    { $inc: { value: totalMoney } },
                    { upsert: true }
                )
            ];

            // 3. アイテム報酬があれば付与
            if (bonusItems) {
                updateOps.push(DataModel.findOneAndUpdate(
                    { id: invKey },
                    { $inc: bonusItems },
                    { upsert: true }
                ));
            }

            await Promise.all(updateOps);

            const embed = new EmbedBuilder()
                .setTitle('🛠️ デバッグ: レベル設定完了')
                .setDescription(`${targetUser} のレベルを **Lv.${newLevel}** に変更しました。`)
                .addFields(
                    { name: '付与された報酬', value: `💰 **${totalMoney.toLocaleString()}** コイン`, inline: true }
                )
                .setColor('#FF4500')
                .setTimestamp();

            if (bonusItems) {
                const itemEntry = Object.entries(bonusItems).map(([path, qty]) => {
                    const name = path.split('.').pop();
                    return `📦 **${name}** × ${qty}`;
                }).join('\n');
                embed.addFields({ name: '付与されたアイテム', value: itemEntry });
            }

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Set-Level Error:', error);
            return interaction.reply({ content: 'レベルの設定中にエラーが発生しました。', ephemeral: true });
        }
    }
};