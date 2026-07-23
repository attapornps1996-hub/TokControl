const fs = require('fs');

const file = fs.readFileSync('node_modules/tiktok-live-connector/dist/lib-Dgh9ZqfN.js', 'utf8');
const lines = file.split('\n');

let count = 0;
for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('WebcastEventMap') && count < 20) {
        console.log(`Line ${i + 1}: ${lines[i].substring(0, 150)}`);
        count++;
    }
}
