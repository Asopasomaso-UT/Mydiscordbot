const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const mongoose = require('mongoose');
const DataModel = mongoose.models.QuickData;
const { formatCoin, parseCoin } = require('../utils/formatHelper');
const { EVOLUTION_STAGES } = require('../utils/Pet-data');

const SUITS = ['♠️', '♥️', '♦️', '♣️'];
const VALUES = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];

module.exports = {
    data: new SlashCommandBuilder()
        .setName('poker')
        .setDescription('ビデオポーカーで勝負します')
        .addStringOption(option => option.setName('bet').setDescription('賭け金 (例: 1m, 10b)').setRequired(true)),

    async execute(interaction) {
        const userId = interaction.user.id;
        const guildId = interaction.guild.id;
        const bet = parseCoin(interaction.options.getString('bet'));

        if (isNaN(bet) || bet < 100) return interaction.reply({ content: '有効な賭け金を100以上で入力してください。', ephemeral: true });

        const moneyKey = `money_${guildId}_${userId}`;
        const userData = await DataModel.findOne({ id: moneyKey });
        if ((userData?.value || 0) < bet) return interaction.reply({ content: 'コインが足りません！', ephemeral: true });

        let deck = [];
        SUITS.forEach(s => VALUES.forEach(v => deck.push({ s, v })));
        deck = deck.sort(() => Math.random() - 0.5);
        let hand = deck.splice(0, 5);

        const getEmbed = (h, s) => {
            const cards = h.map((c, i) => `${s.has(i) ? '✅' : '　'}\` ${c.s}${c.v} \``).join('\n');
            return new EmbedBuilder().setTitle('🃏 VIDEO POKER').setDescription(`交換するカードを選択して「決定」を押してください。\n\n${cards}`).setColor('Blue');
        };

        const row = new ActionRowBuilder().addComponents([0,1,2,3,4].map(i => new ButtonBuilder().setCustomId(`c_${i}`).setLabel(`${i+1}`).setStyle(ButtonStyle.Secondary)));
        const confirm = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ok').setLabel('決定して交換').setStyle(ButtonStyle.Primary));

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

            // --- じゃんけんと同じ方式の倍率計算 ---
            const petData = await DataModel.findOne({ id: `pet_data_${guildId}_${userId}` });
            let totalMultiplier = 0;
            const pets = petData?.value?.pets || [];
            const equippedIds = (petData?.value?.equippedPetIds || []).map(id => String(id));
            const equippedPets = pets.filter(p => equippedIds.includes(String(p.petId)));

            equippedPets.forEach(p => {
                const basePart = Number(p.multiplier || 1) * Number(EVOLUTION_STAGES[p.evoLevel || 0].multiplier || 1);
                let enchantFactor = 1.0;
                if (p.enchant) {
                    const type = String(p.enchant.type).toLowerCase();
                    const lv = Number(p.enchant.level || 0);
                    if (type === 'power') enchantFactor += (lv * 0.2);
                    else if (type === 'mimic') enchantFactor += lv;
                }
                totalMultiplier += (basePart * enchantFactor);
            });
            if (totalMultiplier < 1) totalMultiplier = 1.0;

            // 役判定
            const counts = {};
            hand.forEach(c => counts[c.v] = (counts[c.v] || 0) + 1);
            const pairs = Object.values(counts).filter(v => v === 2).length;
            const three = Object.values(counts).some(v => v === 3);
            const four = Object.values(counts).some(v => v === 4);

            let multi = 0, rank = "ノーペア";
            if (four) { multi = 10; rank = "フォーカード"; }
            else if (three && pairs === 1) { multi = 7; rank = "フルハウス"; }
            else if (three) { multi = 3; rank = "スリーカード"; }
            else if (pairs === 2) { multi = 2; rank = "ツーペア"; }
            else if (pairs === 1) { multi = 1; rank = "ワンペア"; }

            const win = Math.floor(bet * multi * totalMultiplier);
            const changeAmount = (multi > 0) ? (win - bet) : -bet;

            const updatedRecord = await DataModel.findOneAndUpdate(
                { id: moneyKey },
                { $inc: { value: changeAmount } },
                { upsert: true, returnDocument: 'after' }
            );

            const endEmbed = new EmbedBuilder()
                .setTitle(`🃏 結果: ${rank}`)
                .setColor(multi > 0 ? 'Green' : 'Red')
                .setDescription([
                    hand.map(c => `\` ${c.s}${c.v} \``).join(' '),
                    `━━━━━━━━━━━━━━`,
                    `ペット合計倍率: **x${totalMultiplier.toFixed(2)}**`,
                    `配当: **${formatCoin(win)}** 💰`,
                    `現在の残高: **${formatCoin(updatedRecord.value || 0)}** 💰`
                ].join('\n'));

            await interaction.editReply({ embeds: [endEmbed], components: [] });
        });
    }
};