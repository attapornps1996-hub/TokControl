const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..');
const destDir = path.join(__dirname, '..', 'pandy-app-win32-x64', 'resources', 'app');

const filesToCopy = ['database.js', 'server.js', 'index.html', 'overlay.html', 'random_win.html', 'main.js', 'jar-physics.js'];

console.log("Starting file sync to packaged resources folder...");
filesToCopy.forEach(file => {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(destDir, file);
    
    if (fs.existsSync(srcPath)) {
        try {
            fs.copyFileSync(srcPath, destPath);
            console.log(`Successfully synced: ${file} -> packaged app`);
        } catch (err) {
            console.error(`Failed to copy ${file}:`, err.message);
        }
    } else {
        console.warn(`Source file not found: ${srcPath}`);
    }
});
// Sync the assets folder (images used by jar-physics.js, etc.)
const assetsSrc = path.join(srcDir, 'assets');
const assetsDest = path.join(destDir, 'assets');
if (fs.existsSync(assetsSrc)) {
    fs.mkdirSync(assetsDest, { recursive: true });
    fs.readdirSync(assetsSrc).forEach(file => {
        try {
            fs.copyFileSync(path.join(assetsSrc, file), path.join(assetsDest, file));
            console.log(`Successfully synced: assets/${file} -> packaged app`);
        } catch (err) {
            console.error(`Failed to copy assets/${file}:`, err.message);
        }
    });
}

console.log("File sync completed.");
