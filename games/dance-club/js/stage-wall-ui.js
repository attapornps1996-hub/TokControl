/**
 * Shared LED wall panel styling — chat banner + profile wallpaper.
 */
import { STAGE_LED_WALL } from './room.js';

export const WALL_UI = {
    /** Compact split panel for wallpaper */
    splitW: 22,
    splitH: 5.4,
    /** Text-only banner */
    textW: 28,
    textH: 4.8,
    accent: '#ff2d95',
    accentAlt: '#00d2ff'
};

export function drawCoverImage(ctx, img, x, y, w, h) {
    if (!img?.width) return;
    const ir = img.width / img.height;
    const br = w / h;
    let sw;
    let sh;
    let sx = 0;
    let sy = 0;
    if (ir > br) {
        sh = img.height;
        sw = sh * br;
        sx = (img.width - sw) / 2;
    } else {
        sw = img.width;
        sh = sw / br;
        sy = (img.height - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

/** Left half — sender name for wallpaper */
export function drawWallpaperName(ctx, w, h, nickname) {
    ctx.clearRect(0, 0, w, h);
    const name = String(nickname || 'Viewer').replace(/^@/, '').slice(0, 22);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 64px Kanit, sans-serif';
    ctx.shadowColor = WALL_UI.accent;
    ctx.shadowBlur = 24;
    ctx.fillText(`@${name}`, w / 2, h / 2, w - 36);
    ctx.shadowBlur = 0;
}

/** Right half — avatar image only */
export function drawWallpaperImage(ctx, w, h, artImg) {
    ctx.clearRect(0, 0, w, h);
    if (artImg) drawCoverImage(ctx, artImg, 0, 0, w, h);
}
