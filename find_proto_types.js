const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'node_modules', 'tiktok-live-proto', 'dist', 'node', 'v3.d.ts');
if (!fs.existsSync(filePath)) {
    console.error('File not found:', filePath);
    process.exit(1);
}

const fileContent = fs.readFileSync(filePath, 'utf8');
const searchStr = 'interface Gift {';
const startIdx = fileContent.indexOf(searchStr);

if (startIdx === -1) {
    console.error('Could not find interface Gift { in v3.d.ts');
    process.exit(1);
}

const slice = fileContent.slice(startIdx, startIdx + 1500);
console.log(slice);
