const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER, EGG_CONFIG, SECRET_CONFIG, EVOLUTION_STAGES } = require('../utils/Pet-data');

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

        if (myEggs.length === 0) return interaction.reply({ content: '🥚 卵を持っていません。', ephemeral: true });

        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('hatch_select')
            .setPlaceholder('孵化させる卵を選択')
            .addOptions(myEggs.map(key => ({ label: `${EGG_CONFIG[key].name} (所持: ${inventory[key]})`, value: key })));

        const response = await interaction.reply({ components: [new ActionRowBuilder().addComponents(selectMenu)], ephemeral: true });
        const collector = response.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async (i) => {
            if (i.customId !== 'hatch_select') return;
            const eggKey = i.values[0];
            const config = EGG_CONFIG[eggKey];

            // 最新データの再取得
            const latestData = await DataModel.findOne({ id: invKey });
            if ((latestData?.value?.inventory?.[eggKey] || 0) <= 0) return i.update({ content: '卵が足りません。', components: [] });

            // --- 1. エンチャント効果の集計 ---
            const pets = latestData.value.pets || [];
            const equippedIds = (latestData.value.equippedPetIds || []).map(id => String(id));
            const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

            let secretAgentBoost = 0; // シークレット確率アップ
            let specialHatchLv = 0;   // 進化済み出現
            
            equippedPets.forEach(p => {
                if (p.enchant?.type === 'secret_agent') secretAgentBoost += p.enchant.level;
                if (p.enchant?.type === 'special_hatch') specialHatchLv = Math.max(specialHatchLv, p.enchant.level);
            });

            // --- 2. 抽選フェーズ ---
            let selectedPetName = "";
            let isSecret = false;

            // シークレット判定 (Secret Agent補正: 1Lvにつき+50%アップ)
            const modifiedSecretChance = SECRET_CONFIG.CHANCE * (1 + (secretAgentBoost * 0.5));
            if (Math.random() < modifiedSecretChance) {
                selectedPetName = SECRET_CONFIG.PETS[Math.floor(Math.random() * SECRET_CONFIG.PETS.length)];
                isSecret = true;
            } else {
                // 通常抽選 (Ratesベース)
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
                
                // 決定したレアリティの中からランダムに選出
                const possiblePets = config.contents.filter(name => PET_MASTER[name].rarity.toLowerCase() === targetRarity.toLowerCase());
                selectedPetName = possiblePets.length > 0 ? possiblePets[Math.floor(Math.random() * possiblePets.length)] : config.contents[0];
            }

            // --- 3. Special Hatch判定 (1Lvにつき1.5%の確率で進化済みが出る) ---
            let hatchEvoLevel = 0;
            if (specialHatchLv > 0 && !isSecret) {
                if (Math.random() * 100 < (specialHatchLv * 1.5)) {
                    // Golden(70%), Shiny(25%), Neon(5%)
                    const evoRoll = Math.random();
                    if (evoRoll < 0.05) hatchEvoLevel = 3;
                    else if (evoRoll < 0.30) hatchEvoLevel = 2;
                    else hatchEvoLevel = 1;
                }
            }

            const petInfo = PET_MASTER[selectedPetName];
            const newPet = { 
                petId: uuidv4(), 
                name: selectedPetName, 
                evoLevel: hatchEvoLevel,
                rarity: isSecret ? 'SECRET' : petInfo.rarity, 
                multiplier: petInfo.multiplier,
                level: 1, xp: 0,
                obtainedAt: Date.now()
            };

            await DataModel.findOneAndUpdate({ id: invKey }, { 
                $inc: { [`value.inventory.${eggKey}`]: -1 },
                $push: { 'value.pets': newPet }
            });

            const rarityColors = { 'Common': 'Grey', 'Uncommon': 'Green', 'Rare': 'Blue', 'Epic': 'Purple', 'Legendary': 'Orange', 'Mythic': 'Red', 'Unique': 'Blue', 'Artifact': 'Yellow', 'SECRET': 'LuminousVividPink' };
            const evoText = hatchEvoLevel > 0 ? ` [${EVOLUTION_STAGES[hatchEvoLevel].name}!!]` : "";

            const embed = new EmbedBuilder()
                .setTitle(isSecret ? '✨ SECRET DETECTED !! ✨' : '🐣 卵が孵った！')
                .setDescription(`**${newPet.name}${evoText}** が誕生！\nレアリティ: \`${newPet.rarity}\``)
                .setColor(rarityColors[newPet.rarity] || 'White');

            await i.update({ embeds: [embed], components: [] });
            if (isSecret) await interaction.channel.send(`🎊 **OMG!** ${interaction.user} が **${newPet.name} (SECRET)** を出しました！`);
        });
    }
};