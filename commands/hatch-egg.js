const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid'); // ID生成用
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

            const latestData = await DataModel.findOne({ id: invKey });
            if ((latestData?.value?.inventory?.[eggKey] || 0) <= 0) {
                return i.update({ content: 'その卵はもう持っていないようです。', components: [] });
            }

            // --- 抽選ロジック ---
            let selectedPetName = "";
            let isSecret = false;

            if (Math.random() < SECRET_CONFIG.CHANCE) {
                const secrets = SECRET_CONFIG.PETS;
                selectedPetName = secrets[Math.floor(Math.random() * secrets.length)];
                isSecret = true;
            } else {
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
            
            // 重要：ここで petId (識別番号) を付与
            const newPet = { 
                petId: uuidv4(), 
                name: selectedPetName, 
                rarity: isSecret ? 'SECRET' : petInfo.rarity, 
                multiplier: petInfo.multiplier,
                level: 1, // レベルシステム用
                xp: 0,
                obtainedAt: Date.now()
            };

            // DB更新
            await DataModel.findOneAndUpdate(
                { id: invKey }, 
                { 
                    $inc: { [`value.inventory.${eggKey}`]: -1 },
                    $push: { 'value.pets': newPet }
                }
            );

            // 表示処理（省略せずにしっかり記述）
            const rarityColors = {
                'Common': 'Grey', 'Uncommon': 'Green', 'Rare': 'Blue',
                'Epic': 'Purple', 'Legendary': 'Orange', 'Unique' : 'Blue',
                'Artifact' : 'Yellow', 'SECRET': 'LuminousVividPink'
            };

            const resultEmbed = new EmbedBuilder()
                .setTitle(isSecret ? '✨✨ SECRET DETECTED !! ✨✨' : '🐣 卵が孵った！')
                .setDescription(`**${newPet.name}** が誕生しました！\nレアリティ: \`${newPet.rarity}\` | 倍率: \`x${newPet.multiplier}\``)
                .setColor(rarityColors[newPet.rarity] || 'White')
                .setTimestamp();

            await i.update({ content: 'パカッ！', embeds: [resultEmbed], components: [] });
            
            if (isSecret) {
                await interaction.channel.send(`🎊 **OMG!** ${interaction.user} が **${newPet.name} (SECRET)** を孵化させました！`);
            }
        });
    }
};