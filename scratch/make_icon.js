const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const buildDir = path.join(__dirname, '..', 'build');
fs.mkdirSync(buildDir, { recursive: true });

const svg = `<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ff0050"/>
      <stop offset="100%" stop-color="#bc13fe"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" rx="96" fill="url(#g)"/>
  <text x="50%" y="54%" text-anchor="middle" font-family="Arial Black, Arial" font-size="220" font-weight="900" fill="white">T</text>
</svg>`;

async function main() {
  const pngPath = path.join(buildDir, 'icon.png');
  const icoPath = path.join(buildDir, 'icon.ico');
  await sharp(Buffer.from(svg)).resize(256, 256).png().toFile(pngPath);
  await sharp(Buffer.from(svg)).resize(256, 256).toFormat('png').toFile(icoPath.replace('.ico', '-tmp.png'));
  // electron-builder accepts png and converts; also copy as root icon.png for runtime
  const rootPng = path.join(__dirname, '..', 'icon.png');
  fs.copyFileSync(pngPath, rootPng);
  console.log('Created', pngPath, 'and', rootPng);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
