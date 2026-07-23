const fs = require('fs');
const path = require('path');
const vm = require('vm');

const indexHtml = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');

// Extract script blocks
const regex = /<script>([\s\S]*?)<\/script>/g;
let match;
let scriptIndex = 1;
let hasError = false;

while ((match = regex.exec(indexHtml)) !== null) {
    const code = match[1];
    console.log(`Validating script block #${scriptIndex}...`);
    try {
        new vm.Script(code);
        console.log(`Script block #${scriptIndex} is syntax-valid.`);
    } catch (err) {
        hasError = true;
        console.error(`Syntax Error in script block #${scriptIndex}:`);
        console.error(err.stack || err.message);
    }
    scriptIndex++;
}

if (hasError) {
    process.exit(1);
} else {
    console.log("All script blocks are completely syntax-valid!");
}
