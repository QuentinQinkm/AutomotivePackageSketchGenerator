import {
    ASSET_COORDS,
    ASSET_PIVOTS,
    CENTER_X,
    GROUND_Y,
    SCALE,
    COLOR_FRONT_POINT,
    COLOR_REAR_POINT,
    DOT_RADIUS
} from '../constants.js';

const HIP_ASSET_POSITION = {
    x: ASSET_COORDS.parentOffset.x + ASSET_COORDS.hip.x,
    y: ASSET_COORDS.parentOffset.y + ASSET_COORDS.hip.y
};

const LEG_LENGTH_RATIO = {
    thigh: 0.245,
    shin: 0.246
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


export class PassengerRenderer {
    constructor({ canvasArea, stateManager, layerController, svg }) {
        this.canvasArea = canvasArea;
        // Find canvas content - needed for appending anchor layer
        this.canvasContent = document.getElementById('canvasContent') || canvasArea;
        this.stateManager = stateManager;
        this.layerController = layerController;
        this.svg = svg;

        this.elements = {
            bodyParent: document.querySelector('.passenger-parent'),
            bodyIcon: document.querySelector('.passenger-parent .bodyandhead-icon'),
            bigLegIcon: document.querySelector('.passenger-parent .big-leg-icon'),
            smallLegIcon: document.querySelector('.passenger-parent .small-leg-icon'),
            // No arms
            kneeMarker: document.querySelector('.passenger-parent .knee'),
            heelMarker: document.querySelector('.passenger-parent .heel'),
            bottomFootMarker: document.querySelector('.passenger-parent .bottom-foot'),
            hipJoint: document.querySelector('.passenger-parent .hip-joint'),
            topHead: document.querySelector('.passenger-parent .top-head')
        };

        // Interaction Logic Setup
        this.latestPassengerPose = null;
        this.passengerAnchorLayer = document.createElement('div');
        this.passengerAnchorLayer.className = 'passenger-anchor-layer';
        this.passengerAnchorLayer.style.display = 'none';
        this.canvasContent.appendChild(this.passengerAnchorLayer);

        this.passengerAnchors = new Map();
        // Configs: Hip, Heel, Head
        this.anchorConfigs = [
            { key: 'hPoint', color: COLOR_FRONT_POINT },
            { key: 'heel', color: COLOR_REAR_POINT },
            { key: 'head', color: COLOR_FRONT_POINT }
        ];
        this.anchorConfigs.forEach(config => this.createAnchor(config));

        this.draggingAnchor = null;
        this.hoveredAnchor = null;

        this.handleMouseMove = (event) => this.onMouseMove(event);
        this.handleMouseUp = () => this.onMouseUp();
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);


        this.resizeObserver = new ResizeObserver(() => this.update());
        this.resizeObserver.observe(this.canvasArea);
    }

    update() {
        if (!this.elements.bodyParent) return;

        const state = this.stateManager.getState();
        const showPassenger = state.showLastRow;

        // Opacity Logic
        const driverLayerActive = this.layerController?.isActive('driver') ?? false;
        const passengerLayerActive = this.layerController?.isActive('passenger') ?? false;

        if (driverLayerActive) {
            this.elements.bodyParent.style.opacity = '0.6';
        } else if (passengerLayerActive) {
            this.elements.bodyParent.style.opacity = '1';
        } else {
            // Other sections active (Chassis, Profile, Image)
            this.elements.bodyParent.style.opacity = '0.6';
        }

        const pose = this.computePassengerPose(state);
        const canRender = Boolean(showPassenger && pose);

        // Update anchor visibility
        this.setAnchorsVisible(passengerLayerActive && canRender);

        if (!canRender) {
            this.elements.bodyParent.style.display = 'none';
            if (!showPassenger) {
                this.cancelDrag();
            }
            this.latestPassengerPose = null;
            return;
        }

        this.elements.bodyParent.style.display = 'block';
        // Add class to show markers if needed, or stick to anchors
        this.elements.bodyParent.classList.toggle('show-passenger-anchors', passengerLayerActive);

        this.latestPassengerPose = pose;

        // Apply Transform
        const svg = this.svg;
        const transformInfo = this.getSvgTransformInfo(svg);
        if (!transformInfo) return;

        const svgScale = this.getSvgUnitScale(transformInfo.ctm);
        const zoom = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const finalContainerScale = (pose.globalScale * svgScale) / zoom;

        const hipScreen = this.worldToCanvasPoint(pose.hip.x, pose.hip.y, svg, transformInfo);

        if (hipScreen) {
            const containerTx = hipScreen.x - (HIP_ASSET_POSITION.x * finalContainerScale);
            const containerTy = hipScreen.y - (HIP_ASSET_POSITION.y * finalContainerScale);

            this.elements.bodyParent.style.transformOrigin = 'top left';
            this.elements.bodyParent.style.transform = `translate(${containerTx}px, ${containerTy}px) scale(${finalContainerScale})`;

            // Apply Sub-element Transforms
            this.applyLowerBodyPose(pose);
            this.applyUpperBodyPose(pose);
            this.updateMarkers(pose);

            // Update Anchors
            if (passengerLayerActive) {
                this.updateAnchorPositions(pose, svg, transformInfo);
            }
        }
    }

    // ... Pose Computation Logic (Same as before) ...
    computePassengerPose(state) {
        const wheelBasePx = state.wheelBase * SCALE;
        const rearWheelX = CENTER_X + (wheelBasePx / 2); // Rear Axle X

        const hPointXPx = state.passengerHPointX * SCALE;
        const hipX = rearWheelX - hPointXPx;

        const groundClearancePx = state.groundClearance * SCALE;
        const floorThicknessPx = state.floorThickness * SCALE;
        const chassisBottomY = GROUND_Y - groundClearancePx;
        const floorY = chassisBottomY - floorThicknessPx;

        const hPointHeightPx = state.passengerHPointHeight * SCALE;
        const hipY = floorY - hPointHeightPx;

        const hip = { x: hipX, y: hipY };

        const footFloorDistPx = state.passengerFootFloorDist * SCALE;
        const heelY = floorY - footFloorDistPx;

        const hipFootDistPx = state.passengerHipFootDist * SCALE;
        const heelX = hip.x - hipFootDistPx;

        const heel = { x: heelX, y: heelY };

        const heightPx = (state.passengerHeight || 180) * 10 * SCALE;
        const legPose = this.solveLegIK(hip, heel, heightPx);

        const torsoPose = this.solveTorso(state.passengerBodyRecline, legPose.thighPx, hip);

        const head = this.computeHead(hip, legPose.globalScale, torsoPose.actualBodyReclineAngle);

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
            // For dragging calculations
            floorY,
            rearWheelX
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

    solveTorso(reclineDeg, thighLenPx, hip) {
        const desiredRad = ((reclineDeg - (TORSO.defaultAngleFromVertical * 180 / Math.PI)) * Math.PI / 180);
        return {
            relativeRotationDeg: desiredRad * 180 / Math.PI,
            actualBodyReclineAngle: reclineDeg
        };
    }

    computeHead(hip, globalScale, reclineDeg) {
        const headVector = {
            x: ASSET_COORDS.head.x - ASSET_COORDS.hip.x,
            y: ASSET_COORDS.head.y - ASSET_COORDS.hip.y
        };
        const defaultBodyAngleFromVertical = TORSO.defaultAngleFromVertical * 180 / Math.PI;
        const deltaDeg = (reclineDeg ?? defaultBodyAngleFromVertical) - defaultBodyAngleFromVertical;
        const rotationRad = deltaDeg * Math.PI / 180;

        const cos = Math.cos(rotationRad);
        const sin = Math.sin(rotationRad);
        const rotated = {
            x: headVector.x * cos - headVector.y * sin,
            y: headVector.x * sin + headVector.y * cos
        };

        return {
            x: hip.x + rotated.x * globalScale,
            y: hip.y + rotated.y * globalScale
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
        this.updateMarker(this.elements.topHead, pose.head, pose); // Added topHead mainly for visual debug if visible
    }

    updateMarker(element, worldPoint, pose, rotationDeg = 0) {
        if (!element || !worldPoint) return;
        const assetPoint = this.worldToAssetPoint(worldPoint, pose);
        const local = this.assetToLocal(assetPoint);
        if (local) {
            element.style.left = `${local.x}px`;
            element.style.top = `${local.y}px`;
            element.style.transform = rotationDeg ? `rotate(${rotationDeg}deg)` : 'none';
        }
    }

    // --- Interaction Logic ---

    createAnchor({ key, color }) {
        const anchor = document.createElement('div');
        anchor.className = 'passenger-anchor';
        anchor.dataset.anchor = key;
        const diameter = DOT_RADIUS * 2;
        anchor.style.width = `${diameter}px`;
        anchor.style.height = `${diameter}px`;
        anchor.style.backgroundColor = color;

        anchor.addEventListener('mouseenter', () => this.onAnchorHover(key));
        anchor.addEventListener('mouseleave', () => this.onAnchorLeave(key));
        anchor.addEventListener('mousedown', (event) => this.onAnchorMouseDown(key, event));

        this.passengerAnchorLayer.appendChild(anchor);
        this.passengerAnchors.set(key, anchor);
    }

    setAnchorsVisible(visible) {
        if (!this.passengerAnchorLayer) return;
        this.passengerAnchorLayer.style.display = visible ? 'block' : 'none';
        this.passengerAnchorLayer.style.pointerEvents = visible ? 'auto' : 'none';
        this.passengerAnchors.forEach((anchor) => {
            anchor.classList.toggle('is-visible', visible);
        });
        if (!visible) {
            this.cancelDrag();
        }
    }

    updateAnchorPositions(pose, svg, transformInfo) {
        // HPoint
        this.updateAnchorPos('hPoint', pose.hip.x, pose.hip.y, svg, transformInfo);
        // Heel
        this.updateAnchorPos('heel', pose.heel.x, pose.heel.y, svg, transformInfo);
        // Head
        this.updateAnchorPos('head', pose.head.x, pose.head.y, svg, transformInfo);
    }

    updateAnchorPos(key, worldX, worldY, svg, transformInfo) {
        const anchor = this.passengerAnchors.get(key);
        if (!anchor) return;
        const point = this.worldToCanvasPoint(worldX, worldY, svg, transformInfo);
        if (!point) return;
        anchor.style.left = `${point.x}px`;
        anchor.style.top = `${point.y}px`;
    }

    onAnchorHover(key) {
        this.hoveredAnchor = key;
        this.setAnchorVisualState(key, true);
    }

    onAnchorLeave(key) {
        if (this.draggingAnchor === key) return;
        if (this.hoveredAnchor === key) this.hoveredAnchor = null;
        this.setAnchorVisualState(key, false);
    }

    setAnchorVisualState(key, isActive) {
        const anchor = this.passengerAnchors.get(key);
        if (anchor) anchor.classList.toggle('is-active', isActive);
    }

    onAnchorMouseDown(key, event) {
        if (!this.layerController?.isActive('passenger')) return;

        const svgCoords = this.getSvgCoordsFromEvent(event);
        if (!svgCoords) return;

        this.draggingAnchor = key;
        this.setAnchorVisualState(key, true);

        let param = null;
        if (key === 'hPoint') param = ['passengerHPointX', 'passengerHPointHeight'];
        else if (key === 'heel') param = ['passengerFootFloorDist', 'passengerHipFootDist'];
        else if (key === 'head') param = 'passengerBodyRecline';

        if (param) this.stateManager.setInteraction(param);

        this.handleDrag(key, svgCoords);
        event.preventDefault();
        event.stopPropagation();
    }

    onMouseMove(event) {
        if (!this.draggingAnchor) return;
        const svgCoords = this.getSvgCoordsFromEvent(event);
        if (!svgCoords) return;
        this.handleDrag(this.draggingAnchor, svgCoords);
    }

    onMouseUp() {
        if (!this.draggingAnchor) return;
        const key = this.draggingAnchor;
        this.draggingAnchor = null;
        if (this.hoveredAnchor !== key) {
            this.setAnchorVisualState(key, false);
        }
        this.stateManager.setInteraction(null);
    }

    cancelDrag() {
        if (this.draggingAnchor) {
            const key = this.draggingAnchor;
            this.draggingAnchor = null;
            this.setAnchorVisualState(key, false);
        }
        this.hoveredAnchor = null;
    }

    handleDrag(key, svgCoords) {
        if (!this.latestPassengerPose) return;
        const { rearWheelX, floorY, hip } = this.latestPassengerPose;

        switch (key) {
            case 'hPoint': {
                // H-Point X is Dist to Rear Axle.
                // X = RearAxle - HPointX
                // So HPointX = RearAxle - CursorX
                const newDistX = Math.round((rearWheelX - svgCoords.x) / SCALE);

                // Height is FloorY - HipY
                // So HipY = FloorY - Height
                // Height = FloorY - CursorY
                const newHeight = Math.round((floorY - svgCoords.y) / SCALE);

                this.applyInputUpdates({
                    passengerHPointX: newDistX,
                    passengerHPointHeight: newHeight
                });
                break;
            }
            case 'heel': {
                // FootFloorDist (Y)
                // HeelY = FloorY - FootFloorDist
                // FootFloorDist = FloorY - HeelY
                const newFootFloorDist = Math.round((floorY - svgCoords.y) / SCALE);

                // HipFootDist (X)
                // HeelX = HipX - HipFootDist
                // HipFootDist = HipX - HeelX
                const newHipFootDist = Math.round((hip.x - svgCoords.x) / SCALE);

                this.applyInputUpdates({
                    passengerFootFloorDist: newFootFloorDist,
                    passengerHipFootDist: newHipFootDist
                });
                break;
            }
            case 'head': {
                // Body Recline
                // Calculate angle between Hip and Cursor
                const dx = svgCoords.x - hip.x;
                const dy = svgCoords.y - hip.y;
                // Since Y increases downwards, an upright torso (-Y) has negative angle logic if using atan2 directly?
                // Standard: Recline is deviation from Vertical.
                // Vector: Cursor - Hip.
                // AngleFromVertical = atan2(dx, -dy) ?
                // If dx=0, dy=-10 (up), atan2(0, 10) = 0.
                // If dx=10 (reclined), dy=-10, atan2(10, 10) = 45deg.
                // Yes.
                const angleRad = Math.atan2(dx, -dy);
                const angleDeg = angleRad * 180 / Math.PI;

                this.applyInputUpdates({
                    passengerBodyRecline: Math.round(angleDeg)
                });
                break;
            }
        }
    }

    applyInputUpdates(updates) {
        if (!updates || typeof updates !== 'object') return;
        const inputs = this.stateManager.inputs;
        const state = this.stateManager.getState();
        let hasChange = false;

        Object.entries(updates).forEach(([stateKey, value]) => {
            // Need to clamp? 
            // Reuse logic from HumanFigureRenderer logic if possible or implement simple clamp
            // Assuming inputs have min/max
            // Wait, inputs dict keys match state keys? Yes.
            const input = inputs[stateKey] || document.querySelector(`[data-param="${stateKey}"]`);
            // Note: inputs dictionary in main.js might not contain all new passenger inputs explicitly if I didn't add them?
            // I checked main.js, I didn't update the `inputs` object there to include the NEW adjusters (passengerHPointHeight etc).
            // StateManager reads via querySelectorAll('.smart-adjuster') for initial load, but `inputs` object is passed manually.
            // If I want to update inputs, I need to find them.
            // But StateManager.setState works regardless of inputs existing. inputs are just for Sync.
            // `HumanFigureRenderer` uses `inputs` from stateManager to clamp.
            // I should find the element dynamically if missing.

            let effectiveMax = Infinity;
            let effectiveMin = -Infinity;

            // Check if we have the input element to read constraints
            // SmartAdjuster element
            const adjuster = document.querySelector(`.smart-adjuster[data-param="${stateKey}"]`);
            if (adjuster) {
                effectiveMin = parseFloat(adjuster.dataset.min);
                effectiveMax = parseFloat(adjuster.dataset.max);
            }

            const clampedValue = Math.max(effectiveMin, Math.min(effectiveMax, value));

            if (state[stateKey] !== clampedValue) {
                hasChange = true;
                // We update state directly here via one batch if possible? 
                // StateManager doesn't support batch update returning.
                // But we can just call setState.
            }

            // We update state. StateManager will update inputs if they are subscribed or we manual sync?
            // StateManager updates listeners. SmartAdjuster is subscribed.
            // So we just need to call setState.
            if (state[stateKey] !== clampedValue) {
                this.stateManager.setState({ [stateKey]: clampedValue });
            }
        });
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

    // --- Helpers ---

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

    getSvgTransformInfo(svg) {
        if (!svg) svg = this.svg;
        if (!svg) return null;
        const ctm = svg.getScreenCTM();
        if (!ctm) return null;
        return { ctm };
    }

    getSvgUnitScale(ctm) {
        const scaleX = Math.hypot(ctm.a, ctm.b);
        const scaleY = Math.hypot(ctm.c, ctm.d);
        return (scaleX + scaleY) / 2;
    }

    worldToCanvasPoint(x, y, svg, info) {
        if (!svg || !info) return null;
        const pt = svg.createSVGPoint();
        pt.x = x;
        pt.y = y;
        const transformed = pt.matrixTransform(info.ctm);
        return this.screenToOverlayLocal(transformed);
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
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
    }
}
