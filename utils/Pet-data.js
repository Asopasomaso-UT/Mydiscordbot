const PET_MASTER = {
    // 既存のペットデータ (省略なしで維持)
    'スライム': { rarity: 'Common', multiplier: 1.05 },
    '豆しば': { rarity: 'Common', multiplier: 1.05 },
    'おたまじゃくし': { rarity: 'Common', multiplier: 1.05 },
    '野良猫': { rarity: 'Common', multiplier: 1.05 },
    '小鳥': { rarity: 'Common', multiplier: 1.05 },
    'キラキラスライム': { rarity: 'Uncommon', multiplier: 1.10 },
    '三毛猫': { rarity: 'Uncommon', multiplier: 1.10 },
    'シマリス': { rarity: 'Uncommon', multiplier: 1.10 },
    '子豚': { rarity: 'Uncommon', multiplier: 1.10 },
    'ウサギ': { rarity: 'Uncommon', multiplier: 1.10 },
    'ペンギン': { rarity: 'Uncommon', multiplier: 1.10 },
    'レアスライム': { rarity: 'Rare', multiplier: 1.25 },
    'シロクマ': { rarity: 'Rare', multiplier: 1.25 },
    'レッサーパンダ': { rarity: 'Rare', multiplier: 1.25 },
    '鷹': { rarity: 'Rare', multiplier: 1.25 },
    '柴犬': { rarity: 'Rare', multiplier: 1.25 },
    'キツネ': { rarity: 'Rare', multiplier: 1.25 },
    '人魚': { rarity: 'Epic', multiplier: 1.40 },
    'スライムの英雄': { rarity: 'Epic', multiplier: 1.40 },
    'Flowey': { rarity: 'Epic', multiplier: 1.40 },
    'Gargoyle': { rarity: 'Epic', multiplier: 1.40 },
    'レジェンドスライム': { rarity: 'Legendary', multiplier: 1.50 },
    'フェニックス': { rarity: 'Legendary', multiplier: 1.50 },
    'ユニコーン': { rarity: 'Legendary', multiplier: 1.50 },
    '白虎': { rarity: 'Legendary', multiplier: 1.50 },
    '九尾': { rarity: 'Legendary', multiplier: 1.50 },
    'Toriel': { rarity: 'Legendary', multiplier: 1.50 },
    'グリフィン': { rarity: 'Legendary', multiplier: 1.50 },
    '半魚人': { rarity: 'Legendary', multiplier: 1.50 },
    'ドラゴン': { rarity: 'Legendary', multiplier: 1.50 },
    '神話のスライム': { rarity: 'Mythic', multiplier: 2.00 },
    'バハムート': { rarity: 'Mythic', multiplier: 2.00 },
    'ゼウスの鷲': { rarity: 'Mythic', multiplier: 2.00 },
    'ケルベロス': { rarity: 'Mythic', multiplier: 2.00 },
    'リヴァイアサン': { rarity: 'Mythic', multiplier: 2.00 },
    'アーサー王の馬': { rarity: 'Mythic', multiplier: 2.00 },
    '魚人': { rarity: 'Mythic', multiplier: 2.00 },   
    'Undyne': { rarity: 'Mythic', multiplier: 2.00 },
    'ハデス': { rarity: 'Mythic', multiplier: 2.00 },
    'ドラクエスライム': { rarity: 'Unique', multiplier: 4.00 },
    '海蛇': { rarity: 'Unique', multiplier: 4.00 },
    'Asgore': { rarity: 'Unique', multiplier: 4.00 },
    '虚無の支配者': { rarity: 'Unique', multiplier: 4.00 },
    'Minecraft slime': { rarity: 'Artifact', multiplier: 25.00 },
    'シーモンキー': { rarity: 'Artifact', multiplier: 40.00 },
    'Sans': { rarity: 'Artifact', multiplier: 20.00 },
    'Omega flowey': { rarity: 'Artifact', multiplier: 35.00 },
    '首無し騎士': { rarity: 'Secret', multiplier: 75.00 },
    'Skibidi toilet': { rarity: 'Secret', multiplier: 80.00 },
    'スマーフキャット': { rarity: 'Secret', multiplier: 105.00 },
    'アソパソマソ': { rarity: 'Secret', multiplier: 130.00 },
    'Keyboard Crusher': { rarity: 'Secret', multiplier: 135.00 },
    'Angel of darkness': { rarity: 'Secret', multiplier: 150.00 }, 
    'おにっぴ': { rarity: 'Secret', multiplier: 140.00 },
    '野獣先輩': { rarity: 'Secret', multiplier: 114.51 },
    'Undyne the Undying': { rarity: 'Secret', multiplier: 99.00 },
    'Gemini-3': { rarity: 'Secret', multiplier: 85.00 },
    // Ancient Egg Pets
    'Pteranodon': { rarity: 'Epic', multiplier: 1.40 },
    'Triceratops': { rarity: 'Legendary', multiplier: 1.50 },
    'Tyrannosaurus Rex': { rarity: 'Mythic', multiplier: 2.00 },
    'Mosasaurus': { rarity: 'Unique', multiplier: 5.00 },
    'Cyber-Raptor': { rarity: 'Artifact', multiplier: 30.00 },
    'Primal Fear': { rarity: 'Secret', multiplier: 100.00 },
    // Relic Egg Pets (上位互換)
    'Spinosaurus': { rarity: 'Epic', multiplier: 1.45 },
    'Ankylosaurus': { rarity: 'Legendary', multiplier: 1.80 },
    'Giga-Tyrant': { rarity: 'Mythic', multiplier: 3.50 },
    'Dreadnoughtus': { rarity: 'Unique', multiplier: 8.00 },
    'Ancient Wyvern': { rarity: 'Artifact', multiplier: 40.00 },
    'The Genesis Dragon': { rarity: 'Secret', multiplier: 280.00 },
};

// EGG_CONFIG の各卵に shopChance を追加
const EGG_CONFIG = {
    'common_egg': {
        name: 'Common Egg', price: 1000, shopChance: 100, // 出やすい
        rates: { 'Common': 100 },
        contents: ['スライム', '豆しば', 'おたまじゃくし', '野良猫', '小鳥']
    },
    'Uncommon_egg': {
        name: 'Uncommon Egg', price: 3000, shopChance: 90,
        rates: { 'Uncommon': 100 },
        contents: ['三毛猫', 'シマリス', '子豚', 'ウサギ', 'ペンギン']
    },
    'Rare_egg': {
        name: 'Rare Egg', price: 10000, shopChance: 60,
        rates: { 'Rare': 100 },
        contents: ['シロクマ', 'レッサーパンダ', '鷹', '柴犬', 'キツネ']
    },
    'Legendary_egg': {
        name: 'Legendary Egg', price: 50000, shopChance: 40,
        rates: { 'Legendary': 100 },
        contents: ['フェニックス', 'ユニコーン', '白虎', '九尾', 'グリフィン']
    },
    'Mythic_egg': {
        name: 'Mythic Egg', price: 200000, shopChance: 20, // 出にくい
        rates: { 'Mythic': 100 },
        contents: ['バハムート', 'ケルベロス', 'ゼウスの鷲', 'リヴァイアサン', 'アーサー王の馬']
    },
    'slime_egg': {
        name: 'Slime Egg', price: 150000, shopChance: 15,
        rates: { 'Common': 40, 'Uncommon': 30, 'Rare': 15, 'Epic': 10, 'Legendary': 4, 'Mythic': 1 },
        contents: ['スライム', 'キラキラスライム', 'レアスライム', 'スライムの英雄', 'レジェンドスライム', '神話のスライム', 'ドラクエスライム', 'Minecraft slime']
    },
    'Undertale_egg': {
        name: 'Undertale Egg', price: 500000, shopChance: 5, // レア
        rates: {'Epic': 40, 'Legendary': 30, 'Mythic': 15, 'Unique':10, 'Artifact':4.85, 'Secret':0.15 },
        contents: ['Flowey', 'Toriel', 'Undyne', 'Asgore', 'Sans', 'Undyne the Undying']
    },
    'Exotic_egg': {
        name: 'Exotic Egg', price: 10, isSuperShop: true,
        rates: { 'Epic': 50, 'Legendary': 30, 'Mythic': 15, 'Unique': 4, 'Artifact': 1 },
        contents: ['人魚', '半魚人', '魚人', '海蛇', 'シーモンキー']
    },
    'Premium_egg': {
        name: 'Premium Egg', price: 10, isSuperShop: true,
        rates: { 'Epic': 49.5, 'Legendary': 30, 'Mythic': 15, 'Unique': 4, 'Artifact': 1, 'Secret':0.5 },
        contents: ['Gargoyle', 'ドラゴン', 'ハデス', '虚無の支配者', 'Omega flowey', 'Gemini-3']
    },
    'ancient_egg': {
        name: 'Ancient Egg', price: 15, isSuperShop: true,
        rates: { 'Epic': 50, 'Legendary': 30, 'Mythic': 15, 'Unique': 4, 'Artifact': 0.9, 'Secret': 0.1 },
        contents: ['Pteranodon', 'Triceratops', 'Tyrannosaurus Rex', 'Mosasaurus', 'Cyber-Raptor', 'Primal Fear']
    },
    'relic_egg': {
        name: 'Relic Egg', price: 30, isSuperShop: true,
        rates: { 'Epic': 40, 'Legendary': 30, 'Mythic': 20, 'Unique': 7, 'Artifact': 2.5, 'Secret': 0.015 },
        contents: ['Spinosaurus', 'Ankylosaurus', 'Giga-Tyrant', 'Dreadnoughtus', 'Ancient Wyvern', 'The Genesis Dragon']
    },
};

const SECRET_CONFIG = {
    CHANCE: 0.00001, // 基本 0.001% (万が一の当選)
    PETS: ['首無し騎士', 'スマーフキャット', 'アソパソマソ', 'Keyboard Crusher', 'Angel of darkness', 'おにっぴ', '野獣先輩', 'Gemini-3']
};

const EVOLUTION_STAGES = [
    { name: '', color: null, multiplier: 1 }, 
    { name: 'Golden', color: 0xFFD700, multiplier: 2 }, 
    { name: 'Shiny', color: 0xE6E6FA, multiplier: 4 },  
    { name: 'Neon', color: 0x00FFFF, multiplier: 8 }   
];

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
    // 卵の販売
    'Exotic_egg': {
        name: 'Exotic egg',
        price: 10,
        type: 'egg', // 種類を分ける
        Egg_key: 'Exotic_egg'
    },
    'Premium_egg': {
        name: 'Premium egg',
        price: 30,
        type: 'egg', // 種類を分ける
        Egg_key: 'Premium_egg'
    },
    'Ancient_egg': {
        name: 'Ancient Egg',
        price: 15,
        type: 'egg',
        Egg_key: 'Ancient_egg'
    },
    'Relic_egg': {
        name: 'Relic Egg',
        price: 40,
        type: 'egg',
        Egg_key: 'Relic_egg'
    },
};

const ENCHANT_TYPES = {
    'power': { name: 'Power', desc: 'ペット倍率アップ' },
    'secret_agent': { name: 'Secret Agent', desc: 'シークレット確率アップ' },
    'energy': { name: 'Energy', desc: '獲得経験値(XP)ブースト' },
    'special_hatch': { name: 'Special Hatch', desc: '孵化時にクラフト済みが出る可能性' },
    'mimic': { name: 'Mimic', desc: 'ペット倍率が超大幅アップ' }
};

// 強化設定
const ENCHANT_UPGRADE = {
    1: { next: 2, success: 0.90, failLevel: 1, cost: 5000 },
    2: { next: 3, success: 0.75, failLevel: 1, cost: 15000 },
    3: { next: 4, success: 0.50, failLevel: 2, cost: 40000 },
    4: { next: 5, success: 0.25, failLevel: 3, cost: 100000 }
};

// utils/Pet-data.js などの設定ファイルへ

const ENCHANT_CHANCES = {
    'power': 58.9,          // 通常枠
    'energy': 30.0,         // 中レア
    'special_hatch': 10.0,   // レア
    'secret_agent': 1.0,    // 超レア (1%)
    'mimic': 0.1            // 伝説級 (0.1%)
};

function getRandomEnchant() {
    const rand = Math.random() * 100;
    let cumulative = 0;
   
    for (const [enchant, chance] of Object.entries(ENCHANT_CHANCES)) {
        cumulative += chance;
        if (rand <= cumulative) return enchant;
    }
    return 'power'; // フォールバック
}

const ITEM_MASTER = {
    'rare_candy': { name: '🍬 不思議なあめ' },
    'enchant_shield': { name: '🛡️ エンチャントシールド' },
    'monday_bread': { name: '🍞 特製チョコパン' },
    'weekend_charm': { name: '✨ 週末の至高のひととき' },
    'birthday_cake': { name: '🎂 アソパソの誕生日ケーキ' },
    'common_egg': { name: '🥚Common Egg' },
    'Uncommon_egg': { name: '🟢Uncommon Egg' },
    'Rare_egg': { name: '🔵Rare Egg' },
    'Legendary_egg': { name: '🟡Legendary Egg' },
    'Mythic_egg': { name: '🟣Mythic Egg' },
    'slime_egg': { name: '👽Slime Egg' },
    'Undertale_egg': { name: '💀Undertale Egg' },
    'Premium_egg': { name: '👑Premium Egg' },
    'Exotic_egg': { name: '💎Exotic Egg' },
    'ancient_egg': { name: '🦴Ancient Egg' },
    'relic_egg': { name: '🏺Relic Egg' },
};

module.exports = { 
    PET_MASTER, 
    EGG_CONFIG, 
    EVOLUTION_STAGES, 
    REBIRTH_CONFIG, 
    SC_SHOP_ITEMS, 
    SECRET_CONFIG,
    ENCHANT_TYPES,
    ENCHANT_UPGRADE,
    ENCHANT_CHANCES,
    ITEM_MASTER,
    getRandomEnchant 
};