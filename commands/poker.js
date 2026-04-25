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
        .setDescription('ポーカーで勝負します')
        .addStringOption(option => option.setName('bet').setDescription('賭け金').setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = parseCoin(interaction.options.getString('bet'));
        const moneyKey = `money_${guildId}_${userId}`;

        const userData = await DataModel.findOne({ id: moneyKey });
        if ((userData?.value || 0) < bet) return interaction.reply({ content: 'コイン不足です', ephemeral: true });

        let deck = [];
        SUITS.forEach(s => VALUES.forEach(v => deck.push({ s, v })));
        deck = deck.sort(() => Math.random() - 0.5);
        let hand = deck.splice(0, 5);

        const getEmbed = (h, s) => {
            const cards = h.map((c, i) => `${s.has(i) ? '✅' : '　'}\` ${c.s}${c.v} \``).join('\n');
            return new EmbedBuilder().setTitle('🃏 VIDEO POKER').setDescription(`交換するカードを選んでください\n\n${cards}`).setColor('Blue');
        };

        const row = new ActionRowBuilder().addComponents([0,1,2,3,4].map(i => new ButtonBuilder().setCustomId(`c_${i}`).setLabel(`${i+1}`).setStyle(ButtonStyle.Secondary)));
        const confirm = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ok').setLabel('決定').setStyle(ButtonStyle.Primary));

        const msg = await interaction.reply({ embeds: [getEmbed(hand, new Set())], components: [row, confirm], fetchReply: true });
        const selected = new Set();
        const collector = msg.createMessageComponentCollector({ time: 60000 });

        collector.on('collect', async i => {
            if (i.user.id !== userId) return;
            if (i.customId.startsWith('c_')) {
                const idx = parseInt(i.customId.split('_')[1]);
                selected.has(idx) ? selected.delete(idx) : selected.add(idx);
                await i.update({ embeds: [getEmbed(hand, selected)] });
            } else if (i.customId === 'ok') collector.stop();
        });

        collector.on('end', async () => {
            selected.forEach(i => hand[i] = deck.splice(0, 1)[0]);

            // --- 統合倍率計算 ---
            const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
            let petBoost = 1.0;
            const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
            const equippedPets = (petData?.value?.pets || []).filter(p => equippedIds.includes(String(p.petId)));

            equippedPets.forEach(p => {
                const base = Number(p.multiplier || 1.0);
                const evo = Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1.0);
                let enchant = 0;
                if (p.enchant) {
                    const lv = p.enchant.level || 0;
                    if (p.enchant.type === 'power') enchant += (lv * 0.2);
                    if (p.enchant.type === 'mimic') enchant += (lv * 1.0);
                }
                petBoost += (base * evo - 1.0) + enchant;
            });

            // 役判定
            const counts = {};
            hand.forEach(c => counts[c.v] = (counts[c.v] || 0) + 1);
            const p = Object.values(counts).filter(v => v === 2).length;
            const t = Object.values(counts).some(v => v === 3);
            const f = Object.values(counts).some(v => v === 4);

            let multi = 0, rank = "ブタ";
            if (f) { multi = 10; rank = "フォーカード"; }
            else if (t && p === 1) { multi = 7; rank = "フルハウス"; }
            else if (t) { multi = 3; rank = "スリーカード"; }
            else if (p === 2) { multi = 2; rank = "ツーペア"; }
            else if (p === 1) { multi = 1; rank = "ワンペア"; }

            const win = Math.floor(bet * multi * petBoost);
            await DataModel.findOneAndUpdate({ id: moneyKey }, { $inc: { value: (multi > 0 ? win - bet : -bet) } });

            const endEmbed = new EmbedBuilder()
                .setTitle(`🃏 結果: ${rank}`)
                .setDescription(`${hand.map(c => `\` ${c.s}${c.v} \``).join(' ')}\n\n配当: **${formatCoin(win)}** 💰\nブースト: **x${petBoost.toFixed(2)}**`)
                .setColor(multi > 0 ? 'Green' : 'Red');

            await interaction.editReply({ embeds: [endEmbed], components: [] });
        });
    }
};