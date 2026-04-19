const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('use')
        .setDescription('アイテムを使用します')
        .addStringOption(option =>
            option.setName('item')
                .setDescription('使用するアイテム名')
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
            
            // レベルアップ処理
            level++;
            xp = 0; // 次のレベルの最初からにする
            
            // レベルアップ報酬（XP付与時と同じロジック）
            const reward = level * 2000;

            // インベントリの更新（個数を減らす）
            const updatedInventory = { ...inventory };
            updatedInventory[itemKey]--;

            // DB更新
            await Promise.all([
                DataModel.findOneAndUpdate({ id: invKey }, { 'value.inventory': updatedInventory }),
                DataModel.findOneAndUpdate({ id: levelKey }, { value: { level, xp } }),
                DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: reward } })
            ]);

            const embed = new EmbedBuilder()
                .setTitle('🍬 不思議なあめを使用した！')
                .setDescription(`${interaction.user.username} はレベルが上がって **Lv.${level}** になった！`)
                .addFields({ name: 'レベルアップ報酬', value: `**${reward.toLocaleString()}** 💰` })
                .setColor('LuminousVividPink');

            return interaction.reply({ embeds: [embed] });
        }
    }
};