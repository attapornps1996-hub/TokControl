const fs = require('fs');

const file = fs.readFileSync('server.js', 'utf8');
const lines = file.split('\n');

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes("socket.emit('tiktok_status'") || lines[i].includes('socket.emit("tiktok_status"')) {
        console.log(`Line ${i + 1}: ${lines[i].trim()}`);
    }
}
