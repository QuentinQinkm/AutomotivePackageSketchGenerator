import {
    ASSET_PIVOTS,
    COLOR_FRONT_POINT,
    COLOR_REAR_POINT,
    SCALE
} from '../constants.js';
import { BaseHumanRenderer } from './baseHumanRenderer.js';
import { computeDriverPose } from '../driver/poseSolver.js';

export class HumanFigureRenderer extends BaseHumanRenderer {
    constructor(options) {
        super({
            ...options,
            anchorClass: 'driver-anchor',
            layerName: 'driver'
        });

        this.elements = {
            bodyParent: document.querySelector('.bodyandhead-parent'),
            bodyIcon: document.querySelector('.bodyandhead-icon'),
            bigLegIcon: document.querySelector('.big-leg-icon'),
            smallLegIcon: document.querySelector('.small-leg-icon'),
            bigArmIcon: document.querySelector('.bigarm-icon'),
            smallArmIcon: document.querySelector('.small-arm-icon'),
            kneeMarker: document.querySelector('.knee'),
            heelMarker: document.querySelector('.heel'),
            bottomFootMarker: document.querySelector('.bottom-foot'),
            handMarker: document.querySelector('.hand-anchor')
        };

        // Define interaction mappings
        this.dragInteractionMap = {
            hPoint: ['hPointX', 'hPointHeight'],
            heel: 'hipPedalDistance',
            hand: ['handDistanceX', 'handHeight'],
            head: 'bodyReclineAngle'
        };

        this.createAnchorLayer('driver-anchor-layer');

        const anchors = [
            { key: 'hPoint', color: COLOR_FRONT_POINT },
            { key: 'heel', color: COLOR_REAR_POINT },
            { key: 'hand', color: COLOR_FRONT_POINT },
            { key: 'head', color: COLOR_FRONT_POINT }
        ];
        anchors.forEach(config => this.createAnchor(config));

        this.latestDriverGeometry = null;

        this.resizeObserver = new ResizeObserver(() => this.update());
        this.resizeObserver.observe(this.canvasArea);
    }

    update() {
        const state = this.stateManager.getState();
        const { bodyParent } = this.elements;
        const driverLayerActive = this.layerController?.isActive('driver') ?? false;
        const passengerLayerActive = this.layerController?.isActive('passenger') ?? false;

        // Opacity Logic
        if (passengerLayerActive) {
            bodyParent.style.opacity = '0.6';
        } else {
            bodyParent.style.opacity = driverLayerActive ? '1' : '0.6';
        }

        const pose = computeDriverPose(state);
        const canRender = Boolean(bodyParent && state.showMannequin && pose);

        this.setAnchorsVisible(driverLayerActive && canRender);

        if (!bodyParent) return;
        if (!canRender) {
            bodyParent.style.display = 'none';
            if (!state.showMannequin) {
                this.cancelDrag();
            }
            this.stateManager.runtime = this.stateManager.runtime || {};
            this.stateManager.runtime.headPosition = null;
            this.latestDriverGeometry = null;
            return;
        }

        bodyParent.style.display = 'block';
        bodyParent.classList.toggle('show-driver-anchors', driverLayerActive);

        // Coordinate System Update
        this.coordinateSystem.update();
        const svgScale = this.coordinateSystem.svgUnitScale || 1;
        const zoom = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const finalContainerScale = (pose.globalScale * svgScale) / zoom;

        // Use Coordinate System for Positioning
        // Note: computeDriverPose returns World Coords (SVG px essentially)
        const hipScreen = this.coordinateSystem.worldToOverlay(pose.hip.x, pose.hip.y);

        if (!hipScreen) return;

        // We need HIP_ASSET_POSITION. 
        // BaseRenderer doesn't know about it unless CoordinateSystem exposes it or we pass it.
        // CoordinateSystem has it.
        const hipAsset = this.coordinateSystem.hipAssetPosition;

        const containerTx = hipScreen.x - (hipAsset.x * finalContainerScale);
        const containerTy = hipScreen.y - (hipAsset.y * finalContainerScale);

        bodyParent.style.transformOrigin = 'top left';
        bodyParent.style.transform = `translate(${containerTx}px, ${containerTy}px) scale(${finalContainerScale})`;

        this.syncBodyReclineAngle(state, pose);
        this.applyLowerBodyPose(pose);
        this.applyUpperBodyPose(pose);
        this.updateMarkers(pose);
        this.updateDriverAnchors(driverLayerActive && canRender, pose);

        this.stateManager.runtime = this.stateManager.runtime || {};
        this.stateManager.runtime.headPosition = pose.head;

        this.latestDriverGeometry = {
            frontWheelX: pose.frontWheelX,
            floorY: pose.floorY,
            hipX: pose.hip.x,
            hipY: pose.hip.y
        };
    }

    syncBodyReclineAngle(state, pose) {
        if (
            pose.actualBodyReclineAngle == null ||
            pose.actualBodyReclineAngle === state.bodyReclineAngle
        ) {
            return;
        }
        this.stateManager.setState({ bodyReclineAngle: pose.actualBodyReclineAngle }, { silent: true });
        // Update display text manually if needed or rely on state updates
        // Original code updated textContent/input value directly. 
        // We'll trust stateManager to handle UI if silent is true? 
        // silent=true means listeners NOT fired.
        // Original code: updated display.textContent and input.value manually.

        const display = this.stateManager.displays?.bodyReclineAngle;
        if (display) display.textContent = `${pose.actualBodyReclineAngle}°`;

        const input = this.stateManager.inputs?.bodyReclineAngle;
        if (input && document.activeElement !== input) {
            input.value = pose.actualBodyReclineAngle;
        }
    }

    updateDriverAnchors(shouldShow, pose) {
        if (!shouldShow) return;
        this.updateAnchorPosition('hPoint', pose.hip.x, pose.hip.y);
        this.updateAnchorPosition('heel', pose.heel.x, pose.heel.y);
        this.updateAnchorPosition('hand', pose.hand.x, pose.hand.y);
        this.updateAnchorPosition('head', pose.head.x, pose.head.y);
    }

    // Override Base Hooks
    onDrag(key, svgCoords) {
        switch (key) {
            case 'hPoint': this.updateHipFromDrag(svgCoords); break;
            case 'heel': this.updateHeelFromDrag(svgCoords); break;
            case 'hand': this.updateHandFromDrag(svgCoords); break;
            case 'head': this.updateHeadFromDrag(svgCoords); break;
        }
    }

    applyInputUpdates(updates) {
        if (!updates || typeof updates !== 'object') return;
        const state = this.stateManager.getState();

        Object.entries(updates).forEach(([stateKey, value]) => {
            let effectiveMin = -Infinity;
            let effectiveMax = Infinity;

            const adjuster = document.querySelector(`.smart-adjuster[data-param="${stateKey}"]`);
            if (adjuster) {
                const minVal = parseFloat(adjuster.dataset.min);
                const maxVal = parseFloat(adjuster.dataset.max);
                if (Number.isFinite(minVal)) effectiveMin = minVal;
                if (Number.isFinite(maxVal)) effectiveMax = maxVal;
            }

            const clampedValue = Math.max(effectiveMin, Math.min(effectiveMax, value));
            if (Number.isFinite(clampedValue) && state[stateKey] !== clampedValue) {
                this.stateManager.setState({ [stateKey]: clampedValue });
            }
        });
    }

    ensureDriverGeometry() {
        if (this.latestDriverGeometry) return this.latestDriverGeometry;
        const state = this.stateManager.getState();
        const pose = computeDriverPose(state);
        if (!pose) return null;
        this.latestDriverGeometry = {
            frontWheelX: pose.frontWheelX,
            floorY: pose.floorY,
            hipX: pose.hip.x,
            hipY: pose.hip.y
        };
        return this.latestDriverGeometry;
    }

    updateHipFromDrag(svgCoords) {
        const geometry = this.ensureDriverGeometry();
        if (!geometry) return;
        const { frontWheelX, floorY } = geometry;
        const newOffsetX = Math.round((svgCoords.x - frontWheelX) / SCALE);
        const newHeight = Math.round((floorY - svgCoords.y) / SCALE);
        this.applyInputUpdates({
            hPointX: newOffsetX,
            hPointHeight: newHeight
        });
    }

    updateHeelFromDrag(svgCoords) {
        const geometry = this.ensureDriverGeometry();
        if (!geometry) return;
        const { hipX } = geometry;
        const clampedHeelX = Math.min(svgCoords.x, hipX);
        const newDistance = Math.round((hipX - clampedHeelX) / SCALE);
        this.applyInputUpdates({ hipPedalDistance: newDistance });
    }

    updateHandFromDrag(svgCoords) {
        const geometry = this.ensureDriverGeometry();
        if (!geometry) return;
        const { hipX, hipY } = geometry;
        const newDistanceX = Math.round((hipX - svgCoords.x) / SCALE);
        const newHeight = Math.round((hipY - svgCoords.y) / SCALE);
        this.applyInputUpdates({
            handDistanceX: newDistanceX,
            handHeight: newHeight
        });
    }

    updateHeadFromDrag(svgCoords) {
        const geometry = this.ensureDriverGeometry();
        if (!geometry) return;
        const { hipX, hipY } = geometry;
        const dx = svgCoords.x - hipX;
        const dy = hipY - svgCoords.y;
        const safeDy = Math.abs(dy) < 0.0001 ? 0.0001 * Math.sign(dy || 1) : dy;
        const angleRad = Math.atan2(dx, safeDy);
        const angleDeg = Math.round(angleRad * 180 / Math.PI);
        this.applyInputUpdates({ bodyReclineAngle: angleDeg });
    }

    applyLowerBodyPose(pose) {
        const { bigLegIcon, smallLegIcon } = this.elements;

        if (bigLegIcon) {
            // BigLeg is in global container space (0,0), so use Global Asset Coords.
            const hipAsset = this.coordinateSystem.worldToAsset(pose.hip, pose);
            if (hipAsset) {
                // Do NOT convert to local (which subtracts offset). Use global directly.
                bigLegIcon.style.left = `${hipAsset.x - ASSET_PIVOTS.bigLeg.x}px`;
                bigLegIcon.style.top = `${hipAsset.y - ASSET_PIVOTS.bigLeg.y}px`;
            }

            bigLegIcon.style.transformOrigin = `${ASSET_PIVOTS.bigLeg.x}px ${ASSET_PIVOTS.bigLeg.y}px`;
            bigLegIcon.style.transform = `rotate(${pose.thighRotationDeg}deg)`;
        }

        if (smallLegIcon) {
            const kneeAsset = this.coordinateSystem.worldToAsset(pose.knee, pose);
            if (kneeAsset) {
                // Do NOT convert to local. Use global directly.
                smallLegIcon.style.left = `${kneeAsset.x - ASSET_PIVOTS.smallLeg.x}px`;
                smallLegIcon.style.top = `${kneeAsset.y - ASSET_PIVOTS.smallLeg.y}px`;
                smallLegIcon.style.transformOrigin = `${ASSET_PIVOTS.smallLeg.x}px ${ASSET_PIVOTS.smallLeg.y}px`;
                smallLegIcon.style.transform = `rotate(${pose.shinRotationDeg}deg) scale(${pose.shinScale || 1})`;
            }
        }
    }

    applyUpperBodyPose(pose) {
        const { bodyIcon, bigArmIcon, smallArmIcon } = this.elements;
        if (bodyIcon) {
            bodyIcon.style.transformOrigin = `${ASSET_PIVOTS.body.x}px ${ASSET_PIVOTS.body.y}px`;
            bodyIcon.style.transform = `rotate(${pose.torsoRotationDeg || 0}deg)`;
        }

        const shoulderAsset = this.coordinateSystem.worldToAsset(pose.shoulder, pose);
        if (bigArmIcon && shoulderAsset) {
            // Use global coordinates
            bigArmIcon.style.left = `${shoulderAsset.x - ASSET_PIVOTS.bigArm.x}px`;
            bigArmIcon.style.top = `${shoulderAsset.y - ASSET_PIVOTS.bigArm.y}px`;
            bigArmIcon.style.transformOrigin = `${ASSET_PIVOTS.bigArm.x}px ${ASSET_PIVOTS.bigArm.y}px`;
            bigArmIcon.style.transform = `rotate(${pose.armRotations?.upperDeg ?? 0}deg)`;
        }

        const elbowAsset = this.coordinateSystem.worldToAsset(pose.elbow, pose);
        if (smallArmIcon && elbowAsset) {
            // Use global coordinates
            smallArmIcon.style.left = `${elbowAsset.x - ASSET_PIVOTS.smallArm.x}px`;
            smallArmIcon.style.top = `${elbowAsset.y - ASSET_PIVOTS.smallArm.y}px`;
            smallArmIcon.style.transformOrigin = `${ASSET_PIVOTS.smallArm.x}px ${ASSET_PIVOTS.smallArm.y}px`;
            smallArmIcon.style.transform = `rotate(${pose.armRotations?.forearmDeg ?? 0}deg)`;
        }
    }

    updateMarkers(pose) {
        // Helper
        const update = (marker, point, rot) => {
            if (!marker || !point) return;
            const assetPt = this.coordinateSystem.worldToAsset(point, pose);
            const local = this.coordinateSystem.assetToLocal(assetPt);
            if (local) {
                marker.style.left = `${local.x}px`;
                marker.style.top = `${local.y}px`;
                if (rot !== undefined) marker.style.transform = `rotate(${rot}deg)`;
            }
        };

        update(this.elements.kneeMarker, pose.knee);
        update(this.elements.heelMarker, pose.heel, pose.shinRotationDeg);
        update(this.elements.bottomFootMarker, pose.bottomFoot);
        update(this.elements.handMarker, pose.hand);
    }
}


