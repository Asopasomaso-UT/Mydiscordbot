const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER, EGG_CONFIG, SECRET_CONFIG, EVOLUTION_STAGES } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hatch-egg')
        .setDescription('持っている卵を孵化させます')
        .addIntegerOption(option => 
            option.setName('amount')
                .setDescription('孵化させる個数 (1-10)')
                .setMinValue(1)
                .setMaxValue(10)
        ),

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const invKey = `pet_data_${guildId}_${userId}`;
        const dailyKey = `daily_quest_${guildId}_${userId}`;
        const amount = interaction.options.getInteger('amount') || 1;

        const userData = await DataModel.findOne({ id: invKey });
        const inventory = userData?.value?.inventory || {};
        const myEggs = Object.keys(EGG_CONFIG).filter(key => (inventory[key] || 0) >= amount);

        if (myEggs.length === 0) return interaction.reply({ content: `🥚 卵が足りません（必要数: ${amount}）。`, ephemeral: true });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('hatch_select')
            .setPlaceholder('孵化させる卵を選択')
            .addOptions(myEggs.map(key => ({ label: `${EGG_CONFIG[key].name} (所持: ${inventory[key]})`, value: key })));

        const response = await interaction.reply({ 
            components: [new ActionRowBuilder().addComponents(selectMenu)], 
            ephemeral: true 
        });
        
        const collector = response.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async (i) => {
            if (i.customId !== 'hatch_select') return;
            const eggKey = i.values[0];
            const config = EGG_CONFIG[eggKey];

            const latestData = await DataModel.findOne({ id: invKey });
            const discovered = latestData?.value?.discovered || [];
            
            const newPets = [];
            const discoveredToAdd = new Set();
            let resultStrings = [];
            let secretFound = false;

            for (let k = 0; k < amount; k++) {
                let selectedPetName = "";
                let isSecret = false;

                if (Math.random() < SECRET_CONFIG.CHANCE) {
                    selectedPetName = SECRET_CONFIG.PETS[Math.floor(Math.random() * SECRET_CONFIG.PETS.length)];
                    isSecret = true;
                    secretFound = true;
                } else {
                    const roll = Math.random() * 100;
                    let cumulative = 0;
                    let targetRarity = "Common";
                    for (const [rarity, rate] of Object.entries(config.rates)) {
                        cumulative += rate;
                        if (roll <= cumulative) { targetRarity = rarity; break; }
                    }
                    const possiblePets = config.contents.filter(name => PET_MASTER[name].rarity === targetRarity);
                    selectedPetName = possiblePets[Math.floor(Math.random() * possiblePets.length)];
                }

                const petInfo = PET_MASTER[selectedPetName];
                const hatchEvoLevel = 0; // 基礎孵化
                newPets.push({ 
                    petId: uuidv4(), name: selectedPetName, evoLevel: hatchEvoLevel,
                    rarity: isSecret ? 'SECRET' : petInfo.rarity, multiplier: petInfo.multiplier,
                    level: 1, xp: 0, obtainedAt: Date.now()
                });

                // 図鑑更新ロジック
                let alreadyHasHigher = false;
                for (let lv = hatchEvoLevel + 1; lv < EVOLUTION_STAGES.length; lv++) {
                    if (discovered.includes(`${EVOLUTION_STAGES[lv].name} ${selectedPetName}`)) {
                        alreadyHasHigher = true;
                        break;
                    }
                }
                if (!alreadyHasHigher) discoveredToAdd.add(selectedPetName);

                resultStrings.push(`${isSecret ? '✨ ' : ''}${selectedPetName} (${isSecret ? 'SECRET' : petInfo.rarity})`);
            }

            await Promise.all([
                DataModel.findOneAndUpdate({ id: invKey }, { 
                    $inc: { [`value.inventory.${eggKey}`]: -amount },
                    $push: { 'value.pets': { $each: newPets } },
                    $addToSet: { 'value.discovered': { $each: Array.from(discoveredToAdd) } }
                }),
                DataModel.findOneAndUpdate({ id: dailyKey }, { $inc: { 'value.hatch': amount } }, { upsert: true })
            ]);

            const embed = new EmbedBuilder()
                .setTitle(secretFound ? '✨ SECRET DETECTED !! ✨' : '🐣 卵が孵った！')
                .setColor(secretFound ? 'LuminousVividPink' : 'Gold')
                .setDescription(`**${amount}個** 孵化しました：\n\n${resultStrings.join('\n')}`);

            await i.update({ embeds: [embed], components: [] });
        });
    }
};