import {
    BODY_POINT_CONFIG,
    CENTER_X,
    COLOR_BLUE,
    COLOR_FRONT_POINT,
    COLOR_REAR_POINT,
    DOT_RADIUS,
    DOT_RADIUS_ACTIVE,
    GROUND_Y,
    SCALE,
    SPLINE_DOT_ACTIVE_RADIUS,
    SPLINE_DOT_RADIUS,
    SPLINE_HANDLE_RADIUS,
    SPLINE_MENU_OPTIONS
} from '../constants.js';

const MAX_CONTROL_POINTS_PER_SEGMENT = 2;
const BODY_SEGMENTS = [
    { id: 'front-face', label: 'Front face', startKey: 'frontTip', endKey: 'frontFaceBreak' },
    { id: 'bonnet', label: 'Bonnet', startKey: 'frontFaceBreak', endKey: 'bonnetEnd' },
    { id: 'windscreen', label: 'Windscreen', startKey: 'bonnetEnd', endKey: 'windowEnd' },
    { id: 'rooftop', label: 'Rooftop', startKey: 'windowEnd', endKey: 'rooftopEnd' },
    { id: 'rear-window', label: 'Rear Window', startKey: 'rooftopEnd', endKey: 'rearWindowEnd' },
    { id: 'rear-door', label: 'Rear Door', startKey: 'rearWindowEnd', endKey: 'bumperEnd' },
    { id: 'rear-bump', label: 'Rear bump', startKey: 'bumperEnd', endKey: 'rearTip' }
];

export class ChassisRenderer {
    constructor({ svg, drawingGroup, canvasArea, stateManager, layerController }) {
        this.svg = svg;
        this.drawingGroup = drawingGroup;
        this.canvasArea = canvasArea;
        this.stateManager = stateManager;
        this.layerController = layerController;

        this.pointTooltip = document.createElement('div');
        this.pointTooltip.className = 'point-tooltip';
        this.canvasArea.appendChild(this.pointTooltip);

        this.splineMenu = document.createElement('div');
        this.splineMenu.className = 'spline-menu';
        this.splineMenu.style.display = 'none';
        this.canvasArea.appendChild(this.splineMenu);

        this.addSplineMenuOptions();

        this.overlayGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        this.overlayGroup.setAttribute('class', 'interaction-overlay');
        this.svg.appendChild(this.overlayGroup);

        this.lineMenu = this.createMenuElement();
        this.lineMenuButton = document.createElement('button');
        this.lineMenuButton.type = 'button';
        this.lineMenuButton.textContent = 'Add control point';
        this.lineMenuButton.addEventListener('click', () => this.handleAddControlPoint());
        this.lineMenu.appendChild(this.lineMenuButton);
        this.canvasArea.appendChild(this.lineMenu);

        this.splineMenuVisible = false;
        this.ignoreNextDocumentClick = false;
        this.tooltipPointKey = null;
        this.splineMenuAnchorPx = { x: 0, y: 0 };
        this.splineMenuContext = null;

        document.addEventListener('click', (event) => {
            if (!this.splineMenuVisible) return;
            if (this.ignoreNextDocumentClick) {
                this.ignoreNextDocumentClick = false;
                return;
            }
            if (this.splineMenu.contains(event.target)) return;
            this.hideSplineMenu();
        });

        document.addEventListener('click', (event) => {
            if (this.lineMenu.contains(event.target)) {
                return;
            }
            this.hideLineMenu();
        });

        this.layerController.onChange((layer) => {
            if (layer !== 'chassis') {
                this.hideSplineMenu();
                this.hideLineMenu();
                this.clearActiveControlPointHandles();
            }
        });

        // Drag state
        this.isDraggingFrontBreak = false;
        this.dragOffsetX = 0;
        this.dragOffsetY = 0;

        this.isDraggingBodyPoint = false;
        this.currentDragPoint = null;
        this.bodyDragOffsetX = 0;
        this.bodyDragOffsetY = 0;

        this.isDraggingAxle = null;
        this.axleDragOffsetX = 0;

        this.isDraggingOverhangPoint = null;
        this.overhangDragOffset = { x: 0, y: 0 };
        this.activeOverhangDot = null;
        this.activeOverhangPointKey = null;

        this.handleMouseMove = (event) => this.onMouseMove(event);
        this.handleMouseUp = () => this.onMouseUp();
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);

        this.pendingSegmentInteraction = null;
        this.segmentMap = new Map();
        this.controlPointElements = new Map();
        this.controlPointHandleElements = new Map();
        this.segmentInfoMap = new Map();
        this.draggingControlPoint = null;
        this.controlPointDragMoved = false;
        this.draggingControlPointHandle = null;
        this.controlPointHandleDragMoved = false;
        this.controlPointHandleDragOffset = { x: 0, y: 0 };
        this.activeHandleControlPoint = null;
        this.latestSegments = null;
        this.bodyProfilePathElement = null;

        this.handleCanvasMouseDown = (event) => {
            if (!this.layerController.isActive('chassis')) return;
            const target = event.target;
            if (!target) {
                this.clearActiveControlPointHandles();
                return;
            }
            if (typeof target.closest !== 'function') {
                this.clearActiveControlPointHandles();
                return;
            }
            if (target.closest('[data-body-control-point="true"]') ||
                target.closest('[data-control-handle="true"]')) {
                return;
            }
            this.clearActiveControlPointHandles();
        };
        this.canvasArea.addEventListener('mousedown', this.handleCanvasMouseDown);

    }

    destroy() {
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        if (this.handleCanvasMouseDown) {
            this.canvasArea.removeEventListener('mousedown', this.handleCanvasMouseDown);
        }
        this.splineMenu.remove();
        this.pointTooltip.remove();
    }

    draw() {
        const state = this.stateManager.getState();
        this.drawingGroup.innerHTML = '';
        this.hideLineMenu();
        this.segmentInfoMap.clear();

        const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
        const wheelArchGapPx = state.wheelArchGap * SCALE;
        const wheelBasePx = state.wheelBase * SCALE;
        const groundClearancePx = state.groundClearance * SCALE;
        const floorThicknessPx = state.floorThickness * SCALE;

        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const rearWheelX = CENTER_X + (wheelBasePx / 2);
        const wheelY = GROUND_Y - tireRadiusPx;

        const chassisBottomY = GROUND_Y - groundClearancePx;
        const floorY = chassisBottomY - floorThicknessPx;

        const archRadius = tireRadiusPx + wheelArchGapPx;
        const dy = chassisBottomY - wheelY;
        let dx = 0;
        if (archRadius > Math.abs(dy)) {
            dx = Math.sqrt(archRadius * archRadius - dy * dy);
        }

        const frontArchStartX = frontWheelX - dx;
        const frontArchEndX = frontWheelX + dx;
        const rearArchStartX = rearWheelX - dx;
        const rearArchEndX = rearWheelX + dx;
        const largeArcFlag = (dy > 0) ? 1 : 0;

        const pathD = `
            M ${frontArchStartX} ${chassisBottomY}
            A ${archRadius} ${archRadius} 0 ${largeArcFlag} 1 ${frontArchEndX} ${chassisBottomY}
            L ${rearArchStartX} ${chassisBottomY}
            A ${archRadius} ${archRadius} 0 ${largeArcFlag} 1 ${rearArchEndX} ${chassisBottomY}
        `;

        const bodyContour = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bodyContour.setAttribute('d', pathD);
        bodyContour.setAttribute('stroke', '#38bdf8');
        bodyContour.setAttribute('stroke-width', '2');
        bodyContour.setAttribute('fill', 'none');
        this.drawingGroup.appendChild(bodyContour);

        const floorLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        floorLine.setAttribute('x1', frontArchStartX);
        floorLine.setAttribute('y1', floorY);
        floorLine.setAttribute('x2', rearArchEndX);
        floorLine.setAttribute('y2', floorY);
        floorLine.setAttribute('stroke', '#f8fafc');
        floorLine.setAttribute('stroke-width', '2');
        floorLine.setAttribute('stroke-dasharray', '4, 4');
        this.drawingGroup.appendChild(floorLine);

        const frontApproachAngleRad = state.frontApproachAngle * Math.PI / 180;
        const rearDepartureAngleRad = state.rearDepartureAngle * Math.PI / 180;
        const lineLength = 200;

        const frontTheta = (Math.PI / 2) + frontApproachAngleRad;
        const frontTangentX = frontWheelX + tireRadiusPx * Math.cos(frontTheta);
        const frontTangentY = wheelY + tireRadiusPx * Math.sin(frontTheta);
        const frontDx = -Math.sin(frontTheta);
        const frontDy = Math.cos(frontTheta);

        const frontTangentLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        frontTangentLine.setAttribute('x1', frontTangentX - lineLength * frontDx);
        frontTangentLine.setAttribute('y1', frontTangentY - lineLength * frontDy);
        frontTangentLine.setAttribute('x2', frontTangentX + lineLength * frontDx);
        frontTangentLine.setAttribute('y2', frontTangentY + lineLength * frontDy);
        frontTangentLine.setAttribute('stroke', 'rgba(148, 163, 184, 0.5)');
        frontTangentLine.setAttribute('stroke-width', '2');
        frontTangentLine.setAttribute('stroke-dasharray', '5, 5');
        this.drawingGroup.appendChild(frontTangentLine);

        const rearTheta = (Math.PI / 2) - rearDepartureAngleRad;
        const rearTangentX = rearWheelX + tireRadiusPx * Math.cos(rearTheta);
        const rearTangentY = wheelY + tireRadiusPx * Math.sin(rearTheta);
        const rearDx = Math.sin(rearTheta);
        const rearDy = -Math.cos(rearTheta);

        const rearTangentLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        rearTangentLine.setAttribute('x1', rearTangentX - lineLength * rearDx);
        rearTangentLine.setAttribute('y1', rearTangentY - lineLength * rearDy);
        rearTangentLine.setAttribute('x2', rearTangentX + lineLength * rearDx);
        rearTangentLine.setAttribute('y2', rearTangentY + lineLength * rearDy);
        rearTangentLine.setAttribute('stroke', 'rgba(148, 163, 184, 0.5)');
        rearTangentLine.setAttribute('stroke-width', '2');
        rearTangentLine.setAttribute('stroke-dasharray', '5, 5');
        this.drawingGroup.appendChild(rearTangentLine);

        const frontOverhangPx = state.frontOverhang * SCALE;
        const targetFrontX = frontWheelX - frontOverhangPx;
        let targetFrontY;

        if (Math.abs(frontDx) > 0.001) {
            const mFront = frontDy / frontDx;
            targetFrontY = frontTangentY + mFront * (targetFrontX - frontTangentX);
        } else {
            targetFrontY = frontTangentY;
        }

        const frontTipPoint = { x: targetFrontX, y: targetFrontY };
        const frontBumperLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        frontBumperLine.setAttribute('x1', targetFrontX);
        frontBumperLine.setAttribute('y1', targetFrontY);
        frontBumperLine.setAttribute('x2', frontArchStartX);
        frontBumperLine.setAttribute('y2', chassisBottomY);
        frontBumperLine.setAttribute('stroke', '#38bdf8');
        frontBumperLine.setAttribute('stroke-width', '2');
        this.drawingGroup.appendChild(frontBumperLine);

        const frontOverhangDot = this.createOverhangAnchorDot(frontTipPoint.x, frontTipPoint.y, 'front');
        this.drawingGroup.appendChild(frontOverhangDot);

        const frontFaceBreakPos = this.getPointPosition('frontFaceBreak', frontWheelX, rearWheelX, wheelY, state);
        const breakPointX = frontFaceBreakPos.x;
        const breakPointY = frontFaceBreakPos.y;

        const anchorDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        anchorDot.setAttribute('cx', breakPointX);
        anchorDot.setAttribute('cy', breakPointY);
        anchorDot.setAttribute('r', DOT_RADIUS.toString());
        anchorDot.setAttribute('fill', BODY_POINT_CONFIG.frontFaceBreak.color);
        anchorDot.setAttribute('stroke', 'none');
        anchorDot.setAttribute('class', 'interactive-anchor');
        anchorDot.style.cursor = 'pointer';
        anchorDot.style.transition = 'r 0.2s ease';

        anchorDot.addEventListener('mouseenter', () => {
            this.setDotVisualState(anchorDot, true);
            this.showPointTooltip('frontFaceBreak', parseFloat(anchorDot.getAttribute('cx')), parseFloat(anchorDot.getAttribute('cy')));
        });
        anchorDot.addEventListener('mouseleave', () => {
            if (!this.isDraggingFrontBreak) {
                this.setDotVisualState(anchorDot, false);
                this.hidePointTooltip('frontFaceBreak');
            }
        });
        anchorDot.addEventListener('mousedown', (e) => {
            if (!this.layerController.isActive('chassis')) return;
            const tireRadiusPxCurrent = (state.tireDiameter / 2) * SCALE;
            const wheelBasePxCurrent = state.wheelBase * SCALE;
            const localFrontWheelX = CENTER_X - (wheelBasePxCurrent / 2);
            const localRearWheelX = CENTER_X + (wheelBasePxCurrent / 2);
            const localWheelY = GROUND_Y - tireRadiusPxCurrent;
            const referenceX = this.getReferenceX(BODY_POINT_CONFIG.frontFaceBreak.reference, localFrontWheelX, localRearWheelX);
            const currentBreakPointX = referenceX - (state.frontFaceBreakX * SCALE);
            const currentBreakPointY = localWheelY - (state.frontFaceBreakY * SCALE);

            const svgEl = this.svg;
            const pt = svgEl.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svgEl.getScreenCTM().inverse());

            this.isDraggingFrontBreak = true;
            this.dragOffsetX = svgP.x - currentBreakPointX;
            this.dragOffsetY = svgP.y - currentBreakPointY;
            this.setDotVisualState(anchorDot, true);
            this.showPointTooltip('frontFaceBreak', currentBreakPointX, currentBreakPointY);
            e.preventDefault();
            e.stopPropagation();
        });
        this.drawingGroup.appendChild(anchorDot);

        const createDraggableDot = (x, y, pointName) => {
            const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            dot.setAttribute('cx', x);
            dot.setAttribute('cy', y);
            dot.setAttribute('r', DOT_RADIUS.toString());
            const config = BODY_POINT_CONFIG[pointName];
            dot.setAttribute('fill', config?.color || COLOR_FRONT_POINT);
            dot.setAttribute('stroke', 'none');
            dot.setAttribute('data-point', pointName);
            dot.style.cursor = 'pointer';

            dot.addEventListener('mouseenter', () => {
                this.setDotVisualState(dot, true);
                this.showPointTooltip(pointName, parseFloat(dot.getAttribute('cx')), parseFloat(dot.getAttribute('cy')));
            });
            dot.addEventListener('mouseleave', () => {
                if (!this.isDraggingBodyPoint || this.currentDragPoint !== pointName) {
                    this.setDotVisualState(dot, false);
                    this.hidePointTooltip(pointName);
                }
            });

            dot.addEventListener('mousedown', (e) => {
                if (!this.layerController.isActive('chassis')) return;
                this.isDraggingBodyPoint = true;
                this.currentDragPoint = pointName;

                const tireRadiusPxCurrent = (state.tireDiameter / 2) * SCALE;
                const wheelBasePxCurrent = state.wheelBase * SCALE;
                const localFrontWheelX = CENTER_X - (wheelBasePxCurrent / 2);
                const localRearWheelX = CENTER_X + (wheelBasePxCurrent / 2);
                const localWheelY = GROUND_Y - tireRadiusPxCurrent;
                const pointConfig = BODY_POINT_CONFIG[pointName];
                const referenceX = this.getReferenceX(pointConfig.reference, localFrontWheelX, localRearWheelX);
                const currentDotX = referenceX - (state[pointConfig.xKey] * SCALE);
                const currentDotY = localWheelY - (state[pointConfig.yKey] * SCALE);

                const svgEl = this.svg;
                const pt = svgEl.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const svgP = pt.matrixTransform(svgEl.getScreenCTM().inverse());

                this.bodyDragOffsetX = svgP.x - currentDotX;
                this.bodyDragOffsetY = svgP.y - currentDotY;
                this.setDotVisualState(dot, true);
                this.showPointTooltip(pointName, currentDotX, currentDotY);
                e.preventDefault();
                e.stopPropagation();
            });

            return dot;
        };

        const bonnetEndPx = this.getPointPosition('bonnetEnd', frontWheelX, rearWheelX, wheelY, state);
        const windowEndPx = this.getPointPosition('windowEnd', frontWheelX, rearWheelX, wheelY, state);
        const rooftopEndPx = this.getPointPosition('rooftopEnd', frontWheelX, rearWheelX, wheelY, state);
        const rearWindowEndPx = this.getPointPosition('rearWindowEnd', frontWheelX, rearWheelX, wheelY, state);
        const bumperEndPx = this.getPointPosition('bumperEnd', frontWheelX, rearWheelX, wheelY, state);

        const rearOverhangPx = state.rearOverhang * SCALE;
        const targetRearX = rearWheelX + rearOverhangPx;
        let targetRearY;
        if (Math.abs(rearDx) > 0.001) {
            const mRear = rearDy / rearDx;
            targetRearY = rearTangentY + mRear * (targetRearX - rearTangentX);
        } else {
            targetRearY = rearTangentY;
        }
        const rearTipPoint = { x: targetRearX, y: targetRearY };

        const rearBumperLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        rearBumperLine.setAttribute('x1', targetRearX);
        rearBumperLine.setAttribute('y1', targetRearY);
        rearBumperLine.setAttribute('x2', rearArchEndX);
        rearBumperLine.setAttribute('y2', chassisBottomY);
        rearBumperLine.setAttribute('stroke', '#38bdf8');
        rearBumperLine.setAttribute('stroke-width', '2');
        this.drawingGroup.appendChild(rearBumperLine);

        const rearOverhangDot = this.createOverhangAnchorDot(rearTipPoint.x, rearTipPoint.y, 'rear');
        this.drawingGroup.appendChild(rearOverhangDot);

        const pointMap = {
            frontTip: frontTipPoint,
            frontFaceBreak: frontFaceBreakPos,
            bonnetEnd: bonnetEndPx,
            windowEnd: windowEndPx,
            rooftopEnd: rooftopEndPx,
            rearWindowEnd: rearWindowEndPx,
            bumperEnd: bumperEndPx,
            rearTip: rearTipPoint
        };

        const bodySegments = BODY_SEGMENTS
            .map((segment) => {
                const start = pointMap[segment.startKey];
                const end = pointMap[segment.endKey];
                if (!start || !end) {
                    return null;
                }
                return { ...segment, start, end };
            })
            .filter(Boolean);

        this.latestSegments = bodySegments;

        const bodyPath = this.buildBodyProfilePath(this.latestSegments);

        const bodyProfilePath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        bodyProfilePath.setAttribute('d', bodyPath);
        bodyProfilePath.setAttribute('stroke', COLOR_BLUE);
        bodyProfilePath.setAttribute('stroke-width', '2');
        bodyProfilePath.setAttribute('fill', 'none');
        this.drawingGroup.appendChild(bodyProfilePath);
        this.bodyProfilePathElement = bodyProfilePath;

        this.drawingGroup.appendChild(createDraggableDot(bonnetEndPx.x, bonnetEndPx.y, 'bonnetEnd'));
        this.drawingGroup.appendChild(createDraggableDot(windowEndPx.x, windowEndPx.y, 'windowEnd'));
        this.drawingGroup.appendChild(createDraggableDot(rooftopEndPx.x, rooftopEndPx.y, 'rooftopEnd'));
        this.drawingGroup.appendChild(createDraggableDot(rearWindowEndPx.x, rearWindowEndPx.y, 'rearWindowEnd'));
        this.drawingGroup.appendChild(createDraggableDot(bumperEndPx.x, bumperEndPx.y, 'bumperEnd'));

        this.renderSegmentControls(bodySegments);

        this.drawTire(rearWheelX, wheelY, tireRadiusPx, 'rear');
        this.drawTire(frontWheelX, wheelY, tireRadiusPx, 'front');

        const groundLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        groundLine.setAttribute('x1', 0);
        groundLine.setAttribute('y1', GROUND_Y);
        groundLine.setAttribute('x2', 800);
        groundLine.setAttribute('y2', GROUND_Y);
        groundLine.setAttribute('stroke', 'rgba(255,255,255,0.1)');
        groundLine.setAttribute('stroke-width', '1');
        this.drawingGroup.appendChild(groundLine);
    }

    createOverhangAnchorDot(x, y, position) {
        const pointKey = position === 'front' ? 'frontOverhangTip' : 'rearOverhangTip';
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', x);
        dot.setAttribute('cy', y);
        dot.setAttribute('r', DOT_RADIUS.toString());
        dot.setAttribute('fill', position === 'front' ? COLOR_FRONT_POINT : COLOR_REAR_POINT);
        dot.setAttribute('stroke', 'none');
        dot.style.cursor = 'pointer';
        dot.style.transition = 'r 0.2s ease';

        dot.addEventListener('mouseenter', () => {
            this.setDotVisualState(dot, true);
            this.showPointTooltip(pointKey, parseFloat(dot.getAttribute('cx')), parseFloat(dot.getAttribute('cy')));
        });

        dot.addEventListener('mouseleave', () => {
            if (this.isDraggingOverhangPoint !== position) {
                this.setDotVisualState(dot, false);
                this.hidePointTooltip(pointKey);
            }
        });

        dot.addEventListener('mousedown', (event) => {
            this.startOverhangDrag(position, pointKey, dot, event);
        });

        return dot;
    }

    drawTire(cx, cy, r, position = 'front') {
        const group = document.createElementNS('http://www.w3.org/2000/svg', 'g');

        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.setAttribute('cx', cx);
        circle.setAttribute('cy', cy);
        circle.setAttribute('r', r);
        circle.setAttribute('fill', 'rgba(255, 255, 255, 0.2)');
        circle.setAttribute('stroke', 'none');
        group.appendChild(circle);

        const center = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        center.setAttribute('cx', cx);
        center.setAttribute('cy', cy);
        center.setAttribute('r', DOT_RADIUS.toString());
        center.setAttribute('fill', position === 'front' ? COLOR_FRONT_POINT : COLOR_REAR_POINT);
        center.setAttribute('stroke', 'none');
        center.style.cursor = 'ew-resize';
        center.addEventListener('mousedown', (event) => this.startAxleDrag(position, event, cx, center));
        center.addEventListener('mouseenter', () => this.setDotVisualState(center, true));
        center.addEventListener('mouseleave', () => {
            if (this.isDraggingAxle !== position) {
                this.setDotVisualState(center, false);
            }
        });
        this.setDotVisualState(center, false);
        group.appendChild(center);

        this.drawingGroup.appendChild(group);
    }

    startOverhangDrag(position, pointKey, dotElement, event) {
        if (!this.layerController.isActive('chassis')) return;
        const svgPoint = this.getSvgPointFromEvent(event);
        if (!svgPoint) return;
        const currentX = parseFloat(dotElement.getAttribute('cx'));
        const currentY = parseFloat(dotElement.getAttribute('cy'));
        this.isDraggingOverhangPoint = position;
        this.overhangDragOffset = {
            x: svgPoint.x - currentX,
            y: svgPoint.y - currentY
        };
        this.activeOverhangDot = dotElement;
        this.activeOverhangPointKey = pointKey;
        this.setDotVisualState(dotElement, true);
        this.showPointTooltip(pointKey, currentX, currentY);
        event.preventDefault();
        event.stopPropagation();
    }

    endOverhangDrag() {
        if (this.activeOverhangDot) {
            this.setDotVisualState(this.activeOverhangDot, false);
        }
        if (this.activeOverhangPointKey) {
            this.hidePointTooltip(this.activeOverhangPointKey);
        }
        this.isDraggingOverhangPoint = null;
        this.overhangDragOffset = { x: 0, y: 0 };
        this.activeOverhangDot = null;
        this.activeOverhangPointKey = null;
    }

    startAxleDrag(position, event, axleX, centerElement) {
        if (!this.layerController.isActive('chassis')) return;
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return;
        const pt = this.svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const svgCoords = pt.matrixTransform(ctm.inverse());
        this.isDraggingAxle = position;
        this.axleDragOffsetX = svgCoords.x - axleX;
        this.setDotVisualState(centerElement, true);
        event.preventDefault();
        event.stopPropagation();
    }

    onMouseMove(e) {
        const shouldProcess =
            this.isDraggingFrontBreak ||
            (this.isDraggingBodyPoint && this.currentDragPoint) ||
            this.isDraggingAxle ||
            Boolean(this.draggingControlPoint) ||
            Boolean(this.draggingControlPointHandle) ||
            Boolean(this.isDraggingOverhangPoint);
        if (!shouldProcess) {
            return;
        }

        const ctm = this.svg.getScreenCTM();
        if (!ctm) return;
        const svgPoint = this.svg.createSVGPoint();
        svgPoint.x = e.clientX;
        svgPoint.y = e.clientY;
        const svgCoords = svgPoint.matrixTransform(ctm.inverse());
        const state = this.stateManager.getState();

        if (this.draggingControlPointHandle) {
            this.handleControlPointHandleDrag(svgCoords);
            return;
        }

        if (this.draggingControlPoint) {
            this.handleControlPointDrag(svgCoords);
            return;
        }

        if (
            !this.isDraggingFrontBreak &&
            !(this.isDraggingBodyPoint && this.currentDragPoint) &&
            !this.isDraggingAxle &&
            !this.isDraggingOverhangPoint
        ) {
            return;
        }

        const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
        const wheelBasePx = state.wheelBase * SCALE;
        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const rearWheelX = CENTER_X + (wheelBasePx / 2);
        const wheelY = GROUND_Y - tireRadiusPx;

        if (this.isDraggingFrontBreak) {
            const newBreakPointX = svgCoords.x - this.dragOffsetX;
            const newBreakPointY = svgCoords.y - this.dragOffsetY;
            const referenceX = this.getReferenceX(BODY_POINT_CONFIG.frontFaceBreak.reference, frontWheelX, rearWheelX);
            const newBreakXPx = referenceX - newBreakPointX;
            const newBreakYPx = wheelY - newBreakPointY;

            const nextState = {
                frontFaceBreakX: Math.max(400, Math.min(1500, Math.round(newBreakXPx / SCALE))),
                frontFaceBreakY: Math.max(0, Math.min(800, Math.round(newBreakYPx / SCALE)))
            };
            this.stateManager.setState(nextState);

            if (this.tooltipPointKey === 'frontFaceBreak') {
                this.updatePointTooltip('frontFaceBreak', newBreakPointX, newBreakPointY);
            }
        }

        if (this.isDraggingBodyPoint && this.currentDragPoint) {
            const config = BODY_POINT_CONFIG[this.currentDragPoint];
            if (config) {
                const referenceX = this.getReferenceX(config.reference, frontWheelX, rearWheelX);
                const newPointX = svgCoords.x - this.bodyDragOffsetX;
                const newPointY = svgCoords.y - this.bodyDragOffsetY;
                const newXPx = referenceX - newPointX;
                const newYPx = wheelY - newPointY;
                const partial = {};
                partial[config.xKey] = Math.round(newXPx / SCALE);
                partial[config.yKey] = Math.round(newYPx / SCALE);
                this.stateManager.setState(partial);
                if (this.tooltipPointKey === this.currentDragPoint) {
                    this.updatePointTooltip(this.currentDragPoint, newPointX, newPointY);
                }
            }
        }

        if (this.isDraggingOverhangPoint) {
            this.handleOverhangPointDrag(svgCoords, state);
        }

        if (this.isDraggingAxle) {
            const bounds = this.stateManager.getWheelBaseBounds();
            const minWheelBasePx = bounds.min * SCALE;
            const maxWheelBasePx = bounds.max * SCALE;
            const targetX = svgCoords.x - this.axleDragOffsetX;
            let desiredWheelBasePx;

            if (this.isDraggingAxle === 'front') {
                desiredWheelBasePx = (CENTER_X - targetX) * 2;
            } else {
                desiredWheelBasePx = (targetX - CENTER_X) * 2;
            }

            desiredWheelBasePx = Math.max(minWheelBasePx, Math.min(maxWheelBasePx, desiredWheelBasePx));
            const newWheelBaseMm = Math.round(desiredWheelBasePx / SCALE);
            if (newWheelBaseMm !== state.wheelBase) {
                this.stateManager.inputs.wheelBase.value = newWheelBaseMm;
                this.stateManager.updateFromInputs();
            }
        }
    }

    handleOverhangPointDrag(svgCoords, state) {
        if (!this.isDraggingOverhangPoint) return;

        const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
        const wheelBasePx = state.wheelBase * SCALE;
        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const rearWheelX = CENTER_X + (wheelBasePx / 2);
        const wheelY = GROUND_Y - tireRadiusPx;
        const adjustedPoint = {
            x: svgCoords.x - this.overhangDragOffset.x,
            y: svgCoords.y - this.overhangDragOffset.y
        };

        const isFront = this.isDraggingOverhangPoint === 'front';
        const inputEl = isFront ? this.stateManager.inputs.frontOverhang : this.stateManager.inputs.rearOverhang;
        if (!inputEl) return;

        const sliderMin = parseInt(inputEl.min, 10);
        const sliderMax = parseInt(inputEl.max, 10);
        const min = Number.isNaN(sliderMin) ? 0 : sliderMin;
        const max = Number.isNaN(sliderMax) ? min : sliderMax;

        const geometry = isFront
            ? this.getFrontOverhangGeometry(state, frontWheelX, wheelY, tireRadiusPx)
            : this.getRearOverhangGeometry(state, rearWheelX, wheelY, tireRadiusPx);

        const projected = this.projectPointOntoLine(adjustedPoint, geometry.tangentPoint, geometry.direction);
        const rawOverhangPx = isFront
            ? frontWheelX - projected.x
            : projected.x - rearWheelX;

        let overhangMm = Math.round(rawOverhangPx / SCALE);
        overhangMm = Math.max(min, Math.min(max, overhangMm));

        const currentValue = isFront ? state.frontOverhang : state.rearOverhang;
        if (overhangMm !== currentValue) {
            inputEl.value = overhangMm.toString();
            this.stateManager.updateFromInputs();
        }

        const updatedValue = isFront ? state.frontOverhang : state.rearOverhang;
        const overhangPx = updatedValue * SCALE;
        const finalX = isFront ? frontWheelX - overhangPx : rearWheelX + overhangPx;
        const finalY = this.getLineYFromX(geometry.tangentPoint, geometry.direction, finalX);
        const tooltipKey = isFront ? 'frontOverhangTip' : 'rearOverhangTip';
        this.updatePointTooltip(tooltipKey, finalX, finalY);
    }

    onMouseUp() {
        this.isDraggingFrontBreak = false;
        this.isDraggingBodyPoint = false;
        this.currentDragPoint = null;
        this.isDraggingAxle = null;
        this.endOverhangDrag();
        if (this.draggingControlPoint) {
            this.endControlPointDrag();
        }
        if (this.draggingControlPointHandle) {
            this.endControlPointHandleDrag();
        }
    }

    setDotVisualState(element, isActive) {
        if (!element) return;
        element.setAttribute('r', (isActive ? DOT_RADIUS_ACTIVE : DOT_RADIUS).toString());
        if (isActive) {
            element.setAttribute('stroke', 'white');
            element.setAttribute('stroke-width', '1.5');
        } else {
            element.setAttribute('stroke', 'none');
            element.removeAttribute('stroke-width');
        }
    }

    setSplineDotState(element, isActive, baseRadius = SPLINE_DOT_RADIUS, activeRadius = SPLINE_DOT_ACTIVE_RADIUS) {
        if (!element) return;
        element.setAttribute('r', (isActive ? activeRadius : baseRadius).toString());
        element.setAttribute('stroke', isActive ? 'white' : 'none');
        if (isActive) {
            element.setAttribute('stroke-width', '1');
        } else {
            element.removeAttribute('stroke-width');
        }
    }

    getReferenceX(reference, frontWheelX, rearWheelX) {
        return reference === 'rear' ? rearWheelX : frontWheelX;
    }

    getPointPosition(pointKey, frontWheelX, rearWheelX, wheelY, state) {
        const config = BODY_POINT_CONFIG[pointKey];
        if (!config) {
            return { x: 0, y: 0 };
        }
        const referenceX = this.getReferenceX(config.reference, frontWheelX, rearWheelX);
        return {
            x: referenceX - (state[config.xKey] * SCALE),
            y: wheelY - (state[config.yKey] * SCALE)
        };
    }

    formatTooltipText(pointKey) {
        const state = this.stateManager.getState();
        if (pointKey === 'frontOverhangTip') {
            return `Front Tip • Front axle • Overhang: ${state.frontOverhang}mm`;
        }
        if (pointKey === 'rearOverhangTip') {
            return `Rear Tip • Rear axle • Overhang: ${state.rearOverhang}mm`;
        }
        const config = BODY_POINT_CONFIG[pointKey];
        if (!config) return '';
        const originLabel = config.reference === 'rear' ? 'Rear axle' : 'Front axle';
        const xVal = state[config.xKey];
        const yVal = state[config.yKey];
        return `${config.label} • ${originLabel} • X: ${xVal}mm • Y: ${yVal}mm`;
    }

    positionTooltipAt(svgX, svgY) {
        if (!this.svg) return;
        const pt = this.svg.createSVGPoint();
        pt.x = svgX;
        pt.y = svgY;
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return;
        const screenPoint = pt.matrixTransform(ctm);
        const canvasRect = this.canvasArea.getBoundingClientRect();
        this.pointTooltip.style.left = `${screenPoint.x - canvasRect.left}px`;
        this.pointTooltip.style.top = `${screenPoint.y - canvasRect.top - 12}px`;
    }

    updatePointTooltip(pointKey, svgX, svgY) {
        if (!pointKey) return;
        this.pointTooltip.textContent = this.formatTooltipText(pointKey);
        this.positionTooltipAt(svgX, svgY);
    }

    showPointTooltip(pointKey, svgX, svgY) {
        if (!pointKey) return;
        this.tooltipPointKey = pointKey;
        this.updatePointTooltip(pointKey, svgX, svgY);
        this.pointTooltip.style.display = 'block';
    }

    hidePointTooltip(pointKey) {
        if (pointKey && this.tooltipPointKey && this.tooltipPointKey !== pointKey) {
            return;
        }
        this.tooltipPointKey = null;
        this.pointTooltip.style.display = 'none';
    }

    positionSplineMenu(anchorPxX, anchorPxY) {
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return;
        const pt = this.svg.createSVGPoint();
        pt.x = anchorPxX;
        pt.y = anchorPxY;
        const screenPoint = pt.matrixTransform(ctm);
        const canvasRect = this.canvasArea.getBoundingClientRect();
        this.splineMenu.style.left = `${screenPoint.x - canvasRect.left + 12}px`;
        this.splineMenu.style.top = `${screenPoint.y - canvasRect.top - 12}px`;
    }

    updateSplineMenuActiveState() {
        const context = this.splineMenuContext;
        const currentType = (context && context.type === 'segmentControl')
            ? this.getControlPointMode(context.segmentId, context.pointId)
            : 'hard';
        this.splineMenu.querySelectorAll('button').forEach((button) => {
            button.classList.toggle('active', button.dataset.type === currentType);
        });
    }

    showSplineMenu(anchorPxX, anchorPxY, context) {
        if (!context) return;
        this.splineMenuContext = context;
        this.splineMenuAnchorPx = { x: anchorPxX, y: anchorPxY };
        this.positionSplineMenu(anchorPxX, anchorPxY);
        this.updateSplineMenuActiveState();
        this.splineMenu.style.display = 'flex';
        this.splineMenuVisible = true;
        this.ignoreNextDocumentClick = true;
    }

    hideSplineMenu() {
        this.splineMenu.style.display = 'none';
        this.splineMenuVisible = false;
        this.splineMenuContext = null;
    }

    setSplineType(type) {
        if (!this.splineMenuContext || this.splineMenuContext.type !== 'segmentControl') {
            return;
        }
        const { segmentId, pointId } = this.splineMenuContext;
        this.stateManager.setBodyControlPointMode(segmentId, pointId, type);
        this.updateControlPointVisual(segmentId, pointId);
        this.refreshBodyProfilePath();
        this.updateSplineMenuActiveState();
        this.hideSplineMenu();
    }

    renderSegmentControls(segments) {
        if (!this.overlayGroup) return;
        this.overlayGroup.innerHTML = '';
        this.segmentMap.clear();
        this.controlPointElements.clear();
        this.controlPointHandleElements.clear();

        segments.forEach((segment) => {
            const segmentInfo = this.segmentInfoMap.get(segment.id) || this.getSegmentInfo(segment);
            this.segmentMap.set(segment.id, segmentInfo);
            const trimmedLine = this.getTrimmedSegmentForOverlay(segmentInfo);
            const overlayLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            overlayLine.setAttribute('x1', trimmedLine.start.x);
            overlayLine.setAttribute('y1', trimmedLine.start.y);
            overlayLine.setAttribute('x2', trimmedLine.end.x);
            overlayLine.setAttribute('y2', trimmedLine.end.y);
            overlayLine.setAttribute('stroke', 'transparent');
            overlayLine.setAttribute('stroke-width', '12');
            overlayLine.setAttribute('pointer-events', 'stroke');
            overlayLine.style.cursor = 'pointer';
            overlayLine.addEventListener('click', (event) => {
                if (!this.layerController.isActive('chassis')) return;
                const svgPoint = this.getSvgPointFromEvent(event);
                if (!svgPoint) return;
                if (this.isNearSegmentEndpoint(svgPoint, segmentInfo)) {
                    return;
                }
                event.stopPropagation();
                this.showLineMenu(segment, svgPoint);
            });
            this.overlayGroup.appendChild(overlayLine);

            const controlPoints = [...this.stateManager.getBodyControlPoints(segment.id)].sort((a, b) => a.t - b.t);
            controlPoints.forEach((point) => {
                const anchor = this.getControlPointWorldPosition(segmentInfo, point);
                const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                circle.setAttribute('cx', anchor.x);
                circle.setAttribute('cy', anchor.y);
                circle.setAttribute('fill', '#ffffff');
                circle.setAttribute('data-body-control-point', 'true');
                circle.dataset.segmentId = segment.id;
                circle.dataset.pointId = point.id.toString();
                this.setSplineDotState(circle, false, SPLINE_DOT_RADIUS, SPLINE_DOT_ACTIVE_RADIUS);
                circle.style.cursor = 'pointer';
                circle.addEventListener('mouseenter', () => this.setSplineDotState(circle, true, SPLINE_DOT_RADIUS, SPLINE_DOT_ACTIVE_RADIUS));
                circle.addEventListener('mouseleave', () => this.setSplineDotState(circle, false, SPLINE_DOT_RADIUS, SPLINE_DOT_ACTIVE_RADIUS));
                circle.addEventListener('mousedown', (event) => {
                    if (!this.layerController.isActive('chassis')) return;
                    event.stopPropagation();
                    event.preventDefault();
                     this.setActiveControlPointHandles(segment.id, point.id);
                    this.startControlPointDrag(segment.id, point.id);
                });
                circle.addEventListener('mouseup', (event) => {
                    if (!this.layerController.isActive('chassis')) return;
                    event.stopPropagation();
                    this.setActiveControlPointHandles(segment.id, point.id);
                    const draggingThisPoint = this.isDraggingControlPoint(segment.id, point.id);
                    if (draggingThisPoint && this.controlPointDragMoved) {
                        this.endControlPointDrag();
                        return;
                    }
                    if (draggingThisPoint) {
                        this.endControlPointDrag();
                    }
                    const latestPoints = this.stateManager
                        .getBodyControlPoints(segment.id)
                        .find((p) => p.id === point.id);
                    if (!latestPoints) return;
                    const latestAnchor = this.getControlPointWorldPosition(segmentInfo, latestPoints);
                    this.showSplineMenu(latestAnchor.x, latestAnchor.y, {
                        type: 'segmentControl',
                        segmentId: segment.id,
                        pointId: point.id
                    });
                });
                const key = this.getControlPointKey(segment.id, point.id);
                this.controlPointElements.set(key, circle);
                if (point.mode !== 'hard') {
                    this.renderControlPointHandles(segment.id, point, anchor, segmentInfo);
                }
                if (this.splineMenuVisible &&
                    this.splineMenuContext?.type === 'segmentControl' &&
                    this.splineMenuContext.segmentId === segment.id &&
                    this.splineMenuContext.pointId === point.id) {
                    this.positionSplineMenu(anchor.x, anchor.y);
                }
                this.overlayGroup.appendChild(circle);
            });
        });

        this.refreshActiveControlPointHandlesVisibility();
    }

    renderControlPointHandles(segmentId, point, anchorPoint, segmentInfo) {
        const definitions = [
            { key: 'handleIn', vector: point.handleIn },
            { key: 'handleOut', vector: point.handleOut }
        ];

        definitions.forEach(({ key, vector }) => {
            if (!vector) return;
            const handleKey = this.getHandleKey(segmentId, point.id, key);
            if (this.controlPointHandleElements.has(handleKey)) {
                return;
            }
            const handlePos = this.getControlPointHandleWorldPosition(segmentInfo, anchorPoint, vector);
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', anchorPoint.x);
            line.setAttribute('y1', anchorPoint.y);
            line.setAttribute('x2', handlePos.x);
            line.setAttribute('y2', handlePos.y);
            line.setAttribute('stroke', 'rgba(255,255,255,0.5)');
            line.setAttribute('stroke-width', '1');
            line.setAttribute('pointer-events', 'none');

            const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            circle.setAttribute('cx', handlePos.x);
            circle.setAttribute('cy', handlePos.y);
            circle.setAttribute('fill', '#e2e8f0');
            circle.setAttribute('data-control-handle', 'true');
            circle.dataset.segmentId = segmentId;
            circle.dataset.pointId = point.id.toString();
            circle.dataset.handleKey = key;
            this.setSplineDotState(circle, false, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
            circle.style.cursor = 'pointer';
            circle.addEventListener('mouseenter', () => this.setSplineDotState(circle, true, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1));
            circle.addEventListener('mouseleave', () => {
                if (!(this.draggingControlPointHandle &&
                    this.draggingControlPointHandle.segmentId === segmentId &&
                    this.draggingControlPointHandle.pointId === point.id &&
                    this.draggingControlPointHandle.handleKey === key)) {
                    this.setSplineDotState(circle, false, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
                }
            });
            circle.addEventListener('mousedown', (event) => {
                if (!this.layerController.isActive('chassis')) return;
                event.stopPropagation();
                event.preventDefault();
                this.setActiveControlPointHandles(segmentId, point.id);
                this.startControlPointHandleDrag(segmentId, point.id, key, event);
            });

            this.controlPointHandleElements.set(handleKey, { circle, line });
            if (!this.isActiveHandleControlPoint(segmentId, point.id)) {
                circle.style.display = 'none';
                line.style.display = 'none';
            }
            this.overlayGroup.appendChild(line);
            this.overlayGroup.appendChild(circle);
        });
    }

    buildBodyProfilePath(segments) {
        let path = '';
        let lastKnot = null;

        segments.forEach((segment) => {
            const segmentInfo = this.getSegmentInfo(segment);
            this.segmentInfoMap.set(segment.id, segmentInfo);
            const knots = this.buildSegmentKnots(segment.id, segmentInfo);
            knots.forEach((knot, index) => {
                if (!lastKnot) {
                    path += `M ${knot.point.x} ${knot.point.y}`;
                    lastKnot = knot;
                    return;
                }
                if (index === 0 && this.pointsAreEqual(lastKnot.point, knot.point)) {
                    return;
                }
                path += this.buildCurveCommand(lastKnot, knot);
                lastKnot = knot;
            });
        });

        return path;
    }

    buildSegmentKnots(segmentId, segmentInfo) {
        const knots = [];
        knots.push({
            t: 0,
            point: segmentInfo.start,
            handleInPoint: null,
            handleOutPoint: null
        });

        const controlPoints = [...this.stateManager.getBodyControlPoints(segmentId)].sort((a, b) => a.t - b.t);
        controlPoints.forEach((cp) => {
            knots.push(this.createControlPointKnot(segmentInfo, cp));
        });

        knots.push({
            t: 1,
            point: segmentInfo.end,
            handleInPoint: null,
            handleOutPoint: null
        });

        return knots.sort((a, b) => a.t - b.t);
    }

    createControlPointKnot(segmentInfo, point) {
        const anchor = this.getControlPointWorldPosition(segmentInfo, point);
        const hasHandles = point.mode !== 'hard';
        const handleInPoint = hasHandles ? this.getControlPointHandleWorldPosition(segmentInfo, anchor, point.handleIn) : null;
        const handleOutPoint = hasHandles ? this.getControlPointHandleWorldPosition(segmentInfo, anchor, point.handleOut) : null;
        return {
            t: Math.max(0, Math.min(1, point.t)),
            point: anchor,
            handleInPoint,
            handleOutPoint
        };
    }

    buildCurveCommand(prev, next) {
        const start = prev.point;
        const end = next.point;
        const control1 = prev.handleOutPoint || start;
        const control2 = next.handleInPoint || end;
        if (!prev.handleOutPoint && !next.handleInPoint) {
            return ` L ${end.x} ${end.y}`;
        }
        return ` C ${control1.x} ${control1.y} ${control2.x} ${control2.y} ${end.x} ${end.y}`;
    }

    pointsAreEqual(a, b) {
        return Math.abs(a.x - b.x) < 0.001 && Math.abs(a.y - b.y) < 0.001;
    }

    startControlPointHandleDrag(segmentId, pointId, handleKey, event) {
        const handleRefs = this.controlPointHandleElements.get(this.getHandleKey(segmentId, pointId, handleKey));
        const svgPoint = this.getSvgPointFromEvent(event);
        if (!handleRefs || !svgPoint) return;
        const handleCx = parseFloat(handleRefs.circle.getAttribute('cx'));
        const handleCy = parseFloat(handleRefs.circle.getAttribute('cy'));
        this.setActiveControlPointHandles(segmentId, pointId);
        this.draggingControlPointHandle = { segmentId, pointId, handleKey };
        this.controlPointHandleDragMoved = false;
        this.controlPointHandleDragOffset = {
            x: svgPoint.x - handleCx,
            y: svgPoint.y - handleCy
        };
        this.setSplineDotState(handleRefs.circle, true, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
        this.hideSplineMenu();
        this.hideLineMenu();
    }

    handleControlPointHandleDrag(svgCoords) {
        if (!this.draggingControlPointHandle) return;
        const { segmentId, pointId, handleKey } = this.draggingControlPointHandle;
        const segmentInfo = this.segmentMap.get(segmentId);
        if (!segmentInfo) return;
        const points = this.stateManager.getBodyControlPoints(segmentId);
        const point = points.find((p) => p.id === pointId);
        if (!point) return;
        const anchor = this.getControlPointWorldPosition(segmentInfo, point);
        const adjusted = {
            x: svgCoords.x - this.controlPointHandleDragOffset.x,
            y: svgCoords.y - this.controlPointHandleDragOffset.y
        };
        const vector = {
            x: adjusted.x - anchor.x,
            y: adjusted.y - anchor.y
        };
        const parallelPx = vector.x * segmentInfo.unit.x + vector.y * segmentInfo.unit.y;
        const perpendicularPx = vector.x * segmentInfo.normal.x + vector.y * segmentInfo.normal.y;
        const values = {
            parallel: parallelPx / SCALE,
            perpendicular: perpendicularPx / SCALE
        };
        this.stateManager.updateBodyControlPointHandle(segmentId, pointId, handleKey, values, {
            symmetricMode: point.mode === 'symmetric',
            silent: true
        });
        this.controlPointHandleDragMoved = true;
        this.updateControlPointVisual(segmentId, pointId);
        this.refreshBodyProfilePath();
    }

    endControlPointHandleDrag() {
        const wasDragging = this.draggingControlPointHandle;
        const moved = this.controlPointHandleDragMoved;
        this.draggingControlPointHandle = null;
        this.controlPointHandleDragMoved = false;
        if (wasDragging && moved) {
            this.stateManager.notify();
        }
        if (wasDragging) {
            const refs = this.controlPointHandleElements.get(this.getHandleKey(wasDragging.segmentId, wasDragging.pointId, wasDragging.handleKey));
            if (refs) {
                this.setSplineDotState(refs.circle, false, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
            }
        }
    }

    updateControlPointVisual(segmentId, pointId) {
        const segmentInfo = this.segmentMap.get(segmentId);
        if (!segmentInfo) return;
        const points = this.stateManager.getBodyControlPoints(segmentId);
        const point = points.find((p) => p.id === pointId);
        if (!point) return;
        const anchor = this.getControlPointWorldPosition(segmentInfo, point);
        const key = this.getControlPointKey(segmentId, pointId);
        const circle = this.controlPointElements.get(key);
        if (circle) {
            circle.setAttribute('cx', anchor.x);
            circle.setAttribute('cy', anchor.y);
        }
        this.updateControlPointHandleVisual(segmentId, pointId, segmentInfo, point, anchor);
    }

    updateControlPointHandleVisual(segmentId, pointId, segmentInfo, point, anchor) {
        const entries = ['handleIn', 'handleOut'];
        entries.forEach((handleKey) => {
            const mapKey = this.getHandleKey(segmentId, pointId, handleKey);
            const refs = this.controlPointHandleElements.get(mapKey);
            if (!refs) {
                if (point.mode !== 'hard') {
                    this.renderControlPointHandles(segmentId, point, anchor, segmentInfo);
                }
                return;
            }
            if (point.mode === 'hard') {
                refs.circle.style.display = 'none';
                refs.line.style.display = 'none';
                return;
            }
            const shouldShow = this.isActiveHandleControlPoint(segmentId, pointId);
            refs.circle.style.display = shouldShow ? '' : 'none';
            refs.line.style.display = shouldShow ? '' : 'none';
            const handlePos = this.getControlPointHandleWorldPosition(segmentInfo, anchor, point[handleKey]);
            refs.circle.setAttribute('cx', handlePos.x);
            refs.circle.setAttribute('cy', handlePos.y);
            refs.line.setAttribute('x1', anchor.x);
            refs.line.setAttribute('y1', anchor.y);
            refs.line.setAttribute('x2', handlePos.x);
            refs.line.setAttribute('y2', handlePos.y);
        });
    }

    isActiveHandleControlPoint(segmentId, pointId) {
        if (!this.activeHandleControlPoint) return false;
        return this.activeHandleControlPoint.segmentId === segmentId &&
            this.activeHandleControlPoint.pointId === pointId;
    }

    setActiveControlPointHandles(segmentId, pointId) {
        const current = this.activeHandleControlPoint;
        if (current &&
            current.segmentId === segmentId &&
            current.pointId === pointId) {
            this.toggleControlPointHandles(segmentId, pointId, true);
            return;
        }
        if (current) {
            this.toggleControlPointHandles(current.segmentId, current.pointId, false);
        }
        this.activeHandleControlPoint = { segmentId, pointId };
        this.toggleControlPointHandles(segmentId, pointId, true);
    }

    clearActiveControlPointHandles() {
        if (!this.activeHandleControlPoint) return;
        const { segmentId, pointId } = this.activeHandleControlPoint;
        this.toggleControlPointHandles(segmentId, pointId, false);
        this.activeHandleControlPoint = null;
    }

    toggleControlPointHandles(segmentId, pointId, visible) {
        const points = this.stateManager.getBodyControlPoints(segmentId);
        const point = points.find((p) => p.id === pointId);
        if (!point || point.mode === 'hard') return false;
        ['handleIn', 'handleOut'].forEach((handleKey) => {
            const refs = this.controlPointHandleElements.get(this.getHandleKey(segmentId, pointId, handleKey));
            if (!refs) return;
            const display = visible ? '' : 'none';
            refs.circle.style.display = display;
            refs.line.style.display = display;
        });
        return true;
    }

    refreshActiveControlPointHandlesVisibility() {
        if (!this.activeHandleControlPoint) return;
        const didShow = this.toggleControlPointHandles(this.activeHandleControlPoint.segmentId, this.activeHandleControlPoint.pointId, true);
        if (!didShow) {
            this.activeHandleControlPoint = null;
        }
    }

    deleteSplineControlPoint() {
        if (!this.splineMenuContext || this.splineMenuContext.type !== 'segmentControl') {
            return;
        }
        this.stateManager.removeBodyControlPoint(this.splineMenuContext.segmentId, this.splineMenuContext.pointId);
        this.hideSplineMenu();
    }

    createMenuElement() {
        const menu = document.createElement('div');
        menu.className = 'spline-menu';
        menu.style.display = 'none';
        return menu;
    }

    addSplineMenuOptions() {
        SPLINE_MENU_OPTIONS.forEach((option) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.textContent = option.label;
            button.dataset.type = option.type;
            button.addEventListener('click', (event) => {
                event.stopPropagation();
                this.setSplineType(option.type);
            });
            this.splineMenu.appendChild(button);
        });

        const deleteButton = document.createElement('button');
        deleteButton.type = 'button';
        deleteButton.textContent = 'Remove control point';
        deleteButton.classList.add('menu-button-danger');
        deleteButton.addEventListener('click', (event) => {
            event.stopPropagation();
            this.deleteSplineControlPoint();
        });
        this.splineMenu.appendChild(deleteButton);
    }

    showLineMenu(segment, svgCoords) {
        if (!this.layerController.isActive('chassis')) return;
        const points = this.stateManager.getBodyControlPoints(segment.id);
        this.pendingSegmentInteraction = {
            segmentId: segment.id,
            start: segment.start,
            end: segment.end,
            click: svgCoords
        };
        this.lineMenuButton.disabled = points.length >= MAX_CONTROL_POINTS_PER_SEGMENT;
        this.positionMenuElement(this.lineMenu, svgCoords.x, svgCoords.y);
        this.lineMenu.style.display = 'flex';
    }

    hideLineMenu() {
        this.lineMenu.style.display = 'none';
        this.pendingSegmentInteraction = null;
    }

    handleAddControlPoint() {
        if (!this.pendingSegmentInteraction) return;
        const { segmentId, start, end, click } = this.pendingSegmentInteraction;
        const t = this.projectPointToSegment(click, start, end);
        this.stateManager.addBodyControlPoint(segmentId, t);
        this.hideLineMenu();
    }

    startControlPointDrag(segmentId, pointId) {
        this.draggingControlPoint = { segmentId, pointId };
        this.controlPointDragMoved = false;
        this.hideLineMenu();
        this.hideSplineMenu();
    }

    endControlPointDrag() {
        const wasDragging = this.draggingControlPoint;
        const moved = this.controlPointDragMoved;
        this.draggingControlPoint = null;
        this.controlPointDragMoved = false;
        if (wasDragging && moved) {
            this.stateManager.notify();
        }
    }

    isDraggingControlPoint(segmentId, pointId) {
        if (!this.draggingControlPoint) return false;
        return this.draggingControlPoint.segmentId === segmentId &&
            this.draggingControlPoint.pointId === pointId;
    }

    handleControlPointDrag(svgCoords) {
        if (!this.draggingControlPoint) return;
        const segmentInfo = this.segmentMap.get(this.draggingControlPoint.segmentId);
        if (!segmentInfo) return;
        const points = this.stateManager.getBodyControlPoints(this.draggingControlPoint.segmentId);
        const point = points.find((p) => p.id === this.draggingControlPoint.pointId);
        if (!point) return;
        const relative = this.convertWorldPointToRelative(segmentInfo, svgCoords);
        const prevT = point.t;
        const prevParallel = point.offsetParallel;
        const prevPerp = point.offsetPerpendicular;
        this.stateManager.updateBodyControlPoint(
            this.draggingControlPoint.segmentId,
            this.draggingControlPoint.pointId,
            {
                t: relative.t,
                offsetParallel: relative.offsetParallel,
                offsetPerpendicular: relative.offsetPerpendicular
            },
            { silent: true }
        );
        this.updateControlPointVisual(this.draggingControlPoint.segmentId, this.draggingControlPoint.pointId);
        this.refreshBodyProfilePath();
        if (Math.abs(relative.t - prevT) > 0.0005 ||
            Math.abs(relative.offsetPerpendicular - prevPerp) > 0.0005 ||
            Math.abs(relative.offsetParallel - prevParallel) > 0.0005) {
            this.controlPointDragMoved = true;
        }
    }

    getControlPointKey(segmentId, pointId) {
        return `${segmentId}:${pointId}`;
    }

    getHandleKey(segmentId, pointId, handleKey) {
        return `${segmentId}:${pointId}:${handleKey}`;
    }

    getControlPointMode(segmentId, pointId) {
        const points = this.stateManager.getBodyControlPoints(segmentId);
        const point = points.find((p) => p.id === pointId);
        return point?.mode || 'hard';
    }

    getSegmentInfo(segment) {
        const dx = segment.end.x - segment.start.x;
        const dy = segment.end.y - segment.start.y;
        const lengthPx = Math.sqrt(dx * dx + dy * dy) || 1;
        const unit = { x: dx / lengthPx, y: dy / lengthPx };
        const normal = { x: -unit.y, y: unit.x };
        return {
            start: segment.start,
            end: segment.end,
            lengthPx,
            lengthMm: lengthPx / SCALE,
            unit,
            normal
        };
    }

    convertWorldPointToRelative(segmentInfo, point) {
        const vector = {
            x: point.x - segmentInfo.start.x,
            y: point.y - segmentInfo.start.y
        };
        const distanceAlong = vector.x * segmentInfo.unit.x + vector.y * segmentInfo.unit.y;
        const clampedDistance = Math.max(0, Math.min(segmentInfo.lengthPx, distanceAlong));
        const t = segmentInfo.lengthPx === 0 ? 0 : clampedDistance / segmentInfo.lengthPx;
        const parallelOffsetPx = distanceAlong - clampedDistance;
        const perpendicularPx = vector.x * segmentInfo.normal.x + vector.y * segmentInfo.normal.y;
        return {
            t,
            offsetParallel: parallelOffsetPx / SCALE,
            offsetPerpendicular: perpendicularPx / SCALE
        };
    }

    getControlPointWorldPosition(segmentInfo, point) {
        const distancePx = point.t * segmentInfo.lengthPx;
        const basePoint = {
            x: segmentInfo.start.x + segmentInfo.unit.x * distancePx,
            y: segmentInfo.start.y + segmentInfo.unit.y * distancePx
        };
        const offsetParallelPx = (point.offsetParallel || 0) * SCALE;
        const offsetPerpendicularPx = (point.offsetPerpendicular || 0) * SCALE;
        return {
            x: basePoint.x + segmentInfo.unit.x * offsetParallelPx + segmentInfo.normal.x * offsetPerpendicularPx,
            y: basePoint.y + segmentInfo.unit.y * offsetParallelPx + segmentInfo.normal.y * offsetPerpendicularPx
        };
    }

    getControlPointHandleWorldPosition(segmentInfo, anchorPoint, handle) {
        const parallelPx = (handle.parallel || 0) * SCALE;
        const perpendicularPx = (handle.perpendicular || 0) * SCALE;
        return {
            x: anchorPoint.x + segmentInfo.unit.x * parallelPx + segmentInfo.normal.x * perpendicularPx,
            y: anchorPoint.y + segmentInfo.unit.y * parallelPx + segmentInfo.normal.y * perpendicularPx
        };
    }

    getTrimmedSegmentForOverlay(segmentInfo, gapPx = 20) {
        const maxTrim = Math.min(gapPx, (segmentInfo.lengthPx / 2) - 0.1);
        if (maxTrim <= 0) {
            return {
                start: segmentInfo.start,
                end: segmentInfo.end
            };
        }
        return {
            start: {
                x: segmentInfo.start.x + segmentInfo.unit.x * maxTrim,
                y: segmentInfo.start.y + segmentInfo.unit.y * maxTrim
            },
            end: {
                x: segmentInfo.end.x - segmentInfo.unit.x * maxTrim,
                y: segmentInfo.end.y - segmentInfo.unit.y * maxTrim
            }
        };
    }

    isNearSegmentEndpoint(point, segmentInfo, radiusPx = 20) {
        const radiusSq = radiusPx * radiusPx;
        return this.distanceSquared(point, segmentInfo.start) < radiusSq ||
            this.distanceSquared(point, segmentInfo.end) < radiusSq;
    }

    distanceSquared(a, b) {
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        return dx * dx + dy * dy;
    }

    positionMenuElement(menu, svgX, svgY) {
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return;
        const pt = this.svg.createSVGPoint();
        pt.x = svgX;
        pt.y = svgY;
        const screenPoint = pt.matrixTransform(ctm);
        const canvasRect = this.canvasArea.getBoundingClientRect();
        menu.style.left = `${screenPoint.x - canvasRect.left + 12}px`;
        menu.style.top = `${screenPoint.y - canvasRect.top - 12}px`;
    }

    getSvgPointFromEvent(event) {
        const ctm = this.svg.getScreenCTM();
        if (!ctm) return null;
        const pt = this.svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        return pt.matrixTransform(ctm.inverse());
    }

    projectPointToSegment(point, start, end) {
        const vx = end.x - start.x;
        const vy = end.y - start.y;
        const wx = point.x - start.x;
        const wy = point.y - start.y;
        const lenSq = (vx * vx) + (vy * vy);
        if (lenSq === 0) return 0;
        const t = (vx * wx + vy * wy) / lenSq;
        return Math.max(0, Math.min(1, t));
    }

    getFrontOverhangGeometry(state, frontWheelX, wheelY, tireRadiusPx) {
        const frontApproachAngleRad = state.frontApproachAngle * Math.PI / 180;
        const theta = (Math.PI / 2) + frontApproachAngleRad;
        return {
            tangentPoint: {
                x: frontWheelX + tireRadiusPx * Math.cos(theta),
                y: wheelY + tireRadiusPx * Math.sin(theta)
            },
            direction: {
                x: -Math.sin(theta),
                y: Math.cos(theta)
            }
        };
    }

    getRearOverhangGeometry(state, rearWheelX, wheelY, tireRadiusPx) {
        const rearDepartureAngleRad = state.rearDepartureAngle * Math.PI / 180;
        const theta = (Math.PI / 2) - rearDepartureAngleRad;
        return {
            tangentPoint: {
                x: rearWheelX + tireRadiusPx * Math.cos(theta),
                y: wheelY + tireRadiusPx * Math.sin(theta)
            },
            direction: {
                x: Math.sin(theta),
                y: -Math.cos(theta)
            }
        };
    }

    projectPointOntoLine(point, linePoint, direction) {
        const px = point.x - linePoint.x;
        const py = point.y - linePoint.y;
        const projection = px * direction.x + py * direction.y;
        return {
            x: linePoint.x + direction.x * projection,
            y: linePoint.y + direction.y * projection
        };
    }

    getLineYFromX(linePoint, direction, targetX) {
        if (Math.abs(direction.x) < 0.0001) {
            return linePoint.y;
        }
        const slope = direction.y / direction.x;
        return linePoint.y + slope * (targetX - linePoint.x);
    }

    getPointOnSegment(segment, t) {
        return {
            x: segment.start.x + (segment.end.x - segment.start.x) * t,
            y: segment.start.y + (segment.end.y - segment.start.y) * t
        };
    }

    refreshBodyProfilePath() {
        if (!this.bodyProfilePathElement || !this.latestSegments) return;
        const path = this.buildBodyProfilePath(this.latestSegments);
        this.bodyProfilePathElement.setAttribute('d', path);
    }
}

