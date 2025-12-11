import {
    ASSET_COORDS,
    ASSET_PIVOTS,
    COLOR_FRONT_POINT,
    COLOR_REAR_POINT,
    DOT_RADIUS,
    SCALE
} from '../constants.js';
import { computeDriverPose } from '../driver/poseSolver.js';

const HIP_ASSET_POSITION = {
    x: ASSET_COORDS.parentOffset.x + ASSET_COORDS.hip.x,
    y: ASSET_COORDS.parentOffset.y + ASSET_COORDS.hip.y
};

export class HumanFigureRenderer {
    constructor({ canvasArea, canvasContent = null, svg, stateManager, layerController = null }) {
        this.canvasArea = canvasArea;
        this.canvasContent = canvasContent || canvasArea;
        this.svg = svg;
        this.stateManager = stateManager;
        this.layerController = layerController;
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

        this.latestDriverGeometry = null;
        this.driverAnchorLayer = document.createElement('div');
        this.driverAnchorLayer.className = 'driver-anchor-layer';
        this.driverAnchorLayer.style.display = 'none';
        this.canvasContent.appendChild(this.driverAnchorLayer);
        this.driverAnchors = new Map();
        this.driverAnchorConfigs = [
            { key: 'hPoint', color: COLOR_FRONT_POINT },
            { key: 'heel', color: COLOR_REAR_POINT },
            { key: 'hand', color: COLOR_FRONT_POINT },
            { key: 'head', color: COLOR_FRONT_POINT }
        ];
        this.driverAnchorConfigs.forEach((config) => this.createDriverAnchor(config));
        this.draggingDriverAnchor = null;
        this.hoveredDriverAnchor = null;

        this.handleDriverMouseMove = (event) => this.onDriverMouseMove(event);
        this.handleDriverMouseUp = () => this.onDriverMouseUp();
        window.addEventListener('mousemove', this.handleDriverMouseMove);
        window.addEventListener('mouseup', this.handleDriverMouseUp);

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
            if (driverLayerActive) {
                bodyParent.style.opacity = '1';
            } else {
                bodyParent.style.opacity = '0.6';
            }
        }

        const pose = computeDriverPose(state);
        const canRender = Boolean(bodyParent && state.showMannequin && pose);

        this.setDriverAnchorsVisible(driverLayerActive && canRender);

        if (!bodyParent) return;
        if (!canRender) {
            bodyParent.style.display = 'none';
            if (!state.showMannequin) {
                this.cancelDriverAnchorDrag();
            }
            this.stateManager.runtime = this.stateManager.runtime || {};
            this.stateManager.runtime.headPosition = null;
            this.latestDriverGeometry = null;
            return;
        }

        bodyParent.style.display = 'block';
        bodyParent.classList.toggle('show-driver-anchors', driverLayerActive);

        const transformInfo = this.getSvgTransformInfo();
        if (!transformInfo) return;
        this.svgTransformInfo = transformInfo;
        const svgScale = this.getSvgUnitScale(transformInfo.ctm);
        const zoom = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const finalContainerScale = (pose.globalScale * svgScale) / zoom;
        const hipScreen = this.worldToCanvasPoint(pose.hip.x, pose.hip.y);
        if (!hipScreen) return;

        const containerTx = hipScreen.x - (HIP_ASSET_POSITION.x * finalContainerScale);
        const containerTy = hipScreen.y - (HIP_ASSET_POSITION.y * finalContainerScale);
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
        const display = this.stateManager.displays?.bodyReclineAngle;
        if (display) {
            display.textContent = `${pose.actualBodyReclineAngle}°`;
        }
        const input = this.stateManager.inputs?.bodyReclineAngle;
        if (input && document.activeElement !== input) {
            input.value = pose.actualBodyReclineAngle;
        }
    }

    applyLowerBodyPose(pose) {
        const { bigLegIcon, smallLegIcon } = this.elements;
        if (bigLegIcon) {
            bigLegIcon.style.transformOrigin = `${ASSET_PIVOTS.bigLeg.x}px ${ASSET_PIVOTS.bigLeg.y}px`;
            bigLegIcon.style.transform = `rotate(${pose.thighRotationDeg}deg)`;
        }

        if (smallLegIcon) {
            const kneeAsset = this.worldToAssetPoint(pose.knee, pose);
            if (kneeAsset) {
                const dx = kneeAsset.x - (ASSET_COORDS.parentOffset.x + ASSET_COORDS.knee.x);
                const dy = kneeAsset.y - (ASSET_COORDS.parentOffset.y + ASSET_COORDS.knee.y);
                smallLegIcon.style.transformOrigin = `${ASSET_PIVOTS.smallLeg.x}px ${ASSET_PIVOTS.smallLeg.y}px`;
                smallLegIcon.style.transform = `translate(${dx}px, ${dy}px) rotate(${pose.shinRotationDeg}deg) scale(${pose.shinScale || 1})`;
            }
        }
    }

    applyUpperBodyPose(pose) {
        const { bodyIcon, bigArmIcon, smallArmIcon } = this.elements;
        if (bodyIcon) {
            bodyIcon.style.transformOrigin = `${ASSET_PIVOTS.body.x}px ${ASSET_PIVOTS.body.y}px`;
            bodyIcon.style.transform = `rotate(${pose.torsoRotationDeg || 0}deg)`;
        }

        const shoulderAsset = this.worldToAssetPoint(pose.shoulder, pose);
        if (bigArmIcon && shoulderAsset) {
            bigArmIcon.style.left = `${shoulderAsset.x - ASSET_PIVOTS.bigArm.x}px`;
            bigArmIcon.style.top = `${shoulderAsset.y - ASSET_PIVOTS.bigArm.y}px`;
            bigArmIcon.style.transformOrigin = `${ASSET_PIVOTS.bigArm.x}px ${ASSET_PIVOTS.bigArm.y}px`;
            bigArmIcon.style.transform = `rotate(${pose.armRotations?.upperDeg ?? 0}deg)`;
        }

        const elbowAsset = this.worldToAssetPoint(pose.elbow, pose);
        if (smallArmIcon && elbowAsset) {
            smallArmIcon.style.left = `${elbowAsset.x - ASSET_PIVOTS.smallArm.x}px`;
            smallArmIcon.style.top = `${elbowAsset.y - ASSET_PIVOTS.smallArm.y}px`;
            smallArmIcon.style.transformOrigin = `${ASSET_PIVOTS.smallArm.x}px ${ASSET_PIVOTS.smallArm.y}px`;
            smallArmIcon.style.transform = `rotate(${pose.armRotations?.forearmDeg ?? 0}deg)`;
        }
    }

    updateMarkers(pose) {
        const kneeLocal = this.assetToLocal(this.worldToAssetPoint(pose.knee, pose));
        if (kneeLocal && this.elements.kneeMarker) {
            this.elements.kneeMarker.style.left = `${kneeLocal.x}px`;
            this.elements.kneeMarker.style.top = `${kneeLocal.y}px`;
        }

        const heelLocal = this.assetToLocal(this.worldToAssetPoint(pose.heel, pose));
        if (heelLocal && this.elements.heelMarker) {
            this.elements.heelMarker.style.left = `${heelLocal.x}px`;
            this.elements.heelMarker.style.top = `${heelLocal.y}px`;
            this.elements.heelMarker.style.transform = `rotate(${pose.shinRotationDeg}deg)`;
        }

        const bottomFootLocal = this.assetToLocal(this.worldToAssetPoint(pose.bottomFoot, pose));
        if (bottomFootLocal && this.elements.bottomFootMarker) {
            this.elements.bottomFootMarker.style.left = `${bottomFootLocal.x}px`;
            this.elements.bottomFootMarker.style.top = `${bottomFootLocal.y}px`;
        }

        const handLocal = this.assetToLocal(this.worldToAssetPoint(pose.hand, pose));
        if (handLocal && this.elements.handMarker) {
            this.elements.handMarker.style.left = `${handLocal.x}px`;
            this.elements.handMarker.style.top = `${handLocal.y}px`;
        }
    }

    updateDriverAnchors(shouldShow, pose) {
        if (!shouldShow) return;
        this.updateDriverAnchorPosition('hPoint', pose.hip.x, pose.hip.y);
        this.updateDriverAnchorPosition('heel', pose.heel.x, pose.heel.y);
        this.updateDriverAnchorPosition('hand', pose.hand.x, pose.hand.y);
        this.updateDriverAnchorPosition('head', pose.head.x, pose.head.y);
    }

    worldToAssetPoint(worldPoint, pose) {
        if (!worldPoint || !pose?.hip || !pose.globalScale) return null;
        return {
            x: HIP_ASSET_POSITION.x + ((worldPoint.x - pose.hip.x) / pose.globalScale),
            y: HIP_ASSET_POSITION.y + ((worldPoint.y - pose.hip.y) / pose.globalScale)
        };
    }

    assetToLocal(assetPoint) {
        if (!assetPoint) return null;
        return {
            x: assetPoint.x - ASSET_COORDS.parentOffset.x,
            y: assetPoint.y - ASSET_COORDS.parentOffset.y
        };
    }

    createDriverAnchor({ key, color }) {
        const anchor = document.createElement('div');
        anchor.className = 'driver-anchor';
        anchor.dataset.anchor = key;
        const diameter = DOT_RADIUS * 2;
        anchor.style.width = `${diameter}px`;
        anchor.style.height = `${diameter}px`;
        anchor.style.backgroundColor = color;
        anchor.addEventListener('mouseenter', () => this.onDriverAnchorHover(key));
        anchor.addEventListener('mouseleave', () => this.onDriverAnchorLeave(key));
        anchor.addEventListener('mousedown', (event) => this.onDriverAnchorMouseDown(key, event));
        this.driverAnchorLayer.appendChild(anchor);
        this.driverAnchors.set(key, anchor);
    }

    onDriverAnchorHover(key) {
        this.hoveredDriverAnchor = key;
        this.setDriverAnchorVisualState(key, true);
    }

    onDriverAnchorLeave(key) {
        if (this.draggingDriverAnchor === key) {
            return;
        }
        if (this.hoveredDriverAnchor === key) {
            this.hoveredDriverAnchor = null;
        }
        this.setDriverAnchorVisualState(key, false);
    }

    onDriverAnchorMouseDown(key, event) {
        if (!this.layerController?.isActive('driver')) return;
        const svgCoords = this.getSvgCoordsFromEvent(event);
        if (!svgCoords) return;
        this.draggingDriverAnchor = key;
        this.setDriverAnchorVisualState(key, true);

        let param = null;
        if (key === 'hPoint') param = ['hPointX', 'hPointHeight'];
        else if (key === 'heel') param = 'hipPedalDistance';
        else if (key === 'hand') param = ['handDistanceX', 'handHeight'];
        else if (key === 'head') param = 'bodyReclineAngle';
        if (param) this.stateManager.setInteraction(param);

        this.handleDriverAnchorDrag(key, svgCoords);
        event.preventDefault();
        event.stopPropagation();
    }

    onDriverMouseMove(event) {
        if (!this.draggingDriverAnchor) return;
        const svgCoords = this.getSvgCoordsFromEvent(event);
        if (!svgCoords) return;
        this.handleDriverAnchorDrag(this.draggingDriverAnchor, svgCoords);
    }

    onDriverMouseUp() {
        if (!this.draggingDriverAnchor) return;
        const key = this.draggingDriverAnchor;
        this.draggingDriverAnchor = null;
        if (this.hoveredDriverAnchor !== key) {
            this.setDriverAnchorVisualState(key, false);
        }
        this.stateManager.setInteraction(null);
    }

    cancelDriverAnchorDrag() {
        if (this.draggingDriverAnchor) {
            const key = this.draggingDriverAnchor;
            this.draggingDriverAnchor = null;
            this.setDriverAnchorVisualState(key, false);
        }
        this.hoveredDriverAnchor = null;
    }

    handleDriverAnchorDrag(key, svgCoords) {
        switch (key) {
            case 'hPoint':
                this.updateHipFromDrag(svgCoords);
                break;
            case 'heel':
                this.updateHeelFromDrag(svgCoords);
                break;
            case 'hand':
                this.updateHandFromDrag(svgCoords);
                break;
            case 'head':
                this.updateHeadFromDrag(svgCoords);
                break;
            default:
                break;
        }
    }

    setDriverAnchorsVisible(visible) {
        if (!this.driverAnchorLayer) return;
        this.driverAnchorLayer.style.display = visible ? 'block' : 'none';
        this.driverAnchorLayer.style.pointerEvents = visible ? 'auto' : 'none';
        this.driverAnchors.forEach((anchor) => {
            anchor.classList.toggle('is-visible', visible);
        });
        if (!visible) {
            this.cancelDriverAnchorDrag();
        }
    }

    setDriverAnchorVisualState(key, isActive) {
        const anchor = this.driverAnchors.get(key);
        if (!anchor) return;
        anchor.classList.toggle('is-active', isActive);
    }

    updateDriverAnchorPosition(key, worldX, worldY) {
        const anchor = this.driverAnchors.get(key);
        if (!anchor) return;
        const point = this.worldToCanvasPoint(worldX, worldY);
        if (!point) return;
        const screenX = point.x;
        const screenY = point.y;
        anchor.style.left = `${screenX}px`;
        anchor.style.top = `${screenY}px`;
    }

    getSvgCoordsFromEvent(event) {
        if (!this.svg) return null;
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return null;
        const pt = this.svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        return pt.matrixTransform(ctm.inverse());
    }

    clampToInputRange(value, input) {
        if (!input) return value;
        const min = Number.isFinite(parseFloat(input.min)) ? parseInt(input.min, 10) : -Infinity;
        const max = Number.isFinite(parseFloat(input.max)) ? parseInt(input.max, 10) : Infinity;
        if (Number.isNaN(min) && Number.isNaN(max)) {
            return value;
        }
        const effectiveMin = Number.isNaN(min) ? -Infinity : min;
        const effectiveMax = Number.isNaN(max) ? Infinity : max;
        return Math.max(effectiveMin, Math.min(effectiveMax, value));
    }

    applyDriverInputUpdates(updates) {
        if (!updates || typeof updates !== 'object') return;
        const inputs = this.stateManager.inputs;
        const state = this.stateManager.getState();
        let hasChange = false;
        Object.entries(updates).forEach(([stateKey, value]) => {
            const input = inputs[stateKey];
            const clampedValue = this.clampToInputRange(value, input);
            if (state[stateKey] !== clampedValue) {
                hasChange = true;
            }
            if (input) {
                input.value = clampedValue.toString();
            }
        });
        if (hasChange) {
            this.stateManager.updateFromInputs();
        }
    }

    updateHipFromDrag(svgCoords) {
        const geometry = this.latestDriverGeometry;
        if (!geometry) return;
        const { frontWheelX, floorY } = geometry;
        const newOffsetX = Math.round((svgCoords.x - frontWheelX) / SCALE);
        const newHeight = Math.round((floorY - svgCoords.y) / SCALE);
        this.applyDriverInputUpdates({
            hPointX: newOffsetX,
            hPointHeight: newHeight
        });
    }

    updateHeelFromDrag(svgCoords) {
        const geometry = this.latestDriverGeometry;
        if (!geometry) return;
        const { hipX } = geometry;
        const clampedHeelX = Math.min(svgCoords.x, hipX);
        const newDistance = Math.round((hipX - clampedHeelX) / SCALE);
        this.applyDriverInputUpdates({ hipPedalDistance: newDistance });
    }

    updateHandFromDrag(svgCoords) {
        const geometry = this.latestDriverGeometry;
        if (!geometry) return;
        const { hipX, hipY } = geometry;
        const newDistanceX = Math.round((hipX - svgCoords.x) / SCALE);
        const newHeight = Math.round((hipY - svgCoords.y) / SCALE);
        this.applyDriverInputUpdates({
            handDistanceX: newDistanceX,
            handHeight: newHeight
        });
    }

    updateHeadFromDrag(svgCoords) {
        const geometry = this.latestDriverGeometry;
        if (!geometry) return;
        const { hipX, hipY } = geometry;
        const dx = svgCoords.x - hipX;
        const dy = hipY - svgCoords.y;
        const safeDy = Math.abs(dy) < 0.0001 ? 0.0001 * Math.sign(dy || 1) : dy;
        const angleRad = Math.atan2(dx, safeDy);
        const angleDeg = Math.round(angleRad * 180 / Math.PI);
        this.applyDriverInputUpdates({ bodyReclineAngle: angleDeg });
    }

    rotateVector(vector, angleRad) {
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);
        return {
            x: vector.x * cos - vector.y * sin,
            y: vector.x * sin + vector.y * cos
        };
    }

    getSvgTransformInfo() {
        if (!this.svg) return null;
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return null;
        const rect = this.canvasArea.getBoundingClientRect();
        return { ctm, rect };
    }

    getSvgUnitScale(ctm) {
        const scaleX = Math.hypot(ctm.a, ctm.b);
        const scaleY = Math.hypot(ctm.c, ctm.d);
        return (scaleX + scaleY) / 2;
    }

    worldToScreenPoint(x, y, info = this.svgTransformInfo) {
        if (!info || !this.svg) return null;
        const pt = this.svg.createSVGPoint();
        pt.x = x;
        pt.y = y;
        const transformed = pt.matrixTransform(info.ctm);
        return {
            x: transformed.x,
            y: transformed.y
        };
    }

    worldToCanvasPoint(x, y, info = this.svgTransformInfo) {
        const screenPoint = this.worldToScreenPoint(x, y, info);
        if (!screenPoint) return null;
        return this.screenToOverlayLocal(screenPoint);
    }

    screenToOverlayLocal(point) {
        const rect = this.canvasArea.getBoundingClientRect();
        const zoom = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const offsetX = parseFloat(this.canvasArea.dataset.zoomOffsetX || '0');
        const offsetY = parseFloat(this.canvasArea.dataset.zoomOffsetY || '0');
        const relX = point.x - rect.left;
        const relY = point.y - rect.top;
        return {
            x: (relX - offsetX) / zoom,
            y: (relY - offsetY) / zoom
        };
    }

    destroy() {
        this.resizeObserver.disconnect();
        window.removeEventListener('mousemove', this.handleDriverMouseMove);
        window.removeEventListener('mouseup', this.handleDriverMouseUp);
        if (this.driverAnchorLayer && this.driverAnchorLayer.parentNode) {
            this.driverAnchorLayer.remove();
        }
    }
}

