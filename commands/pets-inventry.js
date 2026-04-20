const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

// 全ユーザーのデータをチェックし、IDがないペットにIDを付与する関数
async function migratePetData() {
    const users = await DataModel.find({ "value.pets": { $exists: true } });
    
    for (const user of users) {
        let modified = false;
        const updatedPets = user.value.pets.map(pet => {
            if (!pet.petId) {
                pet.petId = uuidv4(); // IDがないペットに新しく付与
                modified = true;
            }
            return pet;
        });

        if (modified) {
            await DataModel.updateOne(
                { id: user.id },
                { $set: { "value.pets": updatedPets } }
            );
            console.log(`Updated pet data for user: ${user.id}`);
        }
    }
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('ペットの装備管理（スーパーリバース回数に応じて枠が増加します）'),

    async execute(interaction) {
        // Ephemeral（自分にだけ見える）で応答を保留
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        /**
         * 最新データに基づいてエンベッドとコンポーネントを生成する内部関数
         */
        const createPetsInterface = (currentData) => {
            const pets = currentData.pets || [];
            const equippedIds = currentData.equippedPetIds || [];
            const srCount = currentData.superRebirthCount || 0;
            const maxEquipSlot = 3 + srCount;

            // 1. 上の欄：装備中のペットをフィルタリングして表示
            const equippedPets = pets.filter(p => equippedIds.includes(p.petId));
            
            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペットチーム`)
                .setDescription(`現在の最大装備枠: **${maxEquipSlot}** 匹 (初期3 + SR数:${srCount})`)
                .setColor('Blue')
                .addFields({ 
                    name: `⚔️ 現在装備中 (${equippedPets.length} / ${maxEquipSlot})`, 
                    value: equippedPets.length > 0 
                        ? equippedPets.map(p => {
                            const enchantInfo = p.enchant ? ` \`Lv.${p.enchant.level} ${p.enchant.type}\`` : '';
                            return `✅ **${p.name}** [${p.rarity}]${enchantInfo}`;
                        }).join('\n')
                        : '装備しているペットはいません。'
                })
                .setTimestamp();

            // 2. 下のボックス：全ペットから選択するメニュー
            // Discordの制限: maxValuesは選択肢の数または装備枠の小さい方にする
            const selectLimit = Math.min(pets.length, maxEquipSlot);
            
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pet_equip_toggle')
                .setPlaceholder('装備するペットをチェック（枠数まで選択可能）')
                .setMinValues(0)
                .setMaxValues(selectLimit || 1); // 0だとエラーになるため最低1

            // 選択肢の作成
            const options = pets.map(p => ({
                label: p.name,
                description: `レア: ${p.rarity}${p.enchant ? ` | ${p.enchant.type}付` : ''}`,
                value: p.petId,
                default: equippedIds.includes(p.petId) // 装備中ならチェックを入れる
            }));

            if (options.length > 0) {
                selectMenu.addOptions(options);
            } else {
                selectMenu.addOptions([{ label: 'ペットがいません', value: 'none', disabled: true }]);
            }

            const row = new ActionRowBuilder().addComponents(selectMenu);
            return { embeds: [embed], components: [row] };
        };

        try {
            // データの取得
            const result = await DataModel.findOne({ id: petKey });
            if (!result || !result.value?.pets?.length) {
                return await interaction.editReply('ペットを1匹も持っていません。まずは卵を孵化させましょう！');
            }

            // 初回表示
            const ui = createPetsInterface(result.value);
            const response = await interaction.editReply({ 
                embeds: ui.embeds, 
                components: ui.components 
            });

            // コレクターの作成（3分間有効）
            const collector = response.createMessageComponentCollector({ time: 180000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'pet_equip_toggle') {
                    // 選択されたリストで装備IDを更新
                    const newEquippedIds = i.values;

                    // DBに保存
                    const updatedDoc = await DataModel.findOneAndUpdate(
                        { id: petKey },
                        { $set: { 'value.equippedPetIds': newEquippedIds } },
                        { new: true }
                    );

                    // 最新データでUIを再構築してメッセージを更新（i.updateを使う）
                    const nextUI = createPetsInterface(updatedDoc.value);
                    
                    await i.update({
                        embeds: nextUI.embeds,
                        components: nextUI.components
                    });
                }
            });

            // 時間切れになったら操作不能にする
            collector.on('end', () => {
                interaction.editReply({ 
                    content: '💡 セッションが終了しました。再度管理するには `/pets` を実行してください。', 
                    components: [] 
                }).catch(() => null);
            });

        } catch (error) {
            console.error('Pets Command Error:', error);
            await interaction.editReply('データの読み込み中にエラーが発生しました。');
        }
    },
};