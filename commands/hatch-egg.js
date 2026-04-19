const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER, EGG_CONFIG, SECRET_CONFIG } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hatch-egg')
        .setDescription('持っている卵を孵化させます'),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const invKey = `pet_data_${guildId}_${userId}`;

        const userData = await DataModel.findOne({ id: invKey });
        const inventory = userData?.value?.inventory || {};

        const myEggs = Object.keys(EGG_CONFIG).filter(key => inventory[key] > 0);

        if (myEggs.length === 0) {
            return interaction.reply({ content: '🥚 孵化させられる卵を持っていません。ショップで購入してください！', ephemeral: true });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('hatch_select')
            .setPlaceholder('孵化させる卵を選んでください')
            .addOptions(
                myEggs.map(key => ({
                    label: `${EGG_CONFIG[key].name} (所持: ${inventory[key]})`,
                    value: key
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: 'どの卵を孵化させますか？',
            components: [row],
            ephemeral: true
        });

        const collector = response.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async (i) => {
            if (i.customId !== 'hatch_select') return;

            const eggKey = i.values[0];
            const config = EGG_CONFIG[eggKey];

            // 最新の在庫確認
            const latestData = await DataModel.findOne({ id: invKey });
            if ((latestData?.value?.inventory?.[eggKey] || 0) <= 0) {
                return i.update({ content: 'その卵はもう持っていないようです。', components: [] });
            }

            // --- 孵化ロジック開始 ---
            let selectedPetName = "";
            let isSecret = false;

            // 1. シークレット判定 (全卵共通)
            if (Math.random() < SECRET_CONFIG.CHANCE) {
                const secrets = SECRET_CONFIG.PETS;
                selectedPetName = secrets[Math.floor(Math.random() * secrets.length)];
                isSecret = true;
            } else {
                // 2. 通常抽選 (卵の中身から重み付け抽選)
                const totalWeight = config.contents.reduce((sum, item) => sum + item.weight, 0);
                let random = Math.random() * totalWeight;

                for (const item of config.contents) {
                    if (random < item.weight) {
                        selectedPetName = item.name;
                        break;
                    }
                    random -= item.weight;
                }
            }

            const petInfo = PET_MASTER[selectedPetName];
            const newPet = { 
                petId: uuidv4(), 
                name: selectedPetName, 
                rarity: petInfo.rarity, 
                multiplier: petInfo.multiplier,
                obtainedAt: Date.now()
            };

            // DB更新 (卵を減らし、ペットを追加)
            await DataModel.findOneAndUpdate(
                { id: invKey }, 
                { 
                    $inc: { [`value.inventory.${eggKey}`]: -1 },
                    $push: { 'value.pets': newPet }
                }
            );

            // 結果表示の設定
            const rarityColors = {
                'Common': 'Grey',
                'Uncommon': 'Green',
                'Rare': 'Blue',
                'Epic': 'Purple',
                'Legendary': 'Orange',
                'Unique' : 'Indigo',
                'Artifact' : 'Yellow',
                'SECRET': 'LuminousVividPink'
            };

            const resultEmbed = new EmbedBuilder()
                .setTitle(isSecret ? '✨✨ SECRET DETECTED !! ✨✨' : '🐣 卵が孵った！')
                .setDescription([
                    `**${newPet.name}** が誕生しました！`,
                    `━━━━━━━━━━━━━━`,
                    `レアリティ: \`${newPet.rarity}\``,
                    `コイン倍率: \`x${newPet.multiplier.toLocaleString()}\``
                ].join('\n'))
                .setColor(rarityColors[newPet.rarity] || 'White')
                .setTimestamp();

            await i.update({ content: 'パカッ！', embeds: [resultEmbed], components: [] });
            
            // シークレット演出
            if (isSecret) {
                await interaction.channel.send(`🎊 **OMG YOUR LUCK IS OP** ${interaction.user} が **${newPet.name} (SECRET)** を孵化させました！`);
            }
        });
    }
};