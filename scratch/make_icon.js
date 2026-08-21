const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
const rootDir = path.join(__dirname, '..');
const source = process.argv[2] || path.join(rootDir, 'icon.png');

async function main() {
    if (!fs.existsSync(source)) {
        console.error('Source icon not found:', source);
        process.exit(1);
    }
    fs.mkdirSync(buildDir, { recursive: true });
    const sizes = [16, 32, 48, 64, 128, 256, 512];
    for (const size of sizes) {
        const out = path.join(buildDir, `icon-${size}.png`);
        await sharp(source).resize(size, size, { fit: 'cover' }).png().toFile(out);
    }
    const rootPng = path.join(rootDir, 'icon.png');
    await sharp(source).resize(512, 512, { fit: 'cover' }).png().toFile(rootPng);
    fs.copyFileSync(rootPng, path.join(buildDir, 'icon.png'));
    console.log('Created icon assets from', source);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
