export const COLOR_FRONT_POINT = '#10b981';
export const COLOR_REAR_POINT = '#f97316';
export const COLOR_BLUE = '#1e3a8a'; // Dark Blue

export const DOT_RADIUS = 8;
export const DOT_RADIUS_ACTIVE = 12;
export const SPLINE_DOT_RADIUS = 5;
export const SPLINE_DOT_ACTIVE_RADIUS = 7;
export const SPLINE_HANDLE_RADIUS = 5;

export const SCALE = 0.25;
export const GROUND_Y = 590; // Moved up from 650
export const CENTER_X = 960;

export const BODY_POINT_CONFIG = {
    frontFaceBreak: {
        xKey: 'frontFaceBreakX',
        yKey: 'frontFaceBreakY',
        reference: 'front',
        label: 'Front Face Break',
        color: COLOR_FRONT_POINT
    },
    bonnetEnd: {
        xKey: 'bonnetEndX',
        yKey: 'bonnetEndY',
        reference: 'front',
        label: 'Bonnet End',
        color: COLOR_FRONT_POINT
    },
    windowEnd: {
        xKey: 'windowEndX',
        yKey: 'windowEndY',
        reference: 'front',
        label: 'Window End',
        color: COLOR_FRONT_POINT
    },
    rooftopEnd: {
        xKey: 'rooftopEndX',
        yKey: 'rooftopEndY',
        reference: 'rear',
        label: 'Rooftop End',
        color: COLOR_REAR_POINT
    },
    rearWindowEnd: {
        xKey: 'rearWindowEndX',
        yKey: 'rearWindowEndY',
        reference: 'rear',
        label: 'Rear Window End',
        color: COLOR_REAR_POINT
    },
    bumperEnd: {
        xKey: 'bumperEndX',
        yKey: 'bumperEndY',
        reference: 'rear',
        label: 'Bumper End',
        color: COLOR_REAR_POINT
    }
};

export const SPLINE_MENU_OPTIONS = [
    { type: 'hard', label: 'Hard Angle' },
    { type: 'symmetric', label: 'Symmetric' },
    { type: 'asymmetric', label: 'Asymmetric' }
];

export const MIN_FRAME_WIDTH = 120;
export const MIN_FRAME_HEIGHT = 80;

// Asset coordinates relative to parent container
export const ASSET_COORDS = {
    parentOffset: { x: 397, y: 99 },
    hip: { x: 591.97, y: 542.85 },
    knee: { x: 284.26, y: 515.53 },
    heel: { x: 73, y: 832 },
    head: { x: 818, y: 0 },
    shoulder: { x: 759.49, y: 224.21 },
    elbow: { x: 557.38, y: 331.64 },
    hand: { x: 256, y: 307 }
};

export const ASSET_PIVOTS = {
    body: { x: 51.74, y: 531.88 },
    bigArm: { x: 216.68, y: 23.67 },
    smallArm: { x: 322.46, y: 46.88 },
    bigLeg: { x: 331.38, y: 61.91 },
    smallLeg: { x: 356.26, y: 27.31 }
};

