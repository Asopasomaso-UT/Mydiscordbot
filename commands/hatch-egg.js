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
        const amount = interaction.options.getInteger('amount') || 1;

        const userData = await DataModel.findOne({ id: invKey });
        const inventory = userData?.value?.inventory || {};
        const myEggs = Object.keys(EGG_CONFIG).filter(key => inventory[key] >= amount);

        if (myEggs.length === 0) {
            return interaction.reply({ 
                content: `🥚 卵を持っていないか、指定した数（${amount}個）に足りません。`, 
                ephemeral: true 
            });
        }

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('hatch_select')
            .setPlaceholder(`孵化させる卵を選択 (一括: ${amount}個)`)
            .addOptions(myEggs.map(key => ({ 
                label: `${EGG_CONFIG[key].name} (所持: ${inventory[key]})`, 
                value: key 
            })));

        const response = await interaction.reply({ 
            components: [new ActionRowBuilder().addComponents(selectMenu)], 
            ephemeral: true 
        });
        
        const collector = response.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async (i) => {
            if (i.customId !== 'hatch_select') return;
            const eggKey = i.values[0];
            const config = EGG_CONFIG[eggKey];

            // 最新データの再取得
            const latestData = await DataModel.findOne({ id: invKey });
            if ((latestData?.value?.inventory?.[eggKey] || 0) < amount) {
                return i.update({ content: '卵が足りません。', components: [] });
            }

            const discovered = latestData.value.discovered || [];
            const pets = latestData.value.pets || [];
            const equippedIds = (latestData.value.equippedPetIds || []).map(id => String(id));
            const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

            // バフ計算
            let secretAgentBoost = 0;
            let specialHatchLv = 0;
            equippedPets.forEach(p => {
                if (p.enchant?.type === 'secret_agent') secretAgentBoost += p.enchant.level;
                if (p.enchant?.type === 'special_hatch') specialHatchLv = Math.max(specialHatchLv, p.enchant.level);
            });

            const newPets = [];
            const discoveredToAdd = new Set();
            let secretFound = false;
            let resultStrings = [];

            // ループ処理で指定数分孵化
            for (let k = 0; k < amount; k++) {
                let selectedPetName = "";
                let isSecret = false;

                // シークレット抽選
                const modifiedSecretChance = SECRET_CONFIG.CHANCE * (1 + (secretAgentBoost * 0.5));
                if (Math.random() < modifiedSecretChance) {
                    selectedPetName = SECRET_CONFIG.PETS[Math.floor(Math.random() * SECRET_CONFIG.PETS.length)];
                    isSecret = true;
                    secretFound = true;
                } else {
                    // 通常抽選
                    const roll = Math.random() * 100;
                    let cumulative = 0;
                    let targetRarity = "Common";
                    for (const [rarity, rate] of Object.entries(config.rates)) {
                        cumulative += rate;
                        if (roll <= cumulative) {
                            targetRarity = rarity;
                            break;
                        }
                    }
                    const possiblePets = config.contents.filter(name => PET_MASTER[name].rarity.toLowerCase() === targetRarity.toLowerCase());
                    selectedPetName = possiblePets.length > 0 ? possiblePets[Math.floor(Math.random() * possiblePets.length)] : config.contents[0];
                }

                // 特殊進化（Special Hatch）判定
                let hatchEvoLevel = 0;
                if (specialHatchLv > 0 && !isSecret) {
                    if (Math.random() * 100 < (specialHatchLv * 1.5)) {
                        const evoRoll = Math.random();
                        if (evoRoll < 0.05) hatchEvoLevel = 3; // Neon
                        else if (evoRoll < 0.30) hatchEvoLevel = 2; // Shiny
                        else hatchEvoLevel = 1; // Golden
                    }
                }

                const petInfo = PET_MASTER[selectedPetName];
                const petId = uuidv4();
                newPets.push({ 
                    petId: petId, 
                    name: selectedPetName, 
                    evoLevel: hatchEvoLevel,
                    rarity: isSecret ? 'SECRET' : petInfo.rarity, 
                    multiplier: petInfo.multiplier,
                    level: 1, xp: 0,
                    obtainedAt: Date.now()
                });

                // --- 図鑑更新判定（上位種チェック） ---
                const currentEvoTag = EVOLUTION_STAGES[hatchEvoLevel].name;
                const currentFullName = currentEvoTag ? `${currentEvoTag} ${selectedPetName}` : selectedPetName;

                let alreadyHasHigher = false;
                for (let lv = hatchEvoLevel + 1; lv < EVOLUTION_STAGES.length; lv++) {
                    const higherTag = EVOLUTION_STAGES[lv].name;
                    if (higherTag && discovered.includes(`${higherTag} ${selectedPetName}`)) {
                        alreadyHasHigher = true;
                        break;
                    }
                }
                if (!alreadyHasHigher) discoveredToAdd.add(currentFullName);

                const evoPrefix = hatchEvoLevel > 0 ? `[${EVOLUTION_STAGES[hatchEvoLevel].name}] ` : "";
                resultStrings.push(`${isSecret ? '✨ ' : ''}${evoPrefix}${selectedPetName} (${isSecret ? 'SECRET' : petInfo.rarity})`);
            }

            // DB更新
            await DataModel.findOneAndUpdate({ id: invKey }, { 
                $inc: { [`value.inventory.${eggKey}`]: -amount },
                $push: { 'value.pets': { $each: newPets } },
                $addToSet: { 'value.discovered': { $each: Array.from(discoveredToAdd) } }
            });

            const embed = new EmbedBuilder()
                .setTitle(secretFound ? '✨ SECRET DETECTED !! ✨' : '🐣 卵が孵った！')
                .setColor(secretFound ? 'LuminousVividPink' : 'Gold')
                .setDescription(`**${amount}個** の卵を孵化させました：\n\n${resultStrings.join('\n')}`);

            await i.update({ embeds: [embed], components: [] });
            
            if (secretFound) {
                await interaction.channel.send(`🎊 **OMG!** ${interaction.user} が一括孵化で **SECRET** を引き当てました！`);
            }
        });
    }
};