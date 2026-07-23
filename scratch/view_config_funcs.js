const fs = require('fs');
const path = require('path');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

function printFunction(name) {
    const idx = indexHtml.indexOf(`function ${name}`);
    if (idx === -1) {
        console.log(`Function ${name} not found!`);
        return;
    }
    console.log(`=== FUNCTION ${name} ===`);
    // Find the enclosing braces
    let braceCount = 0;
    let started = false;
    let endIdx = idx;
    for (let i = idx; i < indexHtml.length; i++) {
        const char = indexHtml[i];
        if (char === '{') {
            braceCount++;
            started = true;
        } else if (char === '}') {
            braceCount--;
        }
        if (started && braceCount === 0) {
            endIdx = i + 1;
            break;
        }
    }
    console.log(indexHtml.slice(idx, endIdx));
    console.log('\n');
}

printFunction('loadConfigFromServer');
printFunction('saveConfigToServer');
