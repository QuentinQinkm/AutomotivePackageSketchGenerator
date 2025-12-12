import { BaseHumanRenderer } from './baseHumanRenderer.js';
import {
    ASSET_COORDS,
    ASSET_PIVOTS,
    CENTER_X,
    GROUND_Y,
    SCALE,

    COLOR_FRONT_POINT,
    COLOR_REAR_POINT
} from '../constants.js';
import {
    solveTorsoRotation,
    computeHeadPosition
} from '../driver/poseSolver.js';

const LEG_LENGTH_RATIO = {
    thigh: 0.245,
    shin: 0.246
};

// Re-using TORSO constant logic implicitly via poseSolver
// Helper to get zoom
const getZoom = (el) => parseFloat(el.dataset.zoomScale || '1');

export class PassengerRenderer extends BaseHumanRenderer {
    constructor({ canvasArea, canvasContent, stateManager, layerController, svg, coordinateSystem, config }) {
        super({
            canvasArea,
            canvasContent,
            stateManager,
            layerController,
            svg,
            coordinateSystem,
            anchorClass: 'passenger-anchor',
            layerName: 'passenger'
        });
        this.config = config; // { parentSelector, statePrefix, toggleKey, anchorLayerClass, isMidRow }

        // Define Elements
        const parent = document.querySelector(this.config.parentSelector);
        this.elements = {
            bodyParent: parent,
            bodyIcon: parent?.querySelector('.bodyandhead-icon'),
            bigLegIcon: parent?.querySelector('.big-leg-icon'),
            smallLegIcon: parent?.querySelector('.small-leg-icon'),
            kneeMarker: parent?.querySelector('.knee'),
            heelMarker: parent?.querySelector('.heel'),
            bottomFootMarker: parent?.querySelector('.bottom-foot'),
            hipJoint: parent?.querySelector('.hip-joint'),
            topHead: parent?.querySelector('.top-head')
        };

        // Create Anchor Layer
        const layerClass = `passenger-anchor-layer ${this.config.anchorLayerClass || ''}`;
        this.createAnchorLayer(layerClass);

        // Create Anchors
        this.anchorConfigs = [
            { key: 'hPoint', color: COLOR_FRONT_POINT },
            { key: 'heel', color: COLOR_REAR_POINT },
            { key: 'head', color: COLOR_FRONT_POINT }
        ];
        this.anchorConfigs.forEach(config => this.createAnchor(config));

        this.latestPassengerPose = null;
    }

    update() {
        if (!this.elements.bodyParent) return;

        this.coordinateSystem.update(); // Ensure coords are fresh

        const state = this.stateManager.getState();
        const showPassenger = state[this.config.toggleKey];
        const driverLayerActive = this.layerController?.isActive('driver') ?? false;
        const passengerLayerActive = this.layerController?.isActive('passenger') ?? false;

        // Active Row Logic
        const activeRow = state.activePassengerRow || 'last';
        const isMyRowActive = (this.config.isMidRow && activeRow === 'mid') ||
            (!this.config.isMidRow && activeRow === 'last');

        let opacity = '0.6';
        if (passengerLayerActive) {
            opacity = isMyRowActive ? '1' : '0.6';
        }
        this.elements.bodyParent.style.opacity = opacity;

        const pose = this.computePassengerPose(state);
        const canRender = Boolean(showPassenger && pose);

        this.setAnchorsVisible(passengerLayerActive && canRender && isMyRowActive);

        if (!canRender) {
            this.elements.bodyParent.style.display = 'none';
            if (!showPassenger) {
                this.cancelDrag();
            }
            this.latestPassengerPose = null;
            return;
        }

        this.elements.bodyParent.style.display = 'block';
        this.elements.bodyParent.classList.toggle('show-passenger-anchors', passengerLayerActive);

        this.latestPassengerPose = pose;

        // Positioning
        const hipScreen = this.coordinateSystem.worldToOverlay(pose.hip.x, pose.hip.y);

        if (hipScreen) {
            const svgScale = this.coordinateSystem.svgUnitScale || 1;
            const zoom = parseFloat(this.canvasArea.dataset.zoomScale || '1');
            const finalContainerScale = (pose.globalScale * svgScale) / zoom;

            const hipAssetX = this.coordinateSystem.hipAssetPosition.x;
            const hipAssetY = this.coordinateSystem.hipAssetPosition.y;

            const containerTx = hipScreen.x - (hipAssetX * finalContainerScale);
            const containerTy = hipScreen.y - (hipAssetY * finalContainerScale);

            this.elements.bodyParent.style.transformOrigin = 'top left';
            this.elements.bodyParent.style.transform = `translate(${containerTx}px, ${containerTy}px) scale(${finalContainerScale})`;

            this.applyLowerBodyPose(pose);
            this.applyUpperBodyPose(pose);
            this.updateMarkers(pose);

            if (passengerLayerActive && isMyRowActive) {
                this.updateAnchors(pose);
            }
        }
    }

    updateAnchors(pose) {
        this.updateAnchorPosition('hPoint', pose.hip.x, pose.hip.y);
        this.updateAnchorPosition('heel', pose.heel.x, pose.heel.y);
        this.updateAnchorPosition('head', pose.head.x, pose.head.y);
    }

    onAnchorMouseDown(key, event) {
        if (!this.layerController?.isActive('passenger')) return;
        super.onAnchorMouseDown(key, event);

        const P = this.config.statePrefix;
        let param = null;
        if (key === 'hPoint') param = [`${P}HPointX`, `${P}HPointHeight`];
        else if (key === 'heel') param = [`${P}FootFloorDist`, `${P}HipFootDist`];
        else if (key === 'head') param = `${P}BodyRecline`;

        if (param) this.stateManager.setInteraction(param);
    }

    onDrag(key, svgCoords) {
        if (!this.latestPassengerPose) return;
        const { referenceX, floorY, hip } = this.latestPassengerPose;
        const P = this.config.statePrefix;

        switch (key) {
            case 'hPoint': {
                // referenceX is Driver H-Point X.
                // distFromDriver = hipX - driverX.
                // dragging gives new hipX (svgCoords.x).
                // so newDist = svgCoords.x - referenceX
                const newDistX = Math.round((svgCoords.x - referenceX) / SCALE);
                const newHeight = Math.round((floorY - svgCoords.y) / SCALE);
                this.applyInputUpdates({
                    [`${P}HPointX`]: newDistX,
                    [`${P}HPointHeight`]: newHeight
                });
                break;
            }
            case 'heel': {
                // heelY is derived from FootFloorDist
                // newFootFloorDist = floorY - heelY
                const newFootFloorDist = Math.round((floorY - svgCoords.y) / SCALE);

                // heelX = hipX - HipFootDist
                // so HipFootDist = hipX - heelX
                const newHipFootDist = Math.round((hip.x - svgCoords.x) / SCALE);

                this.applyInputUpdates({
                    [`${P}FootFloorDist`]: newFootFloorDist,
                    [`${P}HipFootDist`]: newHipFootDist
                });
                break;
            }
            case 'head': {
                const dx = svgCoords.x - hip.x;
                const dy = svgCoords.y - hip.y;
                const angleRad = Math.atan2(dx, -(svgCoords.y - hip.y));
                const angleDeg = Math.round(angleRad * 180 / Math.PI);

                this.applyInputUpdates({
                    [`${P}BodyRecline`]: angleDeg
                });
                break;
            }
        }
    }

    applyInputUpdates(updates) {
        if (!updates || typeof updates !== 'object') return;
        const state = this.stateManager.getState();

        Object.entries(updates).forEach(([stateKey, value]) => {
            let effectiveMax = Infinity;
            let effectiveMin = -Infinity;
            const adjuster = document.querySelector(`.smart-adjuster[data-param="${stateKey}"]`);
            if (adjuster) {
                const minVal = parseFloat(adjuster.dataset.min);
                const maxVal = parseFloat(adjuster.dataset.max);
                if (Number.isFinite(minVal)) effectiveMin = minVal;
                if (Number.isFinite(maxVal)) effectiveMax = maxVal;
            }
            const clampedValue = Math.max(effectiveMin, Math.min(effectiveMax, value));
            if (state[stateKey] !== clampedValue && Number.isFinite(clampedValue)) {
                this.stateManager.setState({ [stateKey]: clampedValue });
            }
        });
    }

    computePassengerPose(state) {
        const P = this.config.statePrefix;

        // Calculate Driver H-Point X (World Px)
        const wheelBasePx = state.wheelBase * SCALE;
        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const driverHPointX = frontWheelX + ((state.hPointX || 0) * SCALE);

        // Input value is "Distance from Driver" (positive = behind driver)
        const distFromDriverPx = (state[`${P}HPointX`] || 0) * SCALE;

        const hipX = driverHPointX + distFromDriverPx;
        const referenceX = driverHPointX; // Dragging reference is Driver H-Point

        const groundClearancePx = state.groundClearance * SCALE;
        const floorThicknessPx = state.floorThickness * SCALE;
        const chassisBottomY = GROUND_Y - groundClearancePx;
        const floorY = chassisBottomY - floorThicknessPx;

        const hPointHeightPx = (state[`${P}HPointHeight`] || 0) * SCALE;
        const hipY = floorY - hPointHeightPx;

        const hip = { x: hipX, y: hipY };

        const footFloorDistPx = (state[`${P}FootFloorDist`] || 0) * SCALE;
        const heelY = floorY - footFloorDistPx;
        const hipFootDistPx = (state[`${P}HipFootDist`] || 0) * SCALE;
        const heelX = hip.x - hipFootDistPx;
        const heel = { x: heelX, y: heelY };

        const heightVal = state[`${P}Height`] || 170;
        const heightPx = heightVal * 10 * SCALE;

        const legPose = this.solveLegIK(hip, heel, heightPx);

        const bodyRecline = state[`${P}BodyRecline`] || 28;
        const proxyState = { bodyReclineAngle: bodyRecline };
        const torsoPose = solveTorsoRotation(proxyState, legPose.thighPx, hip);

        const head = computeHeadPosition(null, hip, legPose.globalScale, torsoPose.actualBodyReclineAngle);

        return {
            hip,
            knee: legPose.knee,
            heel,
            bottomFoot: legPose.bottomFoot,
            globalScale: legPose.globalScale,
            thighRotationDeg: legPose.thighRotationDeg,
            shinRotationDeg: legPose.shinRotationDeg,
            shinScale: legPose.shinScale,
            torsoRotationDeg: torsoPose.relativeRotationDeg,
            head,
            floorY,
            referenceX
        };
    }

    solveLegIK(hip, heel, heightPx) {
        const thighLen = heightPx * LEG_LENGTH_RATIO.thigh;
        const shinLen = heightPx * LEG_LENGTH_RATIO.shin;
        const hipHeelDist = Math.hypot(heel.x - hip.x, heel.y - hip.y);
        const maxReach = (thighLen + shinLen) * 0.999;

        let effectiveHeel = { ...heel };
        if (hipHeelDist > maxReach) {
            const ratio = maxReach / hipHeelDist;
            effectiveHeel.x = hip.x + (heel.x - hip.x) * ratio;
            effectiveHeel.y = hip.y + (heel.y - hip.y) * ratio;
        }

        const dist = Math.hypot(effectiveHeel.x - hip.x, effectiveHeel.y - hip.y);
        const baseAngle = Math.atan2(effectiveHeel.y - hip.y, effectiveHeel.x - hip.x);

        const cosAlpha = (thighLen * thighLen + dist * dist - shinLen * shinLen) / (2 * thighLen * dist);
        const alpha = Math.acos(Math.max(-1, Math.min(1, cosAlpha)));
        const thighAngle = baseAngle + alpha;

        const knee = {
            x: hip.x + thighLen * Math.cos(thighAngle),
            y: hip.y + thighLen * Math.sin(thighAngle)
        };

        const shinAngle = Math.atan2(effectiveHeel.y - knee.y, effectiveHeel.x - knee.x);
        const bottomFoot = this.computeFootEnd(knee, shinAngle, shinLen);

        const defaultThighVec = { x: ASSET_COORDS.knee.x - ASSET_COORDS.hip.x, y: ASSET_COORDS.knee.y - ASSET_COORDS.hip.y };
        const assetThighLen = Math.hypot(defaultThighVec.x, defaultThighVec.y);
        const globalScale = thighLen / assetThighLen;

        const defaultShinVec = { x: ASSET_COORDS.heel.x - ASSET_COORDS.knee.x, y: ASSET_COORDS.heel.y - ASSET_COORDS.knee.y };
        const assetShinLen = Math.hypot(defaultShinVec.x, defaultShinVec.y);
        const shinScale = shinLen / (assetShinLen * globalScale);

        return {
            knee,
            bottomFoot,
            globalScale,
            shinScale,
            thighPx: thighLen,
            thighRotationDeg: (thighAngle * 180 / Math.PI) - (Math.atan2(defaultThighVec.y, defaultThighVec.x) * 180 / Math.PI),
            shinRotationDeg: (shinAngle * 180 / Math.PI) - (Math.atan2(defaultShinVec.y, defaultShinVec.x) * 180 / Math.PI)
        };
    }

    computeFootEnd(knee, shinAngle, shinLen) {
        const footVec = {
            x: 0 - ASSET_COORDS.knee.x,
            y: 793 - ASSET_COORDS.knee.y
        };
        const footLen = Math.hypot(footVec.x, footVec.y);
        const footAngle = Math.atan2(footVec.y, footVec.x);
        const defaultShinAngle = Math.atan2(
            ASSET_COORDS.heel.y - ASSET_COORDS.knee.y,
            ASSET_COORDS.heel.x - ASSET_COORDS.knee.x
        );

        const newFootAngle = footAngle + (shinAngle - defaultShinAngle);
        const defaultShinLen = Math.hypot(ASSET_COORDS.heel.x - ASSET_COORDS.knee.x, ASSET_COORDS.heel.y - ASSET_COORDS.knee.y);

        const effectiveFootLen = footLen * (shinLen / defaultShinLen);
        return {
            x: knee.x + effectiveFootLen * Math.cos(newFootAngle),
            y: knee.y + effectiveFootLen * Math.sin(newFootAngle)
        };
    }

    applyLowerBodyPose(pose) {
        const { bigLegIcon, smallLegIcon } = this.elements;
        if (bigLegIcon) {
            // Use left/top for robust positioning
            // Use global coordinates for Icon which is in global container space
            const hipAsset = this.coordinateSystem.worldToAsset(pose.hip, pose);

            if (hipAsset) {
                // Direct Global Use
                bigLegIcon.style.left = `${hipAsset.x - ASSET_PIVOTS.bigLeg.x}px`;
                bigLegIcon.style.top = `${hipAsset.y - ASSET_PIVOTS.bigLeg.y}px`;
            }

            bigLegIcon.style.transformOrigin = `${ASSET_PIVOTS.bigLeg.x}px ${ASSET_PIVOTS.bigLeg.y}px`;
            bigLegIcon.style.transform = `rotate(${pose.thighRotationDeg}deg)`;
        }

        if (smallLegIcon) {
            // Using coordinateSystem to get asset point
            const kneeAsset = this.coordinateSystem.worldToAsset(pose.knee, pose);
            if (kneeAsset) {
                // Direct Global Use
                smallLegIcon.style.left = `${kneeAsset.x - ASSET_PIVOTS.smallLeg.x}px`;
                smallLegIcon.style.top = `${kneeAsset.y - ASSET_PIVOTS.smallLeg.y}px`;
                smallLegIcon.style.transformOrigin = `${ASSET_PIVOTS.smallLeg.x}px ${ASSET_PIVOTS.smallLeg.y}px`;
                smallLegIcon.style.transform = `rotate(${pose.shinRotationDeg}deg) scale(${pose.shinScale || 1})`;
            }
        }
    }

    applyUpperBodyPose(pose) {
        const { bodyIcon } = this.elements;
        if (bodyIcon) {
            bodyIcon.style.transformOrigin = `${ASSET_PIVOTS.body.x}px ${ASSET_PIVOTS.body.y}px`;
            bodyIcon.style.transform = `rotate(${pose.torsoRotationDeg || 0}deg)`;
        }
    }

    updateMarkers(pose) {
        this.updateMarker(this.elements.kneeMarker, pose.knee, pose);
        this.updateMarker(this.elements.heelMarker, pose.heel, pose, pose.shinRotationDeg);
        this.updateMarker(this.elements.bottomFootMarker, pose.bottomFoot, pose);
        this.updateMarker(this.elements.topHead, pose.head, pose);
    }

    updateMarker(element, worldPoint, pose, rotationDeg = 0) {
        if (!element || !worldPoint) return;
        const assetPoint = this.coordinateSystem.worldToAsset(worldPoint, pose);
        const local = this.coordinateSystem.assetToLocal(assetPoint);

        if (local) {
            element.style.left = `${local.x}px`;
            element.style.top = `${local.y}px`;
            element.style.transform = rotationDeg ? `rotate(${rotationDeg}deg)` : 'none';
        }
    }
}
