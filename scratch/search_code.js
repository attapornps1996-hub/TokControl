const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const lines = indexHtml.split('\n');

for (let idx = 5770; idx < 5800; idx++) {
    if (idx < lines.length) {
        console.log(`${idx + 1}: ${lines[idx]}`);
    }
}
