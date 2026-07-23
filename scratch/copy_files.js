const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, '..');
const candidateDirs = ['TokControl-win32-x64', 'pandy-app-win32-x64'];
const packagedRoot = candidateDirs
    .map((dir) => path.join(__dirname, '..', dir))
    .find((dir) => fs.existsSync(dir)) || path.join(__dirname, '..', 'TokControl-win32-x64');
const destDir = path.join(packagedRoot, 'resources', 'app');

const filesToCopy = ['database.js', 'server.js', 'index.html', 'overlay.html', 'random_win.html', 'main.js', 'jar-physics.js', 'gifts_sync.js', 'overlay_routes.js'];

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
// Sync bundled shared gift catalog
const dataSrc = path.join(srcDir, 'data');
const dataDest = path.join(destDir, 'data');
if (fs.existsSync(dataSrc)) {
    fs.mkdirSync(dataDest, { recursive: true });
    fs.readdirSync(dataSrc).forEach(file => {
        try {
            fs.copyFileSync(path.join(dataSrc, file), path.join(dataDest, file));
            console.log(`Successfully synced: data/${file} -> packaged app`);
        } catch (err) {
            console.error(`Failed to copy data/${file}:`, err.message);
        }
    });
}

console.log("File sync completed.");
