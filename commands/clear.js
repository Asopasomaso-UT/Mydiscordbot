// GUILD_IDはdiscordのサーバアイコン右クリ→IDをコピーで取れる
const guild = client.guilds.cache.get(1313446737071046737);

// こいつで全削除
guild.commands.set([])
  .then(console.log)
  .catch(console.error);
