import {
    ASSET_COORDS,
    ASSET_PIVOTS,
    CENTER_X,
    COLOR_FRONT_POINT,
    COLOR_REAR_POINT,
    DOT_RADIUS,
    GROUND_Y,
    SCALE
} from '../constants.js';

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
        const showDriverAnchors = driverLayerActive && state.showMannequin;
        this.setDriverAnchorsVisible(showDriverAnchors);
        if (!bodyParent || !state.showMannequin) {
            if (bodyParent) bodyParent.style.display = 'none';
            if (!state.showMannequin) {
                this.cancelDriverAnchorDrag();
            }
            return;
        }
        bodyParent.style.display = 'block';
        bodyParent.classList.toggle('show-driver-anchors', showDriverAnchors);

        const containerWidth = this.canvasArea.clientWidth;
        const containerHeight = this.canvasArea.clientHeight;
        const transformInfo = this.getSvgTransformInfo();
        if (!transformInfo) return;
        this.svgTransformInfo = transformInfo;
        const svgScale = this.getSvgUnitScale(transformInfo.ctm);

        const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
        const groundClearancePx = state.groundClearance * SCALE;
        const floorThicknessPx = state.floorThickness * SCALE;
        const wheelBasePx = state.wheelBase * SCALE;

        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const chassisBottomY = GROUND_Y - groundClearancePx;
        const floorY = chassisBottomY - floorThicknessPx;

        const hPointXPx = state.hPointX * SCALE;
        const hHeightPx = state.hPointHeight * SCALE;

        const targetHipX = frontWheelX + hPointXPx;
        const targetHipY = floorY - hHeightPx;

        const hipPedalDistPx = state.hipPedalDistance * SCALE;
        const targetHeelXIdeal = targetHipX - hipPedalDistPx;
        const targetHeelY = floorY;

        const heightPx = state.mannequinHeight * 10 * SCALE;
        const thighLen = heightPx * 0.245;
        const shinLen = heightPx * 0.246;

        const maxLegReach = (thighLen + shinLen) * 0.999;
        const minLegReach = Math.abs(thighLen - shinLen) * 1.001;
        const dyLeg = Math.abs(targetHeelY - targetHipY);
        let dxLeg = targetHipX - targetHeelXIdeal;
        const currentDistLeg = Math.sqrt(dxLeg * dxLeg + dyLeg * dyLeg);

        if (dyLeg > maxLegReach) {
            dxLeg = 0;
        } else if (currentDistLeg > maxLegReach) {
            dxLeg = Math.sqrt(maxLegReach * maxLegReach - dyLeg * dyLeg);
        } else if (currentDistLeg < minLegReach && dyLeg < minLegReach) {
            dxLeg = Math.sqrt(minLegReach * minLegReach - dyLeg * dyLeg);
        }

        const finalHeelX = targetHipX - dxLeg;
        const distHipHeel = Math.sqrt(Math.pow(targetHipX - finalHeelX, 2) + Math.pow(targetHipY - targetHeelY, 2));

        const baseAngle = Math.atan2(targetHeelY - targetHipY, finalHeelX - targetHipX);
        const alpha = Math.acos((Math.pow(thighLen, 2) + Math.pow(distHipHeel, 2) - Math.pow(shinLen, 2)) / (2 * thighLen * distHipHeel));
        const targetThighAngle = baseAngle + alpha;

        const finalKneeX = targetHipX + thighLen * Math.cos(targetThighAngle);
        const finalKneeY = targetHipY + thighLen * Math.sin(targetThighAngle);
        const newShinAngle = Math.atan2(targetHeelY - finalKneeY, finalHeelX - finalKneeX);

        const defaultThighVec = { x: ASSET_COORDS.knee.x - ASSET_COORDS.hip.x, y: ASSET_COORDS.knee.y - ASSET_COORDS.hip.y };
        const defaultShinVec = { x: ASSET_COORDS.heel.x - ASSET_COORDS.knee.x, y: ASSET_COORDS.heel.y - ASSET_COORDS.knee.y };
        const defaultThighAngle = Math.atan2(defaultThighVec.y, defaultThighVec.x);
        const defaultShinAngle = Math.atan2(defaultShinVec.y, defaultShinVec.x);

        const rotThighDeg = (targetThighAngle - defaultThighAngle) * 180 / Math.PI;
        const rotShinDeg = (newShinAngle - defaultShinAngle) * 180 / Math.PI;

        const assetThighLen = Math.sqrt(Math.pow(defaultThighVec.x, 2) + Math.pow(defaultThighVec.y, 2));
        const globalScale = thighLen / assetThighLen;
        const zoom = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const finalContainerScale = (globalScale * svgScale) / zoom;

        const assetShinLen = Math.sqrt(Math.pow(defaultShinVec.x, 2) + Math.pow(defaultShinVec.y, 2));
        const extraShinScale = shinLen / (assetShinLen * globalScale);

        const assetHipGlobalX = ASSET_COORDS.parentOffset.x + ASSET_COORDS.hip.x;
        const assetHipGlobalY = ASSET_COORDS.parentOffset.y + ASSET_COORDS.hip.y;

        const newKneeXAsset = assetHipGlobalX + assetThighLen * Math.cos(targetThighAngle);
        const newKneeYAsset = assetHipGlobalY + assetThighLen * Math.sin(targetThighAngle);
        const effectiveAssetShinLen = assetShinLen * extraShinScale;
        const newHeelXAsset = newKneeXAsset + effectiveAssetShinLen * Math.cos(newShinAngle);
        const newHeelYAsset = newKneeYAsset + effectiveAssetShinLen * Math.sin(newShinAngle);

        const hipScreen = this.worldToCanvasPoint(targetHipX, targetHipY);
        if (!hipScreen) return;
        const screenHipX = hipScreen.x;
        const screenHipY = hipScreen.y;
        const containerTx = screenHipX - (assetHipGlobalX * finalContainerScale);
        const containerTy = screenHipY - (assetHipGlobalY * finalContainerScale);

        bodyParent.style.transformOrigin = 'top left';
        bodyParent.style.transform = `translate(${containerTx}px, ${containerTy}px) scale(${finalContainerScale})`;

        if (this.elements.bigLegIcon) {
            this.elements.bigLegIcon.style.transformOrigin = `${ASSET_PIVOTS.bigLeg.x}px ${ASSET_PIVOTS.bigLeg.y}px`;
            this.elements.bigLegIcon.style.transform = `rotate(${rotThighDeg}deg)`;
        }

        if (this.elements.smallLegIcon) {
            const oldKneeGlobalX = ASSET_COORDS.parentOffset.x + ASSET_COORDS.knee.x;
            const oldKneeGlobalY = ASSET_COORDS.parentOffset.y + ASSET_COORDS.knee.y;
            const dx = newKneeXAsset - oldKneeGlobalX;
            const dy = newKneeYAsset - oldKneeGlobalY;
            this.elements.smallLegIcon.style.transformOrigin = `${ASSET_PIVOTS.smallLeg.x}px ${ASSET_PIVOTS.smallLeg.y}px`;
            this.elements.smallLegIcon.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotShinDeg}deg) scale(${extraShinScale})`;
        }

        if (this.elements.kneeMarker) {
            this.elements.kneeMarker.style.left = `${newKneeXAsset - ASSET_COORDS.parentOffset.x}px`;
            this.elements.kneeMarker.style.top = `${newKneeYAsset - ASSET_COORDS.parentOffset.y}px`;
        }

        if (this.elements.heelMarker) {
            this.elements.heelMarker.style.left = `${newHeelXAsset - ASSET_COORDS.parentOffset.x}px`;
            this.elements.heelMarker.style.top = `${newHeelYAsset - ASSET_COORDS.parentOffset.y}px`;
            this.elements.heelMarker.style.transform = `rotate(${rotShinDeg}deg)`;
        }

        if (this.elements.bottomFootMarker) {
            const footVecX = 0 - ASSET_COORDS.knee.x;
            const footVecY = 793 - ASSET_COORDS.knee.y;
            const footLen = Math.sqrt(footVecX * footVecX + footVecY * footVecY);
            const footAngle = Math.atan2(footVecY, footVecX);
            const defaultShinAngleLocal = Math.atan2(defaultShinVec.y, defaultShinVec.x);
            const newFootAngle = footAngle + (newShinAngle - defaultShinAngleLocal);
            const effectiveFootLen = footLen * extraShinScale;
            const newFootXAsset = newKneeXAsset + effectiveFootLen * Math.cos(newFootAngle);
            const newFootYAsset = newKneeYAsset + effectiveFootLen * Math.sin(newFootAngle);
            this.elements.bottomFootMarker.style.left = `${newFootXAsset - ASSET_COORDS.parentOffset.x}px`;
            this.elements.bottomFootMarker.style.top = `${newFootYAsset - ASSET_COORDS.parentOffset.y}px`;
        }

        const handHeightPx = state.handHeight * SCALE;
        const handDistXPx = state.handDistanceX * SCALE;
        const targetHandX = targetHipX - handDistXPx;
        const targetHandY = targetHipY - handHeightPx;

        const vecUpperArm = { x: ASSET_COORDS.elbow.x - ASSET_COORDS.shoulder.x, y: ASSET_COORDS.elbow.y - ASSET_COORDS.shoulder.y };
        const lenUpperArm = Math.sqrt(vecUpperArm.x * vecUpperArm.x + vecUpperArm.y * vecUpperArm.y);
        const vecForearm = { x: ASSET_COORDS.hand.x - ASSET_COORDS.elbow.x, y: ASSET_COORDS.hand.y - ASSET_COORDS.elbow.y };
        const lenForearm = Math.sqrt(vecForearm.x * vecForearm.x + vecForearm.y * vecForearm.y);

        const shoulderGlobalXDefault = ASSET_COORDS.parentOffset.x + ASSET_COORDS.shoulder.x;
        const shoulderGlobalYDefault = ASSET_COORDS.parentOffset.y + ASSET_COORDS.shoulder.y;
        const vecTorso = { x: shoulderGlobalXDefault - assetHipGlobalX, y: shoulderGlobalYDefault - assetHipGlobalY };
        const lenTorso = Math.sqrt(vecTorso.x * vecTorso.x + vecTorso.y * vecTorso.y);
        const defaultTorsoAngleRad = Math.atan2(vecTorso.y, vecTorso.x);
        const defaultTorsoAngleFromVertRad = Math.atan2(vecTorso.x, -vecTorso.y);

        const deltaRotDeg = state.bodyReclineAngle - (defaultTorsoAngleFromVertRad * 180 / Math.PI);
        const deltaRotRad = deltaRotDeg * Math.PI / 180;

        const maxReachArm = (lenUpperArm + lenForearm) * 0.999;
        const currentTorsoAngleRad = defaultTorsoAngleRad + deltaRotRad;
        let shoulderXAsset = assetHipGlobalX + lenTorso * Math.cos(currentTorsoAngleRad);
        let shoulderYAsset = assetHipGlobalY + lenTorso * Math.sin(currentTorsoAngleRad);

        const simpleScale = thighLen / Math.sqrt(Math.pow(ASSET_COORDS.knee.x - ASSET_COORDS.hip.x, 2) + Math.pow(ASSET_COORDS.knee.y - ASSET_COORDS.hip.y, 2));
        const deltaHandXSvg = targetHandX - targetHipX;
        const deltaHandYSvg = targetHandY - targetHipY;
        const targetHandXAsset = assetHipGlobalX + deltaHandXSvg / simpleScale;
        const targetHandYAsset = assetHipGlobalY + deltaHandYSvg / simpleScale;

        const distShoulderHand = Math.sqrt(Math.pow(targetHandXAsset - shoulderXAsset, 2) + Math.pow(targetHandYAsset - shoulderYAsset, 2));
        let clampedDeltaRotDeg = deltaRotDeg;

        if (distShoulderHand > maxReachArm) {
            const distHipHand = Math.sqrt(Math.pow(targetHandXAsset - assetHipGlobalX, 2) + Math.pow(targetHandYAsset - assetHipGlobalY, 2));
            const cosAngle = (Math.pow(lenTorso, 2) + Math.pow(distHipHand, 2) - Math.pow(maxReachArm, 2)) / (2 * lenTorso * distHipHand);
            const angleFromHipHand = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
            const angleHipHand = Math.atan2(targetHandYAsset - assetHipGlobalY, targetHandXAsset - assetHipGlobalX);
            const sol1 = angleHipHand + angleFromHipHand;
            const sol2 = angleHipHand - angleFromHipHand;
            const diff1 = Math.abs(Math.atan2(Math.sin(sol1 - currentTorsoAngleRad), Math.cos(sol1 - currentTorsoAngleRad)));
            const diff2 = Math.abs(Math.atan2(Math.sin(sol2 - currentTorsoAngleRad), Math.cos(sol2 - currentTorsoAngleRad)));
            const bestSol = (diff1 < diff2) ? sol1 : sol2;
            shoulderXAsset = assetHipGlobalX + lenTorso * Math.cos(bestSol);
            shoulderYAsset = assetHipGlobalY + lenTorso * Math.sin(bestSol);
            clampedDeltaRotDeg = (bestSol - defaultTorsoAngleRad) * 180 / Math.PI;
        }

        const defaultBodyAngleFromVert = defaultTorsoAngleFromVertRad * 180 / Math.PI;
        const actualBodyReclineAngle = Math.round(defaultBodyAngleFromVert + clampedDeltaRotDeg);
        if (actualBodyReclineAngle !== state.bodyReclineAngle) {
            this.stateManager.setState({ bodyReclineAngle: actualBodyReclineAngle }, { silent: true });
            const display = this.stateManager.displays?.bodyReclineAngle;
            if (display) {
                display.textContent = `${actualBodyReclineAngle}°`;
            }
            if (document.activeElement !== this.stateManager.inputs.bodyReclineAngle) {
                this.stateManager.inputs.bodyReclineAngle.value = actualBodyReclineAngle;
            }
        }

        const finalDistShoulderHand = Math.sqrt(Math.pow(targetHandXAsset - shoulderXAsset, 2) + Math.pow(targetHandYAsset - shoulderYAsset, 2));
        const minReachArm = Math.abs(lenUpperArm - lenForearm) * 1.001;
        let finalHandXAsset = targetHandXAsset;
        let finalHandYAsset = targetHandYAsset;

        if (finalDistShoulderHand < minReachArm) {
            const angle = Math.atan2(targetHandYAsset - shoulderYAsset, targetHandXAsset - shoulderXAsset);
            finalHandXAsset = shoulderXAsset + minReachArm * Math.cos(angle);
            finalHandYAsset = shoulderYAsset + minReachArm * Math.sin(angle);
        }

        const distForIK = Math.max(minReachArm, Math.min(maxReachArm, finalDistShoulderHand));
        const cosAlpha = (Math.pow(lenUpperArm, 2) + Math.pow(distForIK, 2) - Math.pow(lenForearm, 2)) / (2 * lenUpperArm * distForIK);
        const alphaArm = Math.acos(Math.min(Math.max(cosAlpha, -1), 1));
        const angleShoulderHand = Math.atan2(finalHandYAsset - shoulderYAsset, finalHandXAsset - shoulderXAsset);
        const angleUpperArm = angleShoulderHand - alphaArm;

        const elbowXAsset = shoulderXAsset + lenUpperArm * Math.cos(angleUpperArm);
        const elbowYAsset = shoulderYAsset + lenUpperArm * Math.sin(angleUpperArm);

        if (this.elements.bodyIcon) {
            this.elements.bodyIcon.style.transformOrigin = `${ASSET_PIVOTS.body.x}px ${ASSET_PIVOTS.body.y}px`;
            this.elements.bodyIcon.style.transform = `rotate(${clampedDeltaRotDeg}deg)`;
        }

        if (this.elements.bigArmIcon) {
            const targetLeft = shoulderXAsset - ASSET_PIVOTS.bigArm.x;
            const targetTop = shoulderYAsset - ASSET_PIVOTS.bigArm.y;
            const defaultUpperArmAngle = Math.atan2(vecUpperArm.y, vecUpperArm.x);
            const rotUpperArmDeg = (angleUpperArm - defaultUpperArmAngle) * 180 / Math.PI;
            this.elements.bigArmIcon.style.left = `${targetLeft}px`;
            this.elements.bigArmIcon.style.top = `${targetTop}px`;
            this.elements.bigArmIcon.style.transformOrigin = `${ASSET_PIVOTS.bigArm.x}px ${ASSET_PIVOTS.bigArm.y}px`;
            this.elements.bigArmIcon.style.transform = `rotate(${rotUpperArmDeg}deg)`;
        }

        if (this.elements.smallArmIcon) {
            const targetLeft = elbowXAsset - ASSET_PIVOTS.smallArm.x;
            const targetTop = elbowYAsset - ASSET_PIVOTS.smallArm.y;
            const angleForearm = Math.atan2(finalHandYAsset - elbowYAsset, finalHandXAsset - elbowXAsset);
            const defaultForearmAngle = Math.atan2(vecForearm.y, vecForearm.x);
            const rotForearmDeg = (angleForearm - defaultForearmAngle) * 180 / Math.PI;
            this.elements.smallArmIcon.style.left = `${targetLeft}px`;
            this.elements.smallArmIcon.style.top = `${targetTop}px`;
            this.elements.smallArmIcon.style.transformOrigin = `${ASSET_PIVOTS.smallArm.x}px ${ASSET_PIVOTS.smallArm.y}px`;
            this.elements.smallArmIcon.style.transform = `rotate(${rotForearmDeg}deg)`;
        }

        if (this.elements.handMarker) {
            this.elements.handMarker.style.left = `${finalHandXAsset - ASSET_COORDS.parentOffset.x}px`;
            this.elements.handMarker.style.top = `${finalHandYAsset - ASSET_COORDS.parentOffset.y}px`;
        }

        const headVecDefault = {
            x: ASSET_COORDS.head.x - ASSET_COORDS.hip.x,
            y: ASSET_COORDS.head.y - ASSET_COORDS.hip.y
        };
        const headRotationRad = clampedDeltaRotDeg * Math.PI / 180;
        const rotatedHeadVec = this.rotateVector(headVecDefault, headRotationRad);
        const headWorldX = targetHipX + rotatedHeadVec.x * globalScale;
        const headWorldY = targetHipY + rotatedHeadVec.y * globalScale;
        const handWorldX = targetHipX + (finalHandXAsset - assetHipGlobalX) * globalScale;
        const handWorldY = targetHipY + (finalHandYAsset - assetHipGlobalY) * globalScale;

        const driverGeometry = {
            frontWheelX,
            floorY,
            hipX: targetHipX,
            hipY: targetHipY
        };
        this.latestDriverGeometry = driverGeometry;

        if (showDriverAnchors) {
            this.updateDriverAnchorPosition('hPoint', targetHipX, targetHipY);
            this.updateDriverAnchorPosition('heel', finalHeelX, targetHeelY);
            this.updateDriverAnchorPosition('hand', handWorldX, handWorldY);
            this.updateDriverAnchorPosition('head', headWorldX, headWorldY);
        }
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

