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

        // マスタデータにある「全ペット種」のリスト
        const allPetBaseNames = Object.keys(PET_MASTER);
        const totalCount = allPetBaseNames.length;

        // 発見済みの「種（ベース名）」を抽出して重複を排除
        // 例: ["Slime", "Golden Slime"] があっても "Slime" の1種としてカウント
        const discoveredBaseNames = new Set();
        discovered.forEach(fullName => {
            const baseName = allPetBaseNames.find(bn => fullName.includes(bn));
            if (baseName) {
                discoveredBaseNames.add(baseName);
            }
        });

        const discoveredCount = discoveredBaseNames.size;
        const completionRate = ((discoveredCount / totalCount) * 100).toFixed(1);

        // レアリティごとに発見済みの種を分類
        const categorizedDiscovered = {};
        discoveredBaseNames.forEach(baseName => {
            const rarity = PET_MASTER[baseName]?.rarity || 'Unknown';
            if (!categorizedDiscovered[rarity]) categorizedDiscovered[rarity] = [];
            
            // 図鑑に表示する際、その種の中で「最高ランク」のものを表示する
            const highestEvo = discovered
                .filter(fn => fn.includes(baseName))
                .sort((a, b) => {
                    // EVOLUTION_STAGESの順序に基づいてソート
                    const getRank = (name) => {
                        const stage = EVOLUTION_STAGES.find(s => s.name && name.startsWith(s.name));
                        return stage ? EVOLUTION_STAGES.indexOf(stage) : 0;
                    };
                    return getRank(b) - getRank(a);
                })[0];

            categorizedDiscovered[rarity].push(highestEvo);
        });

        const embed = new EmbedBuilder()
            .setTitle(`📖 ペット図鑑 (${interaction.user.username})`)
            .setColor('Gold')
            .setDescription(`種コンプリート率: **${completionRate}%** (${discoveredCount} / ${totalCount})`)
            .setThumbnail(interaction.user.displayAvatarURL());

        const rarityOrder = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic', 'Unique', 'Artifact', 'SECRET'];
        
        rarityOrder.forEach(rarity => {
            if (categorizedDiscovered[rarity]) {
                // 発見済みの名前をリスト化
                const list = categorizedDiscovered[rarity].join(', ');
                const displayList = list.length > 1024 ? list.substring(0, 1021) + '...' : list;
                embed.addFields({ name: `${rarity} (${categorizedDiscovered[rarity].length})`, value: displayList });
            }
        });

        if (discoveredCount === 0) {
            embed.setDescription('まだペットを発見していません。卵を孵化させてみましょう！');
        }

        await interaction.editReply({ embeds: [embed] });
    }
};