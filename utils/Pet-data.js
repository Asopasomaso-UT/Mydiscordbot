const PET_MASTER = {
    'Common': {
        color: 0xaaaaaa,
        list: [
            { name: 'スライム', multiplier: 1.05 },
            { name: '豆柴', multiplier: 1.05 },
            { name: '小鳥', multiplier: 1.05 },
            { name: 'おたまじゃくし', multiplier: 1.05 },
            { name: '野良猫', multiplier: 1.05 }
        ]
    },
    'Uncommon': {
        color: 0x55ff55,
        list: [
            { name: '三毛猫', multiplier: 1.10 },
            { name: 'シマリス', multiplier: 1.10 },
            { name: 'ペンギン', multiplier: 1.10 },
            { name: '子ブタ', multiplier: 1.10 },
            { name: 'ウサギ', multiplier: 1.10 }
        ]
    },
    'Rare': {
        color: 0x5555ff,
        list: [
            { name: 'シロクマ', multiplier: 1.25 },
            { name: 'レッサーパンダ', multiplier: 1.25 },
            { name: '鷹', multiplier: 1.25 },
            { name: '柴犬', multiplier: 1.25 },
            { name: 'キツネ', multiplier: 1.25 }
        ]
    },
    'Legendary': {
        color: 0xffff55,
        list: [
            { name: 'フェニックス', multiplier: 1.50 },
            { name: 'ユニコーン', multiplier: 1.50 },
            { name: '白虎', multiplier: 1.50 },
            { name: '九尾の狐', multiplier: 1.50 },
            { name: 'グリフォン', multiplier: 1.50 }
        ]
    },
    'Mythic': {
        color: 0xff55ff,
        list: [
            { name: 'バハムート', multiplier: 2.00 },
            { name: 'ゼウスの鷲', multiplier: 2.00 },
            { name: 'ケルベロス', multiplier: 2.00 },
            { name: 'リヴァイアサン', multiplier: 2.00 },
            { name: 'アーサー王の馬', multiplier: 2.00 }
        ]
    },
    'Secret': {
        color: 0xffffff,
        list: [
            { name: '首無し騎士', multiplier: 75 },
            { name: 'スマーフキャット', multiplier: 120 },
            { name: 'アソパソマソ', multiplier: 200 },
            { name: 'シモ・ヘイヘ', multiplier: 205 },
            { name: 'Sleepwalker', multiplier: 150 }
        ]
    }
};

// 卵ごとの設定
const EGG_CONFIG = {
    'common_egg': { label: 'Common Egg', price: 1000, rates: { 'Common': 80, 'Uncommon': 19.99999, 'Secret': 0.00001 } },
    'uncommon_egg': { label: 'Uncommon Egg', price: 3000, rates: { 'Common': 30, 'Uncommon': 60, 'Rare': 9.99999, 'Secret': 0.00001 } },
    'rare_egg': { label: 'Rare Egg', price: 10000, rates: { 'Uncommon': 40, 'Rare': 50, 'Legendary': 9.99999, 'Secret': 0.00001 } },
    'legendary_egg': { label: 'Legendary Egg', price: 50000, rates: { 'Rare': 30, 'Legendary': 60, 'Mythic': 9.9999, 'Secret': 0.0001 } },
    'mythic_egg': { label: 'Mythic Egg', price: 200000, rates: { 'Legendary': 40, 'Mythic': 59.999, 'Secret': 0.001 } }
};

module.exports = { PET_MASTER, EGG_CONFIG };