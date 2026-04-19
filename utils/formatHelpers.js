// utils/formatHelper.js

/**
 * 数値を 1M, 1B... 形式の文字列に変換する (100万未満はカンマ区切り)
 */
function formatCoin(number) {
    if (number === null || number === undefined) return "0";
    
    const absNum = Math.abs(number);
    
    // 1,000,000(1M)未満は通常通りカンマ区切りで返す
    if (absNum < 1000000) {
        return number.toLocaleString();
    }

    const suffixes = ["", "", "M", "B", "T", "qd", "qn", "sx", "sp", "oc", "no", "dc"];
    // 1,000ごとの指数を計算 (10^6 = tier 2)
    const tier = Math.floor(Math.log10(absNum) / 3);

    const suffix = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = number / scale;

    // 小数点第2位まで表示し、端数を整理
    return scaled.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1") + suffix;
}

/**
 * "1m" や "1.5b" などの文字列を数値に変換する
 */
function parseCoin(input) {
    if (typeof input === 'number') return input;
    if (!input) return 0;

    const units = {
        'm': 1e6,
        'b': 1e9,
        't': 1e12,
        'qd': 1e15,
        'qn': 1e18,
        'sx': 1e21
    };

    const cleanInput = input.toLowerCase().replace(/,/g, '');
    const match = cleanInput.match(/^(\d+\.?\d*)(m|b|t|qd|qn|sx)?$/);
    
    if (!match) return parseInt(cleanInput) || 0;

    const value = parseFloat(match[1]);
    const unit = match[2];

    return unit ? Math.floor(value * units[unit]) : Math.floor(value);
}

module.exports = { formatCoin, parseCoin };