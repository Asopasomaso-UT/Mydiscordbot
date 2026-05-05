// ...省略（募集パネルやメインループのコード）...

async function giveReward(interaction, player, total) {
    try {
        const guildId = interaction.guild.id;
        const userId = player.user.id;
        const DataModel = mongoose.models.QuickData;
        const bet = 1000;
        const finalMulti = ((player.role==='wolf'||player.role==='fortune')?2.5:1.5) + (total * 0.1);
        const amount = Math.floor(bet * finalMulti);

        // 所持金の更新
        await DataModel.findOneAndUpdate({ id: `money_${guildId}_${userId}` }, { $inc: { value: amount } }, { upsert: true });
        
        // 生涯獲得スコア（ランキング）の更新[cite: 5]
        await DataModel.findOneAndUpdate({ id: `total_earned_${guildId}_${userId}` }, { $inc: { value: amount } }, { upsert: true });

        await interaction.channel.send(`💰 **${player.user.username}** 報酬: **${amount}** コイン`);
    } catch(e) {}
}

// ...省略...