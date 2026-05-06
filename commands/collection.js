const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { PET_MASTER, EVOLUTION_STAGES } = require('../utils/Pet-data');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('collection')
        .setDescription('ペット図鑑を表示します'),

    async execute(interaction) {
        await interaction.deferReply();

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        const doc = await DataModel.findOne({ id: petKey });
        const discovered = doc?.value?.discovered || [];

        // マスタデータにある全ペット種（ベース名）
        const allPetBaseNames = Object.keys(PET_MASTER);
        const totalCount = allPetBaseNames.length;

        // 発見済みの「ベース名」をSetで抽出（重複排除）
        const discoveredBaseNames = new Set();
        discovered.forEach(fullName => {
            const baseName = allPetBaseNames.find(bn => fullName.includes(bn));
            if (baseName) {
                discoveredBaseNames.add(baseName);
            }
        });

        const discoveredCount = discoveredBaseNames.size;
        const completionRate = ((discoveredCount / totalCount) * 100).toFixed(1);

        // レアリティごとに「全てのペット」を分類する
        const rarityGroups = {};
        allPetBaseNames.forEach(baseName => {
            const rarity = PET_MASTER[baseName]?.rarity || 'Unknown';
            if (!rarityGroups[rarity]) rarityGroups[rarity] = [];
            
            // 発見済みか判定
            if (discoveredBaseNames.has(baseName)) {
                // 発見済みの場合、その種の中での最高ランク名を取得
                const highestEvo = discovered
                    .filter(fn => fn.includes(baseName))
                    .sort((a, b) => {
                        const getRank = (name) => {
                            const stage = EVOLUTION_STAGES.find(s => s.name && name.startsWith(s.name));
                            return stage ? EVOLUTION_STAGES.indexOf(stage) : 0;
                        };
                        return getRank(b) - getRank(a);
                    })[0];
                rarityGroups[rarity].push(`**${highestEvo}**`);
            } else {
                // 未発見の場合
                rarityGroups[rarity].push('`???`');
            }
        });

        const embed = new EmbedBuilder()
            .setTitle(`📖 ペット図鑑 (${interaction.user.username})`)
            .setColor('Gold')
            .setDescription(`種コンプリート率: **${completionRate}%** (${discoveredCount} / ${totalCount})`)
            .setThumbnail(interaction.user.displayAvatarURL())
            .setFooter({ text: '※進化させると図鑑の名前がアップグレードされます' });

        const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Unique', 'Artifact', 'SECRET'];
        
        rarityOrder.forEach(rarity => {
            if (rarityGroups[rarity]) {
                const list = rarityGroups[rarity].join(', ');
                // Discordのフィールド制限（1024文字）対策
                const displayList = list.length > 1024 ? list.substring(0, 1021) + '...' : list;
                
                // そのレアリティ内での発見数を計算
                const foundInRarity = rarityGroups[rarity].filter(item => item !== '`???`').length;
                const totalInRarity = rarityGroups[rarity].length;

                embed.addFields({ 
                    name: `${rarity} (${foundInRarity}/${totalInRarity})`, 
                    value: displayList 
                });
            }
        });

        await interaction.editReply({ embeds: [embed] });
    }
};