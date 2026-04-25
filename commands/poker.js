const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { parseCoin, formatCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poker')
        .setDescription('ビデオポーカーで勝負します（ペットブースト対応）')
        .addStringOption(option => option.setName('bet').setDescription('賭け金 (例: 1k, 10m)').setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = parseCoin(interaction.options.getString('bet'));
        const moneyKey = `money_${guildId}_${userId}`;

        if (bet < 100) return interaction.reply({ content: '最低賭け金は 100 💰 です。', ephemeral: true });

        const userData = await DataModel.findOne({ id: moneyKey });
        if ((userData?.value || 0) < bet) return interaction.reply({ content: 'コインが足りません！', ephemeral: true });

        // 山札作成
        let deck = [];
        SUITS.forEach(s => VALUES.forEach(v => deck.push({ s, v })));
        deck = deck.sort(() => Math.random() - 0.5);
        let hand = deck.splice(0, 5);

        const getEmbed = (currentHand, selected) => {
            const cardsStr = currentHand.map((c, i) => `${selected.has(i) ? '✅' : '　'}\` ${c.s}${c.v} \``).join('\n');
            return new EmbedBuilder()
                .setTitle('🃏 VIDEO POKER')
                .setDescription(`交換するカードを選択して「決定」を押してください。\n\n${cardsStr}`)
                .setColor('Blue');
        };

        const rows = new ActionRowBuilder().addComponents(
            [0, 1, 2, 3, 4].map(i => new ButtonBuilder().setCustomId(`card_${i}`).setLabel(`${i + 1}`).setStyle(ButtonStyle.Secondary))
        );
        const confirmRow = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('confirm').setLabel('決定して交換').setStyle(ButtonStyle.Primary)
        );

        const msg = await interaction.reply({ embeds: [getEmbed(hand, new Set())], components: [rows, confirmRow], fetchReply: true });

        const selected = new Set();
        const collector = msg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== userId) return i.reply({ content: '自分のゲームを操作してください。', ephemeral: true });
            
            if (i.customId.startsWith('card_')) {
                const index = parseInt(i.customId.split('_')[1]);
                selected.has(index) ? selected.delete(index) : selected.add(index);
                await i.update({ embeds: [getEmbed(hand, selected)] });
            } else if (i.customId === 'confirm') {
                collector.stop();
            }
        });

        collector.on('end', async () => {
            // 交換
            selected.forEach(i => hand[i] = deck.splice(0, 1)[0]);

            // ペットブースト計算
            const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
            let petBoost = 1.0;
            const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
            const equippedPets = (petData?.value?.pets || []).filter(p => equippedIds.includes(String(p.petId)));

            equippedPets.forEach(p => {
                const evoMulti = Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
                let enchant = 0;
                if (p.enchant) {
                    const lv = Number(p.enchant.level || 0);
                    if (p.enchant.type === 'power') enchant += (lv * 0.2);
                    if (p.enchant.type === 'mimic') enchant += (lv * 1.0);
                }
                petBoost += (evoMulti - 1) + enchant;
            });

            // 役判定
            const counts = {};
            hand.forEach(c => counts[c.v] = (counts[c.v] || 0) + 1);
            const pairs = Object.values(counts).filter(v => v === 2).length;
            const three = Object.values(counts).some(v => v === 3);
            const four = Object.values(counts).some(v => v === 4);

            let multi = 0;
            let rank = "ノーペア";
            if (four) { multi = 10; rank = "フォーカード"; }
            else if (three && pairs === 1) { multi = 7; rank = "フルハウス"; }
            else if (three) { multi = 3; rank = "スリーカード"; }
            else if (pairs === 2) { multi = 2; rank = "ツーペア"; }
            else if (pairs === 1) { multi = 1; rank = "ワンペア"; }

            const win = Math.floor(bet * multi * petBoost);
            const balanceChange = (multi > 0) ? (win - bet) : -bet;
            await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: balanceChange } }, { upsert: true });

            const finalEmbed = new EmbedBuilder()
                .setTitle(`🃏 結果: ${rank}`)
                .setDescription(`最終手札:\n${hand.map(c => `\` ${c.s}${c.v} \``).join(' ')}\n\n配当: **${formatCoin(win)}** 💰\nブースト: **x${petBoost.toFixed(2)}**`)
                .setColor(multi > 0 ? 'Green' : 'Red');

            await interaction.editReply({ embeds: [finalEmbed], components: [] });
        });
    }
};