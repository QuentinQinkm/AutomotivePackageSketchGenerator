import {
    ASSET_COORDS,
    CENTER_X,
    GROUND_Y,
    SCALE
} from '../constants.js';

const LEG_LENGTH_RATIO = {
    thigh: 0.245,
    shin: 0.246
};

const ARM_LENGTHS = {
    upper: distanceBetween(ASSET_COORDS.elbow, ASSET_COORDS.shoulder),
    forearm: distanceBetween(ASSET_COORDS.hand, ASSET_COORDS.elbow)
};

const TORSO = {
    vector: {
        x: (ASSET_COORDS.parentOffset.x + ASSET_COORDS.shoulder.x) -
            (ASSET_COORDS.parentOffset.x + ASSET_COORDS.hip.x),
        y: (ASSET_COORDS.parentOffset.y + ASSET_COORDS.shoulder.y) -
            (ASSET_COORDS.parentOffset.y + ASSET_COORDS.hip.y)
    }
};
TORSO.length = Math.hypot(TORSO.vector.x, TORSO.vector.y);
TORSO.defaultAngleFromHorizontal = Math.atan2(TORSO.vector.y, TORSO.vector.x);
TORSO.defaultAngleFromVertical = Math.atan2(TORSO.vector.x, -TORSO.vector.y);

export function computeDriverPose(state) {
    if (!state) return null;

    const wheelBasePx = state.wheelBase * SCALE;
    const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
    const groundClearancePx = state.groundClearance * SCALE;
    const floorThicknessPx = state.floorThickness * SCALE;
    const frontWheelX = CENTER_X - (wheelBasePx / 2);
    const rearWheelX = CENTER_X + (wheelBasePx / 2);
    const chassisBottomY = GROUND_Y - groundClearancePx;
    const floorY = chassisBottomY - floorThicknessPx;
    const wheelCenterY = GROUND_Y - tireRadiusPx;

    const hip = getHipPosition(state, frontWheelX, floorY);
    const leg = solveLegPose(state, hip, floorY);
    const torso = solveTorsoRotation(state, leg.scaleFactors.thighPx, hip);
    const arm = solveArmPose(state, hip, torso, leg.scaleFactors.thighPx);
    const head = computeHeadPosition(state, hip, leg.scaleFactors.globalScale, torso.actualBodyReclineAngle);

    return {
        frontWheelX,
        rearWheelX,
        floorY,
        wheelCenterY,
        wheelBasePx,
        tireRadiusPx,
        hip,
        knee: leg.knee,
        heel: leg.heel,
        bottomFoot: leg.bottomFoot,
        thighRotationDeg: leg.thighRotationDeg,
        shinRotationDeg: leg.shinRotationDeg,
        shinScale: leg.scaleFactors.shinScale,
        globalScale: leg.scaleFactors.globalScale,
        torsoRotationDeg: torso.relativeRotationDeg,
        actualBodyReclineAngle: torso.actualBodyReclineAngle,
        shoulder: arm.shoulder,
        elbow: arm.elbow,
        hand: arm.hand,
        armRotations: {
            upperDeg: arm.upperArmRotationDeg,
            forearmDeg: arm.forearmRotationDeg
        },
        head
    };
}

function getHipPosition(state, frontWheelX, floorY) {
    const hPointXPx = state.hPointX * SCALE;
    const hHeightPx = state.hPointHeight * SCALE;
    return {
        x: frontWheelX + hPointXPx,
        y: floorY - hHeightPx
    };
}

function solveLegPose(state, hip, floorY) {
    const heightPx = (state.mannequinHeight || 0) * 10 * SCALE;
    const thighLen = heightPx * LEG_LENGTH_RATIO.thigh;
    const shinLen = heightPx * LEG_LENGTH_RATIO.shin;
    const maxLegReach = (thighLen + shinLen) * 0.999;
    const minLegReach = Math.abs(thighLen - shinLen) * 1.001;

    const hipPedalDistPx = state.hipPedalDistance * SCALE;
    const desiredHeel = {
        x: hip.x - hipPedalDistPx,
        y: floorY
    };

    const delta = clampLegDistance(hip, desiredHeel, {
        thighLen,
        shinLen,
        maxLegReach,
        minLegReach
    });

    const finalHeel = {
        x: hip.x - delta.dx,
        y: floorY
    };

    const hipHeelDistance = distanceBetween(hip, finalHeel);
    const baseAngle = Math.atan2(finalHeel.y - hip.y, finalHeel.x - hip.x);
    const alpha = Math.acos(
        (square(thighLen) + square(hipHeelDistance) - square(shinLen)) / (2 * thighLen * hipHeelDistance)
    );
    const thighAngle = baseAngle + alpha;
    const knee = {
        x: hip.x + thighLen * Math.cos(thighAngle),
        y: hip.y + thighLen * Math.sin(thighAngle)
    };
    const shinAngle = Math.atan2(finalHeel.y - knee.y, finalHeel.x - knee.x);
    const bottomFoot = computeFootEnd(knee, shinAngle, shinLen);

    const defaultThighVec = vectorBetween(ASSET_COORDS.knee, ASSET_COORDS.hip);
    const defaultShinVec = vectorBetween(ASSET_COORDS.heel, ASSET_COORDS.knee);

    const assetThighLen = Math.hypot(defaultThighVec.x, defaultThighVec.y);
    const globalScale = thighLen / assetThighLen;
    const assetShinLen = Math.hypot(defaultShinVec.x, defaultShinVec.y);
    const shinScale = shinLen / (assetShinLen * globalScale);

    return {
        knee,
        heel: finalHeel,
        bottomFoot,
        thighRotationDeg: toDegrees(thighAngle - Math.atan2(defaultThighVec.y, defaultThighVec.x)),
        shinRotationDeg: toDegrees(shinAngle - Math.atan2(defaultShinVec.y, defaultShinVec.x)),
        scaleFactors: {
            globalScale,
            shinScale,
            thighPx: thighLen
        }
    };
}

function clampLegDistance(hip, heel, { thighLen, shinLen, maxLegReach, minLegReach }) {
    const dy = Math.abs(heel.y - hip.y);
    let dx = hip.x - heel.x;
    const currentDist = Math.hypot(dx, dy);

    if (dy > maxLegReach) {
        dx = 0;
    } else if (currentDist > maxLegReach) {
        dx = Math.sqrt(square(maxLegReach) - square(dy));
    } else if (currentDist < minLegReach && dy < minLegReach) {
        dx = Math.sqrt(square(minLegReach) - square(dy));
    }

    return { dx };
}

function solveTorsoRotation(state, thighLenPx, hip) {
    const desiredDeg = state.bodyReclineAngle;
    const desiredRad = degreesToRadians(desiredDeg - toDegrees(TORSO.defaultAngleFromVertical));
    const currentAngle = TORSO.defaultAngleFromHorizontal + desiredRad;

    const shoulder = {
        x: hip.x + thighLenPx * Math.cos(currentAngle),
        y: hip.y + thighLenPx * Math.sin(currentAngle)
    };

    return {
        shoulderGuess: shoulder,
        relativeRotationDeg: toDegrees(desiredRad),
        actualBodyReclineAngle: desiredDeg
    };
}

function solveArmPose(state, hip, torso, thighLenPx) {
    const simpleScale = thighLenPx / distanceBetween(ASSET_COORDS.knee, ASSET_COORDS.hip);
    const targetHand = {
        x: hip.x - (state.handDistanceX * SCALE),
        y: hip.y - (state.handHeight * SCALE)
    };

    const shoulder = torso.shoulderGuess || { ...hip };
    const shoulderToHand = distanceBetween(shoulder, targetHand);
    const maxReach = (ARM_LENGTHS.upper + ARM_LENGTHS.forearm) * simpleScale * 0.999;
    const minReach = Math.abs(ARM_LENGTHS.upper - ARM_LENGTHS.forearm) * simpleScale * 1.001;

    let clampedHand = { ...targetHand };
    if (shoulderToHand > maxReach) {
        clampedHand = movePointAlong(shoulder, targetHand, maxReach / shoulderToHand);
    } else if (shoulderToHand < minReach) {
        clampedHand = movePointAlong(shoulder, targetHand, minReach / shoulderToHand);
    }

    const { elbow, upperArmRotationDeg, forearmRotationDeg } =
        solveTwoBoneIK(shoulder, clampedHand, ARM_LENGTHS.upper * simpleScale, ARM_LENGTHS.forearm * simpleScale);

    return {
        shoulder,
        elbow,
        hand: clampedHand,
        upperArmRotationDeg,
        forearmRotationDeg
    };
}

function solveTwoBoneIK(shoulder, hand, upperLen, foreLen) {
    const distance = distanceBetween(shoulder, hand);
    const cosAlpha = (square(upperLen) + square(distance) - square(foreLen)) / (2 * upperLen * distance);
    const alpha = Math.acos(clamp(cosAlpha, -1, 1));
    const shoulderToHandAngle = Math.atan2(hand.y - shoulder.y, hand.x - shoulder.x);
    const upperAngle = shoulderToHandAngle - alpha;

    const elbow = {
        x: shoulder.x + upperLen * Math.cos(upperAngle),
        y: shoulder.y + upperLen * Math.sin(upperAngle)
    };
    const forearmAngle = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);

    const defaultUpperAngle = Math.atan2(
        ASSET_COORDS.elbow.y - ASSET_COORDS.shoulder.y,
        ASSET_COORDS.elbow.x - ASSET_COORDS.shoulder.x
    );
    const defaultForearmAngle = Math.atan2(
        ASSET_COORDS.hand.y - ASSET_COORDS.elbow.y,
        ASSET_COORDS.hand.x - ASSET_COORDS.elbow.x
    );

    return {
        elbow,
        upperArmRotationDeg: toDegrees(upperAngle - defaultUpperAngle),
        forearmRotationDeg: toDegrees(forearmAngle - defaultForearmAngle)
    };
}

function computeFootEnd(knee, shinAngle, shinLen) {
    const footVec = {
        x: 0 - ASSET_COORDS.knee.x,
        y: 793 - ASSET_COORDS.knee.y
    };
    const footLen = Math.hypot(footVec.x, footVec.y);
    const footAngle = Math.atan2(footVec.y, footVec.x);
    const newFootAngle = footAngle + (shinAngle - Math.atan2(
        ASSET_COORDS.heel.y - ASSET_COORDS.knee.y,
        ASSET_COORDS.heel.x - ASSET_COORDS.knee.x
    ));
    const effectiveFootLen = footLen * (shinLen / distanceBetween(ASSET_COORDS.heel, ASSET_COORDS.knee));
    return {
        x: knee.x + effectiveFootLen * Math.cos(newFootAngle),
        y: knee.y + effectiveFootLen * Math.sin(newFootAngle)
    };
}

function computeHeadPosition(state, hip, globalScale, actualBodyReclineAngle) {
    const headVector = {
        x: ASSET_COORDS.head.x - ASSET_COORDS.hip.x,
        y: ASSET_COORDS.head.y - ASSET_COORDS.hip.y
    };
    const defaultBodyAngleFromVertical = toDegrees(TORSO.defaultAngleFromVertical);
    const deltaDeg = (actualBodyReclineAngle ?? defaultBodyAngleFromVertical) - defaultBodyAngleFromVertical;
    const rotationRad = degreesToRadians(deltaDeg);
    const rotated = rotateVector(headVector, rotationRad);
    return {
        x: hip.x + rotated.x * globalScale,
        y: hip.y + rotated.y * globalScale
    };
}

function rotateVector(vector, angleRad) {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
        x: vector.x * cos - vector.y * sin,
        y: vector.x * sin + vector.y * cos
    };
}

function distanceBetween(a, b) {
    if (!a || !b) return 0;
    return Math.hypot((b.x - a.x), (b.y - a.y));
}

function vectorBetween(a, b) {
    return {
        x: a.x - b.x,
        y: a.y - b.y
    };
}

function movePointAlong(start, end, factor) {
    return {
        x: start.x + (end.x - start.x) * factor,
        y: start.y + (end.y - start.y) * factor
    };
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

function square(value) {
    return value * value;
}

function toDegrees(rad) {
    return rad * (180 / Math.PI);
}

function degreesToRadians(deg) {
    return deg * (Math.PI / 180);
}

