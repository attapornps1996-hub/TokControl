/** Room dimensions — wide stage (left-right), shallow depth (front-back). */
export const ROOM = {
    radius: 42,
    floorSize: 72,
    floorSpanX: 36,
    floorSpanZ: 14,
    ceilingHeight: 18,
    stageZ: -11
};

/** Full dance-floor tile span (center + L/R — one flat level, DJ riser separate) */
export const FLOOR_TILE = {
    spanX: 50,
    spanZ: 22,
    gridX: 26,
    gridZ: 13,
    zOffset: 2.0,
    wingCols: 5,
    wingRiserY: 0
};

const _tileSizeX = FLOOR_TILE.spanX / FLOOR_TILE.gridX;
const _tileSizeZ = FLOOR_TILE.spanZ / FLOOR_TILE.gridZ;

/** Walkable bounds aligned to LED tile grid (prevents spawn off-stage) */
export const FLOOR_BOUNDS = {
    minX: (-(FLOOR_TILE.gridX - 1) / 2) * _tileSizeX + 0.6,
    maxX: ((FLOOR_TILE.gridX - 1) / 2) * _tileSizeX - 0.6,
    minZ: (-(FLOOR_TILE.gridZ - 1) / 2) * _tileSizeZ + FLOOR_TILE.zOffset + 0.5,
    maxZ: ((FLOOR_TILE.gridZ - 1) / 2) * _tileSizeZ + FLOOR_TILE.zOffset - 0.8
};

/** Center back-wall LED — full DJ riser width (chat !ds + wallpaper + YouTube) */
export const STAGE_LED_WALL = {
    panelW: 1.55,
    panelH: 1.35,
    cols: 32,
    rows: 8,
    get spanX() { return this.cols * this.panelW; },
    yBase: 2.4,
    z: ROOM.stageZ - 4.2
};

/** Legacy alias — center of LED wall */
export const STAGE_SCREEN = {
    y: STAGE_LED_WALL.yBase + ((STAGE_LED_WALL.rows - 1) * STAGE_LED_WALL.panelH) / 2,
    z: STAGE_LED_WALL.z
};

/** Ceiling now-playing screen — high above FOV; visible during dedicated camera pans */
export const CEILING_SCREEN = {
    x: 1.8,
    y: (ROOM.ceilingHeight + 0.85) * 1.3,
    z: 3.6
};

/** Side wing spawn zones — same floor level as center */
export const SIDE_DECK = {
    y: 0,
    leftX: -20.5,
    rightX: 20.5,
    z: 2.5,
    wingHalf: 5.2
};

/** Walkable slots on DJ riser left/right of booth */
export const DJ_DECK = {
    y: 2.24,
    z: ROOM.stageZ + 0.35,
    leftX: [-12.5, -9.5, -6.8],
    rightX: [6.8, 9.5, 12.5]
};

/** Wash bar positions — around stage + beside side LED panels */
export const WASH_BAR_LAYOUT = [
    { x: -11.2, y: 4.2, z: ROOM.stageZ - 3.55, side: -1 },
    { x: 11.2, y: 4.2, z: ROOM.stageZ - 3.55, side: 1 },
    { x: -17.5, y: 5.0, z: ROOM.stageZ + 0.6, side: -1 },
    { x: 17.5, y: 5.0, z: ROOM.stageZ + 0.6, side: 1 },
    { x: -20.0, y: 6.2, z: ROOM.stageZ + 2.4, side: -1 },
    { x: 20.0, y: 6.2, z: ROOM.stageZ + 2.4, side: 1 },
    { x: -8.5, y: 7.8, z: ROOM.stageZ + 3.2, side: -1 },
    { x: 8.5, y: 7.8, z: ROOM.stageZ + 3.2, side: 1 }
];
