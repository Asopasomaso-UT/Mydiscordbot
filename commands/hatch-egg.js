const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');
const { PET_MASTER, EGG_CONFIG } = require('../utils/Pet-data');

const DataModel = mongoose.models.QuickData;

module.exports = {
    data: new SlashCommandBuilder()
        .setName('hatch-egg')
        .setDescription('持っている卵を孵化させます'), // 選択肢はコマンド実行後に表示

    async execute(interaction) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;
        const invKey = `pet_data_${guildId}_${userId}`;

        // 1. ユーザーのインベントリを取得
        const userData = await DataModel.findOne({ id: invKey });
        const inventory = userData?.value?.inventory || {};

        // 2. 持っている卵（個数が1以上のもの）をフィルタリング
        const myEggs = Object.keys(EGG_CONFIG).filter(key => inventory[key] > 0);

        if (myEggs.length === 0) {
            return interaction.reply({ content: '🥚 孵化させられる卵を持っていません。先にショップで購入してください！', ephemeral: true });
        }

        // 3. セレクトメニューの作成
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('hatch_select')
            .setPlaceholder('孵化させる卵を選んでください')
            .addOptions(
                myEggs.map(key => ({
                    label: `${EGG_CONFIG[key].label} (所持: ${inventory[key]})`,
                    value: key,
                    description: `価格: ${EGG_CONFIG[key].price} 💰`
                }))
            );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: 'どの卵を孵化させますか？',
            components: [row],
            ephemeral: true // 誰にも見られず選べる
        });

        // 4. セレクトメニューの入力を待機
        const collector = response.createMessageComponentCollector({ time: 30000 });

        collector.on('collect', async (i) => {
            if (i.customId !== 'hatch_select') return;

            const eggKey = i.values[0];
            const config = EGG_CONFIG[eggKey];

            // 念のため再チェック
            const latestData = await DataModel.findOne({ id: invKey });
            if ((latestData?.value?.inventory?.[eggKey] || 0) <= 0) {
                return i.update({ content: 'その卵はもう持っていないようです。', components: [] });
            }

            // --- 孵化ロジック開始 ---

            // 卵を消費
            await DataModel.findOneAndUpdate({ id: invKey }, { $inc: { [`value.inventory.${eggKey}`]: -1 } });

            // 抽選
            const rand = Math.random() * 100;
            let cumulative = 0;
            let selectedRarity = 'Common';
            for (const [rarity, rate] of Object.entries(config.rates)) {
                cumulative += rate;
                if (rand <= cumulative) { selectedRarity = rarity; break; }
            }

            const pool = PET_MASTER[selectedRarity].list;
            const petInfo = pool[Math.floor(Math.random() * pool.length)];
            const newPet = { petId: uuidv4(), name: petInfo.name, rarity: selectedRarity, multiplier: petInfo.multiplier };

            // ペット保存
            await DataModel.findOneAndUpdate({ id: invKey }, { $push: { 'value.pets': newPet } }, { upsert: true });

            // 結果表示
            const resultEmbed = new EmbedBuilder()
                .setTitle(selectedRarity === 'Secret' ? '✨✨ SECRET DETECTED !! ✨✨' : '🐣 卵が孵った！')
                .setDescription(`**${newPet.name}** が誕生しました！\nレアリティ: \`${selectedRarity}\` / 倍 rate: \`x${newPet.multiplier}\``)
                .setColor(PET_MASTER[selectedRarity].color);

            await i.update({ content: 'パカッ！', embeds: [resultEmbed], components: [] });
            
            // Secretの場合は全体に通知（オプション）
            if (selectedRarity === 'Secret') {
                await interaction.channel.send(`🎊 **${interaction.user} が ${newPet.name} (SECRET) を引き当てました！**`);
            }
        });
    }
};