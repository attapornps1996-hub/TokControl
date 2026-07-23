const fs = require('fs');

let file = fs.readFileSync('index.html', 'utf8');

// Normalize line endings to LF
const originalLineEndings = file.includes('\r\n') ? '\r\n' : '\n';
file = file.replace(/\r\n/g, '\n');

// 1. Remove Gacha gifts tab button
const tabBtnRegex = /[ \t]*<button[^>]*id="gachaTab-gifts"[\s\S]*?<\/button>\s*/;
if (tabBtnRegex.test(file)) {
    file = file.replace(tabBtnRegex, '');
    console.log("3. Gifts tab button removed successfully via regex!");
} else {
    console.log("3. Gifts tab button target not found via regex!");
}

// 2. Remove TAB 8 gifts settings section
const settingsSecRegex = /[ \t]*<!-- TAB 8: GIFTS -->[\s\S]*?<div[^>]*id="gachaSec-gifts"[\s\S]*?<\/div>\s*<\/div>\s*/;
if (settingsSecRegex.test(file)) {
    file = file.replace(settingsSecRegex, '');
    console.log("4. Gifts settings section removed successfully via regex!");
} else {
    console.log("4. Gifts settings section target not found via regex!");
}

// Write file back
if (originalLineEndings === '\r\n') {
    file = file.replace(/\n/g, '\r\n');
}
fs.writeFileSync('index.html', file, 'utf8');
console.log("File index.html updated successfully!");
