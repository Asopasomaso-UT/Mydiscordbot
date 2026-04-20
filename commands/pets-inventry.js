const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('pets')
        .setDescription('所持しているペットの確認と装備の変更を行います'),

    async execute(interaction) {
        // 1. 保留応答
        await interaction.deferReply({ flags: [MessageFlags.Ephemeral] });

        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const petKey = `pet_data_${guildId}_${userId}`;

        try {
            // 2. データの取得
            const result = await DataModel.findOne({ id: petKey });
            const data = result?.value || {};
            
            const pets = data.pets || [];
            const equippedIds = data.equippedPetIds || [];
            const srCount = data.superRebirthCount || 0;

            // 3. 最大装備枠の計算 (初期3 + SR回数)
            const maxEquipSlot = 3 + srCount;

            if (pets.length === 0) {
                return await interaction.editReply('ペットを1匹も持っていません。卵を孵化させてみましょう！');
            }

            // 4. エンベデッドの作成
            const embed = new EmbedBuilder()
                .setTitle(`🐾 ${interaction.user.username} のペット一覧`)
                .setDescription(`現在の最大装備枠: **${maxEquipSlot}** 匹\n下のメニューから装備するペットを選択してください（複数選択可）。`)
                .setColor('Blue')
                .setTimestamp();

            const petListString = pets.map(p => {
                const isEquipped = equippedIds.includes(p.petId) ? '✅' : '❌';
                const enchantText = p.enchant ? ` [${p.enchant.type} Lv.${p.enchant.level}]` : '';
                return `${isEquipped} **${p.name}** (${p.rarity})${enchantText}`;
            }).join('\n');

            embed.addFields({ name: '所持ペット', value: petListString || 'なし' });

            // 5. セレクトメニューの作成
            // ここが修正の肝：maxValues を現在の枠数に合わせる
            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('pet_equip_select')
                .setPlaceholder('装備するペットを選択')
                .setMinValues(0)
                .setMaxValues(Math.min(pets.length, maxEquipSlot));

            // オプションの追加とエラー回避ロジック
            let defaultCount = 0;
            const options = pets.map(p => {
                const isEquipped = equippedIds.includes(p.petId);
                let isDefault = false;

                // 装備中かつ、枠内に収まっている場合のみデフォルト設定
                if (isEquipped && defaultCount < maxEquipSlot) {
                    isDefault = true;
                    defaultCount++;
                }

                return {
                    label: p.name,
                    description: `レア度: ${p.rarity}${p.enchant ? ` | エンチャント付` : ''}`,
                    value: p.petId,
                    default: isDefault
                };
            });

            selectMenu.addOptions(options);

            const row = new ActionRowBuilder().addComponents(selectMenu);

            const response = await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            // 6. コレクターで装備変更処理
            const collector = response.createMessageComponentCollector({ time: 60000 });

            collector.on('collect', async (i) => {
                if (i.customId === 'pet_equip_select') {
                    const newEquippedIds = i.values;

                    // DB更新
                    await DataModel.findOneAndUpdate(
                        { id: petKey },
                        { 'value.equippedPetIds': newEquippedIds }
                    );

                    await i.update({
                        content: `✅ 装備を更新しました！（${newEquippedIds.length}匹装備中）`,
                        components: [] // 更新後はメニューを消す（連打防止）
                    });
                    
                    collector.stop();
                }
            });

        } catch (error) {
            console.error('Pets Command Error:', error);
            await interaction.editReply('データの読み込み中にエラーが発生しました。');
        }
    },
};