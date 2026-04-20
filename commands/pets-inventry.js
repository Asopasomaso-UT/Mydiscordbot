const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid'); // ID未付与ペットの救済用
const DataModel = mongoose.models.QuickData;

// --- 進化設定 (Pet-data.jsの設定と同期させてください) ---
const EVOLUTION_STAGES = [
    { name: '', color: null, multiplier: 1 },           // Level 0 (通常)
    { name: 'Golden', color: 0xFFD700, multiplier: 2 },   // Level 1
    { name: 'Shiny', color: 0xE6E6FA, multiplier: 4 },    // Level 2
    { name: 'Neon', color: 0x00FFFF, multiplier: 8 }     // Level 3 (最大)
];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの装備管理・合成・進化を行います'),

    async execute(interaction) {
        // Ephemeral（本人にのみ表示）で応答を保留
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        /**
         * 最新データに基づいてUI（EmbedとComponent）を生成する内部関数
         */
        const createPetsInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const srCount = currentData.superRebirthCount || 0;
            const maxEquipSlot = 3 + srCount;

            // 1. 上部：現在装備中のペットをリスト表示
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペットチーム`)
                .setColor('Blue')
                .setDescription(`現在の最大装備枠: **${maxEquipSlot}** 匹\n(初期3枠 + スーパーリバース回数: ${srCount})`)
                .addFields({ 
                    name: `⚔️ 現在装備中 (${equippedPets.length} / ${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => {
                            const evo = EVOLUTION_STAGES[p.evoLevel || 0];
                            const prefix = evo.name ? `[${evo.name}] ` : '';
                            const enchantInfo = p.enchant ? ` \`Lv.${p.enchant.level} ${p.enchant.type}\`` : '';
                            return `✅ **${prefix}${p.name}** [${p.rarity}]${enchantInfo}`;
                        }).join('\n')
                        : '装備しているペットはいません。'
                })
                .setTimestamp();

            // 2. 中央：装備付け替え用セレクトメニュー
            const selectLimit = Math.min(pets.length, maxEquipSlot);
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pet_equip_toggle')
                .setPlaceholder('装備するペットをチェック（枠数まで）')
                .setMinValues(0)
                .setMaxValues(selectLimit || 1);

            const options = pets.map(p => {
                const evo = EVOLUTION_STAGES[p.evoLevel || 0];
                const displayMult = (p.multiplier || 1) * evo.multiplier;
                return {
                    label: `${evo.name ? `[${evo.name}] ` : ''}${p.name}`,
                    description: `レア: ${p.rarity} | 倍率: x${displayMult.toLocaleString()}${p.enchant ? ` | ${p.enchant.type}付` : ''}`,
                    value: p.petId,
                    default: equippedIds.includes(p.petId)
                };
            });

            if (options.length > 0) {
                selectMenu.addOptions(options);
            } else {
                selectMenu.addOptions([{ label: 'ペットがいません', value: 'none', disabled: true }]);
            }

            const row1 = new ActionRowBuilder().addComponents(selectMenu);

            // 3. 下部：合成（フュージョン）ボタン
            const canFuse = checkFusionPossible(pets);
            const row2 = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('pet_fuse')
                    .setLabel('ペット合成 (同種3匹を消費して進化)')
                    .setStyle(canFuse ? ButtonStyle.Primary : ButtonStyle.Secondary)
                    .setEmoji('🧪')
                    .setDisabled(!canFuse)
            );

            return { embeds: [embed], components: [row1, row2] };
        };

        try {
            // --- データの初期取得 ---
            let result = await DataModel.findOne({ id: petKey });
            if (!result || !result.value?.pets?.length) {
                return await interaction.editReply('ペットを1匹も持っていません。卵を孵化させてみましょう！');
            }

            // --- A. データ修復ロジック（petIdがない古いペットにIDを自動付与） ---
            let userData = result.value;
            let needsSave = false;
            userData.pets = userData.pets.map(p => {
                if (!p.petId) {
                    p.petId = uuidv4();
                    needsSave = true;
                }
                return p;
            });

            if (needsSave) {
                await DataModel.findOneAndUpdate({ id: petKey }, { $set: { "value.pets": userData.pets } });
                console.log(`[System] ${interaction.user.username}のペットデータにIDを付与しました。`);
            }

            // 初回表示のレンダリング
            const ui = createPetsInterface(userData);
            const response = await interaction.editReply({ embeds: ui.embeds, components: ui.components });

            // コレクターの作成（5分間有効、何度でも付け替え可能）
            const collector = response.createMessageComponentCollector({ time: 300000 });

            collector.on('collect', async (i) => {
                // 操作のたびに最新のDB情報を読み込む
                const latestDoc = await DataModel.findOne({ id: petKey });
                const currentData = latestDoc.value;

                // --- 1. 装備の付け替え処理 ---
                if (i.customId === 'pet_equip_toggle') {
                    const updated = await DataModel.findOneAndUpdate(
                        { id: petKey },
                        { $set: { 'value.equippedPetIds': i.values } },
                        { new: true }
                    );
                    await i.update(createPetsInterface(updated.value));
                }

                // --- 2. 合成（フュージョン）処理 ---
                if (i.customId === 'pet_fuse') {
                    const fusionSet = findFusionSet(currentData.pets);
                    if (!fusionSet) {
                        return i.reply({ content: '同じ名前・同じ進化段階のペットが3匹必要です！', ephemeral: true });
                    }

                    const targetPet = fusionSet[0];
                    const nextEvoLevel = (targetPet.evoLevel || 0) + 1;
                    const targetIds = fusionSet.map(p => p.petId);

                    // 進化プロセス：素材を消して新しい進化個体を追加
                    const remainingPets = currentData.pets.filter(p => !targetIds.includes(p.petId));
                    const evolvedPet = {
                        ...targetPet,
                        petId: uuidv4(), // 進化したら新しいIDを割り振る
                        evoLevel: nextEvoLevel,
                        obtainedAt: Date.now()
                    };
                    remainingPets.push(evolvedPet);

                    // DB更新（素材が装備中だった場合は装備リストからも外す）
                    const updated = await DataModel.findOneAndUpdate(
                        { id: petKey },
                        { 
                            $set: { 'value.pets': remainingPets },
                            $pull: { 'value.equippedPetIds': { $in: targetIds } }
                        },
                        { new: true }
                    );

                    await i.update(createPetsInterface(updated.value));
                    await i.followUp({ 
                        content: `✨ **合成成功！** **${targetPet.name}** を3匹捧げて、**${EVOLUTION_STAGES[nextEvoLevel].name} ${targetPet.name}** が誕生しました！`, 
                        ephemeral: true 
                    });
                }
            });

            // 終了時にボタンを無効化
            collector.on('end', () => {
                interaction.editReply({ components: [] }).catch(() => null);
            });

        } catch (error) {
            console.error('Pets Command Error:', error);
            await interaction.editReply('データの読み込み中にエラーが発生しました。');
        }
    }
};

// --- ヘルパー関数群 ---

/**
 * 合成可能な3匹のペアを検索
 */
function findFusionSet(pets) {
    const groups = {};
    for (const p of pets) {
        const evo = p.evoLevel || 0;
        if (evo >= 3) continue; // すでにNeon(最大)なら除外
        const key = `${p.name}_${evo}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
        if (groups[key].length >= 3) return groups[key].slice(0, 3);
    }
    return null;
}

/**
 * 合成が可能かどうかを判定（ボタンの有効化用）
 */
function checkFusionPossible(pets) {
    const counts = {};
    for (const p of pets) {
        const evo = p.evoLevel || 0;
        if (evo >= 3) continue;
        const key = `${p.name}_${evo}`;
        counts[key] = (counts[key] || 0) + 1;
        if (counts[key] >= 3) return true;
    }
    return false;
}