const PET_MASTER = {
    //common
    'スライム': { rarity: 'Common', multiplier: 1.05 },
    '豆しば': { rarity: 'Common', multiplier: 1.05 },
    'おたまじゃくし': { rarity: 'common', multiplier: 1.05 },
    '野良猫': { rarity: 'Common', multiplier: 1.05 },
    '小鳥': { rarity: 'Common', multiplier: 1.05 },
    //Uncommon
    '三毛猫': { rarity: 'Uncommon', multiplier: 1.10 },
    'シマリス': { rarity: 'UnCommon', multiplier: 1.10 },
    '子豚': { rarity: 'UnCommon', multiplier: 1.10 },
    'ウサギ': { rarity: 'Uncommon', multiplier: 1.10 },
    'ペンギン': { rarity: 'Uncommon', multiplier: 1.10 },
    //Rare
    'シロクマ': { rarity: 'Rare', multiplier: 1.25 },
    'レッサーパンダ': { rarity: 'Rare', multiplier: 1.25 },
    '鷹': { rarity: 'Rare', multiplier: 1.25 },
    '柴犬': { rarity: 'Rare', multiplier: 1.25 },
    'キツネ': { rarity: 'Rare', multiplier: 1.25 },
    //Epic
    //Legendary
    'フェニックス': { rarity: 'Legendary', multiplier: 1.50 },
    'ユニコーン': { rarity: 'Legendary', multiplier: 1.50 },
    '白虎': { rarity: 'Legendary', multiplier: 1.50 },
    '九尾': { rarity: 'Legendary', multiplier: 1.50 },
    'グリフィン': { rarity: 'Legendary', multiplier: 1.50 },
    //Mythic
    'バハムート': { rarity: 'Myrhic', multiplier: 2.00 },
    'ゼウスの鷲': { rarity: 'Mythic', multiplier: 2.00 },
    'ケルベロス': { rarity: 'Mythic', multiplier: 2.00 },
    'リヴァイアサン': { rarity: 'Mythic', multiplier: 2.00 },
    'アーサー王の馬': { rarity: 'Mythic', multiplier: 2.00 },   
    //Secret
    '首無し騎士': { rarity: 'Secret', multiplier: 75.00 },
    'スマーフキャット': { rarity: 'Secret', multiplier: 105.00 },
    'アソパソマソ': { rarity: 'Secret', multiplier: 130.00 },
    'Keyboard Crusher': { rarity: 'Secret', multiplier: 135.00 },
    'Angel of darkness': { rarity: 'Secret', multiplier: 150.00 }, 
};

// 卵ごとの設定
const EGG_CONFIG = {
    'common_egg': {
        name: 'common egg',
        price: 1000,
        // この卵から出る特定のペットリスト（重み付け）
        contents: [
            { name: 'スライム', weight: 20 },
            { name: '豆しば', weight: 3 },
            { name: 'おたまじゃくし', weight: 1 },
            { name: '野良猫', weight: 6 },
            { name: '小鳥', weight: 1 }
        ]
    },
    'Uncommon_egg': {
        name: 'Uncommon egg',
        price: 3000,
        contents: [
            { name: '三毛猫', weight: 6 },
            { name: 'シマリス', weight: 4.5 },
            { name: '子豚', weight: 10 },
            { name: 'ウサギ', weight: 6 },
            { name: 'ペンギン', weight: 15 }
        ]
    },
    'Rare_egg': {
        name: 'Rare egg',
        price: 10000,
        contents: [
            { name: 'シロクマ', weight: 50 },
            { name: 'レッサーパンダ', weight: 40 },
            { name: '鷹', weight: 10 },
            { name: '柴犬', weight: 8 },
            { name: 'キツネ', weight: 5 }
        ]
    },
    'Legendary_egg': {
        name: 'Legendary egg',
        price: 50000,
        contents: [
            { name: 'フェニックス', weight: 50 },
            { name: 'ユニコーン', weight: 40 },
            { name: '白虎', weight: 30 },
            { name: '九尾', weight: 100 },
            { name: 'グリフィン', weight: 55 }
        ]
    },
    'Mythic_egg': {
        name: 'Mythic egg',
        price: 200000,
        contents: [
            { name: 'バハムート', weight: 100 },
            { name: 'ケルベロス', weight: 250 },
            { name: 'ゼウスの鷲', weight: 75 },
            { name: 'リヴァイアサン', weight: 750 },
            { name: 'アーサー王の馬', weight: 140 }
        ]
    },
    'Exotic_egg': {
        name: 'Exotic egg',
        price: NaN,
        isSuperShop: true,
        contents: [
            { name: 'バハムート', weight: 100 },
            { name: 'ケルベロス', weight: 250 },
            { name: 'ゼウスの鷲', weight: 75 },
            { name: 'リヴァイアサン', weight: 750 },
            { name: 'アーサー王の馬', weight: 140 }
        ]
    }
};

const SECRET_CONFIG = {
    CHANCE: 0.00001, // 0.1% の確率でシークレット判定
    PETS: ['首無し騎士', 'スマーフキャット', 'アソパソマソ', 'Keyboard Crusher', 'Angel of darkness'] // シークレット判定に当選した際に出るペット
};

const EVOLUTION_STAGES = [
    { name: '', color: null, multiplier: 1 },         // Level 0 (通常)
    { name: 'Golden', color: 0xFFD700, multiplier: 2 }, // Level 1
    { name: 'Shiny', color: 0xE6E6FA, multiplier: 4 },  // Level 2
    { name: 'Neon', color: 0x00FFFF, multiplier: 8 }   // Level 3 (最大)
];

// utils/Pet-data.js
const REBIRTH_CONFIG = {
    REQUIRED_MONEY: 1000000, 
    // SRに必要なリバース回数を計算 (初回30, 2回目40, 3回目50...)
    getRequiredRebirths: (srCount) => 30 + (srCount * 10),
    // SRでもらえるSuper Coinを計算 (1回目1枚, 2回目2枚...)
    getSuperCoinReward: (srCount) => srCount + 1,
    MAX_SLOT_EXTENSION: 7 // ペット枠拡張の上限（初期3 + 拡張7 = 最大10枠）
};

// Super Coin ショップのラインナップ
const SC_SHOP_ITEMS = {
    'Exiotic_egg': { label: 'Exotic egg', price: 114514, emoji: '💎' },
    'multiplier_boost': { label: 'Egg luck', price: 5, emoji: '🔥' },
    'auto_hatch_pass': { label: '自動孵化パス', price: 20, emoji: '🤖' }
};

module.exports = { PET_MASTER, EGG_CONFIG, EVOLUTION_STAGES, REBIRTH_CONFIG, SC_SHOP_ITEMS,SECRET_CONFIG };