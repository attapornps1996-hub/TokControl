const fs = require('fs');

const file = fs.readFileSync('index.html', 'utf8');
const lines = file.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('shadowImg =') || lines[i].includes('shadowImg=')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
