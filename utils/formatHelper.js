// utils/formatHelper.js

function formatCoin(number) {
    if (number === null || number === undefined) return "0";
    const absNum = Math.abs(number);
    if (absNum < 1000000) return number.toLocaleString();

    const suffixes = ["", "", "M", "B", "T", "qd", "qn", "sx"];
    const tier = Math.floor(Math.log10(absNum) / 3);
    const suffix = suffixes[tier];
    const scale = Math.pow(10, tier * 3);
    const scaled = number / scale;

    return scaled.toFixed(2).replace(/\.00$/, "").replace(/(\.\d)0$/, "$1") + suffix;
}

function parseCoin(input) {
    if (typeof input === 'number') return input;
    if (!input) return 0;
    const units = { 'M': 1e6, 'B': 1e9, 'T': 1e12, 'Qd': 1e15, 'Qn': 1e18, 'Sx': 1e21, 'Sp': 1e24, 'Oc': 1e27, 'No': 1e30, 'Dc': 1e33 };
    const cleanInput = input.toLowerCase().replace(/,/g, '');
    const match = cleanInput.match(/^(\d+\.?\d*)(M|B|T|Qd|Qn|Sx|Sp|Oc|No|Dc)?$/);
    if (!match) return parseInt(cleanInput) || 0;
    const value = parseFloat(match[1]);
    const unit = match[2];
    return unit ? Math.floor(value * units[unit]) : Math.floor(value);
}

module.exports = { formatCoin, parseCoin };
