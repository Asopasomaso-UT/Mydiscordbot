const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER, EGG_CONFIG } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hatch-egg')
        .setDescription('所持している卵を孵化させます')
        .addStringOption(option => {
            option.setName('egg').setDescription('孵化させる卵を選択').setRequired(true);
            Object.keys(EGG_CONFIG).forEach(key => {
                option.addChoices({ name: EGG_CONFIG[key].label, value: key });
            });
            return option;
        }),

    async execute(interaction) {
        const eggKey = interaction.options.getString('egg');
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const invKey = `pet_data_${guildId}_${userId}`;

        // 1. 在庫確認
        const userData = await DataModel.findOne({ id: invKey });
        const eggCount = userData?.value?.inventory?.[eggKey] || 0;

        if (eggCount <= 0) {
            return interaction.reply({ content: `**${EGG_CONFIG[eggKey].label}** を持っていません！`, ephemeral: true });
        }

        // 2. 卵を消費
        await DataModel.findOneAndUpdate(
            { id: invKey },
            { $inc: { [`value.inventory.${eggKey}`]: -1 } }
        );

        // 3. 確率に基づいたレアリティ抽選
        const rates = EGG_CONFIG[eggKey].rates;
        const rand = Math.random() * 100;
        let cumulative = 0;
        let selectedRarity = 'Common';

        for (const [rarity, rate] of Object.entries(rates)) {
            cumulative += rate;
            if (rand <= cumulative) {
                selectedRarity = rarity;
                break;
            }
        }

        // 4. ペット個体の決定
        const pool = PET_MASTER[selectedRarity].list;
        const petInfo = pool[Math.floor(Math.random() * pool.length)];

        const newPet = {
            petId: uuidv4(),
            name: petInfo.name,
            rarity: selectedRarity,
            multiplier: petInfo.multiplier,
            obtainedAt: Date.now()
        };

        // 5. DB保存（pets配列に追加）
        await DataModel.findOneAndUpdate(
            { id: invKey },
            { $push: { 'value.pets': newPet } },
            { upsert: true }
        );

        // 6. 結果表示と演出
        const embed = new EmbedBuilder()
            .setTitle(selectedRarity === 'Secret' ? '✨ 伝説が、今ここに ✨' : '🐣 卵が孵った！')
            .setDescription(`**${newPet.name}** が仲間になりました！\n\n**レアリティ:** \`${selectedRarity}\`\n**コイン倍率:** \`x${newPet.multiplier.toLocaleString()}\``)
            .setColor(PET_MASTER[selectedRarity].color)
            .setTimestamp();

        if (selectedRarity === 'Secret') {
            // Secretが出たらサーバー全体に自慢メッセージ
            await interaction.reply({ 
                content: `🎊 **🎉🎉[server] ${interaction.user} が SECRET ペットを引き当てました！！🎉🎉**`,
                embeds: [embed] 
            });
        } else {
            await interaction.reply({ embeds: [embed] });
        }
    }
};