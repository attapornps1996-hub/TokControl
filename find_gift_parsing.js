const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'tiktok-live-connector', 'dist', 'lib-Dgh9ZqfN.js');
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const fileContent = fs.readFileSync(filePath, 'utf8');
const term = 'async fetchAvailableGifts(';
let idx = fileContent.indexOf(term);

if (idx === -1) {
    // try alternative syntax
    const term2 = 'fetchAvailableGifts()';
    idx = fileContent.indexOf(term2);
}

if (idx === -1) {
    console.error('Could not find fetchAvailableGifts function body in lib-Dgh9ZqfN.js');
    process.exit(1);
}

const start = Math.max(0, idx - 100);
const end = Math.min(fileContent.length, idx + 1000);
console.log(fileContent.slice(start, end).replace(/\n/g, '\n'));
