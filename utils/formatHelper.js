// utils/formatHelper.js

function formatCoin(number) {
    if (number === null || number === undefined) return "0";
    const absNum = Math.abs(number);
    if (absNum < 1000000) return number.toLocaleString();

    const suffixes = ["", "", "M", "B", "T", "Qd", "Qn", "Sx", "Sp", "Oc", "No", "Dc", "Udc", "Ddc"];
    const tier = Math.floor(Math.log10(absNum) / 3);
    const suffix = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = number / scale;

    return scaled.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1") + suffix;
}

function parseCoin(input) {
    if (typeof input === 'number') return input;
    if (!input) return 0;
    const units = { 'm': 1e6, 'b': 1e9, 't': 1e12, 'qd': 1e15, 'qn': 1e18, 'sx': 1e21, 'sp': 1e24, 'oc': 1e27, 'no': 1e30, 'dc': 1e33 };
    const cleanInput = input.toLowerCase().replace(/,/g, '');
    const match = cleanInput.match(/^(\d+\.?\d*)(m|b|t|qd|qn|sx|sp|oc|no|dc|udc|ddc)?$/);
    if (!match) return parseInt(cleanInput) || 0;
    const value = parseFloat(match[1]);
    const unit = match[2];
    return unit ? Math.floor(value * units[unit]) : Math.floor(value);
}

module.exports = { formatCoin, parseCoin };
