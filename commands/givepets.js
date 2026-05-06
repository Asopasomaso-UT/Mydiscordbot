const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER, EVOLUTION_STAGES } = require('../utils/Pet-data'); // EVOLUTION_STAGESをインポート

const DataModel = mongoose.models.QuickData;

const ENCHANT_TYPES = {
    'power': { name: 'Power', desc: 'ペット倍率アップ' },
    'secret_agent': { name: 'Secret Agent', desc: 'シークレット確率アップ' },
    'energy': { name: 'Energy', desc: '獲得経験値(XP)ブースト' },
    'special_hatch': { name: 'Special Hatch', desc: '孵化時にクラフト済みが出る可能性' },
    'mimic': { name: 'Mimic', desc: 'ペット倍率が超大幅アップ' }
};

module.exports = {
    data: new SlashCommandBuilder()
        .setName('give-pet')
        .setDescription('【管理者用】指定したユーザーにペットを直接付与します')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addUserOption(option => 
            option.setName('target')
                .setDescription('付与するユーザー')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('pet_name')
                .setDescription('ペット名を入力して検索')
                .setRequired(true)
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('個数 (1-10)')
                .setMinValue(1)
                .setMaxValue(10)
        )
        .addIntegerOption(option =>
            option.setName('evo_level')
                .setDescription('進化段階 (0:Normal, 1:Golden, 2:Shiny, 3:Neon)')
                .setMinValue(0)
                .setMaxValue(3)
        )
        .addStringOption(option =>
            option.setName('enchant_type')
                .setDescription('エンチャントを選択')
                .setAutocomplete(true)
        )
        .addIntegerOption(option =>
            option.setName('enchant_level')
                .setDescription('エンチャントレベル (1-5)')
                .setMinValue(1)
                .setMaxValue(5)
        ),

    async autocomplete(interaction) {
        const focusedOption = interaction.options.getFocused(true);
        let choices = [];

        if (focusedOption.name === 'pet_name') {
            choices = Object.keys(PET_MASTER);
        } else if (focusedOption.name === 'enchant_type') {
            choices = Object.values(ENCHANT_TYPES).map(e => e.name);
        }

        const filtered = choices.filter(choice => 
            choice.toLowerCase().includes(focusedOption.value.toLowerCase())
        );

        await interaction.respond(
            filtered.slice(0, 25).map(choice => ({ name: choice, value: choice }))
        );
    },

    async execute(interaction) {
        try {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });
        } catch (e) { return; }

        const targetUser = interaction.options.getUser('target');
        const petName = interaction.options.getString('pet_name');
        const amount = interaction.options.getInteger('amount') || 1;
        const evoLevel = interaction.options.getInteger('evo_level') || 0;
        const enchantName = interaction.options.getString('enchant_type');
        const enchantLevel = interaction.options.getInteger('enchant_level') || 1;

        const petInfo = PET_MASTER[petName];
        if (!petInfo) return interaction.editReply(`❌ 「${petName}」が見つかりません。`);

        const enchantKey = Object.keys(ENCHANT_TYPES).find(key => ENCHANT_TYPES[key].name === enchantName);
        const enchantData = enchantKey ? { type: ENCHANT_TYPES[enchantKey].name, level: enchantLevel } : null;

        const guildId = interaction.guild.id;
        const petKey = `pet_data_${guildId}_${targetUser.id}`;
        const evoNames = ['', 'Golden', 'Shiny', 'Neon'];

        try {
            const newPets = [];
            for (let i = 0; i < amount; i++) {
                newPets.push({
                    petId: uuidv4(),
                    name: petName,
                    rarity: petInfo.rarity,
                    multiplier: petInfo.multiplier,
                    evoLevel: evoLevel,
                    enchant: enchantData,
                    obtainedAt: Date.now()
                });
            }

            // --- 図鑑更新ロジック ---
            const currentDoc = await DataModel.findOne({ id: petKey });
            const discovered = currentDoc?.value?.discovered || [];
            
            // 付与するペットの図鑑用名称 (例: "Golden Slime")
            const currentEvoTag = EVOLUTION_STAGES[evoLevel].name;
            const currentFullName = currentEvoTag ? `${currentEvoTag} ${petName}` : petName;

            // 上位段階が登録済みかチェック
            let alreadyHasHigher = false;
            for (let lv = evoLevel + 1; lv < EVOLUTION_STAGES.length; lv++) {
                const higherTag = EVOLUTION_STAGES[lv].name;
                if (higherTag && discovered.includes(`${higherTag} ${petName}`)) {
                    alreadyHasHigher = true;
                    break;
                }
            }

            const updateQuery = { 
                $push: { 'value.pets': { $each: newPets } } 
            };

            // 上位種が未発見の場合のみ、付与した段階を図鑑に追加
            if (!alreadyHasHigher) {
                updateQuery.$addToSet = { 'value.discovered': currentFullName };
            }

            await DataModel.findOneAndUpdate(
                { id: petKey },
                updateQuery,
                { upsert: true, returnDocument: 'after' }
            );

            const embed = new EmbedBuilder()
                .setTitle('🎁 ペット直接付与完了')
                .setColor('Gold')
                .setThumbnail(targetUser.displayAvatarURL())
                .addFields(
                    { name: '👤 対象者', value: `${targetUser}`, inline: true },
                    { name: '🐾 ペット', value: `**${evoNames[evoLevel] ? `[${evoNames[evoLevel]}] ` : ''}${petName}**`, inline: true },
                    { name: '📦 個数', value: `${amount} 匹`, inline: true },
                    { 
                        name: '✨ エンチャント', 
                        value: enchantData ? `**${enchantData.type}** (Lv.${enchantData.level})\n*${ENCHANT_TYPES[enchantKey].desc}*` : 'なし', 
                        inline: false 
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Givepet Error:', error);
            await interaction.editReply('❌ 付与中にDBエラーが発生しました。');
        }
    },
};