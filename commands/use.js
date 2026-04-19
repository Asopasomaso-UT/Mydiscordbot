const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('インベントリ内のアイテムを使用します')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('使用するアイテム')
                .setRequired(true)
                .addChoices(
                    { name: '不思議なあめ', value: 'rare_candy' }
                )),

    async execute(interaction) {
        const itemKey = interaction.options.getString('item');
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        
        const invKey = `pet_data_${guildId}_${userId}`;
        const levelKey = `level_data_${guildId}_${userId}`;
        const moneyKey = `money_${guildId}_${userId}`;

        // データの取得
        const [userData, levelData] = await Promise.all([
            DataModel.findOne({ id: invKey }),
            DataModel.findOne({ id: levelKey })
        ]);

        const inventory = userData?.value?.inventory || {};
        const itemCount = inventory[itemKey] || 0;

        if (itemCount <= 0) {
            return interaction.reply({ content: 'そのアイテムを持っていません！', ephemeral: true });
        }

        if (itemKey === 'rare_candy') {
            let { level, xp } = levelData?.value || { level: 1, xp: 0 };
            
            // 1. レベルアップ処理
            level++;
            xp = 0; // 次のレベルの最初からにする
            const reward = level * 2000;

            // 2. インベントリの消費
            const updatedInventory = { ...inventory };
            updatedInventory[itemKey]--;

            // 3. DB一括更新
            await Promise.all([
                DataModel.findOneAndUpdate({ id: invKey }, { 'value.inventory': updatedInventory }),
                DataModel.findOneAndUpdate({ id: levelKey }, { value: { level, xp } }, { upsert: true }),
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: reward } })
            ]);

            const embed = new EmbedBuilder()
                .setTitle('🍬 不思議なあめを使用した！')
                .setDescription(`${interaction.user.username} のレベルが上がって **Lv.${level}** になった！`)
                .addFields({ name: '獲得報酬', value: `**${reward.toLocaleString()}** 💰` })
                .setColor('LuminousVividPink');

            return interaction.reply({ embeds: [embed] });
        }
    }
};