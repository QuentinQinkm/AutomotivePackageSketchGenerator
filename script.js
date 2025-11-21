document.addEventListener('DOMContentLoaded', () => {
    const svg = document.getElementById('carCanvas');
    const drawingGroup = document.getElementById('drawingGroup');
    const canvasArea = document.getElementById('canvasArea');
    const toggleImageButton = document.getElementById('toggleImageEdit');
    const imageControls = document.getElementById('imageControls');
    const imageUploadInput = document.getElementById('imageUpload');
    const deleteImageBtn = document.getElementById('deleteImage');
    const opacitySlider = document.getElementById('imageOpacity');
    const imageFrame = document.getElementById('imageFrame');
    const overlayImage = document.getElementById('overlayImage');
    const resizeHandle = document.getElementById('resizeHandle');
    const flipImageBtn = document.getElementById('flipImage');
    const rotationSlider = document.getElementById('imageRotate');
    const imageToolbar = document.querySelector('.image-toolbar');

    const pointTooltip = document.createElement('div');
    pointTooltip.className = 'point-tooltip';
    canvasArea.appendChild(pointTooltip);

    const splineMenu = document.createElement('div');
    splineMenu.className = 'spline-menu';
    splineMenu.style.display = 'none';
    canvasArea.appendChild(splineMenu);

    const COLOR_FRONT_POINT = '#10b981';
    const COLOR_REAR_POINT = '#f97316';
    const COLOR_BLUE = '#38bdf8';
    const DOT_RADIUS = 3.5;
    const DOT_RADIUS_ACTIVE = 5;
    const SPLINE_DOT_RADIUS = 2;
    const SPLINE_DOT_ACTIVE_RADIUS = 3;
    const SPLINE_HANDLE_RADIUS = 2;

    function setDotVisualState(element, isActive) {
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

    function setSplineDotState(element, isActive, baseRadius = SPLINE_DOT_RADIUS, activeRadius = SPLINE_DOT_ACTIVE_RADIUS) {
        if (!element) return;
        element.setAttribute('r', (isActive ? activeRadius : baseRadius).toString());
        element.setAttribute('stroke', isActive ? 'white' : 'none');
        if (isActive) {
            element.setAttribute('stroke-width', '1');
        } else {
            element.removeAttribute('stroke-width');
        }
    }

    const BODY_POINT_CONFIG = {
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

    const splineMenuOptions = [
        { type: 'hard', label: 'Hard Angle' },
        { type: 'symmetric', label: 'Symmetric' },
        { type: 'asymmetric', label: 'Asymmetric' }
    ];

    splineMenuOptions.forEach(option => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = option.label;
        button.dataset.type = option.type;
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            setSplineType(option.type);
        });
        splineMenu.appendChild(button);
    });

    let splineMenuVisible = false;
    let ignoreNextDocumentClick = false;

    let tooltipPointKey = null;
    let splineMenuAnchorPx = { x: 0, y: 0 };


    // Inputs
    const tireDiameterInput = document.getElementById('tireDiameter');
    const wheelArchGapInput = document.getElementById('wheelArchGap');
    const wheelBaseInput = document.getElementById('wheelBase');
    const groundClearanceInput = document.getElementById('groundClearance');
    const floorThicknessInput = document.getElementById('floorThickness');
    const frontOverhangInput = document.getElementById('frontOverhang');
    const rearOverhangInput = document.getElementById('rearOverhang');
    const frontApproachAngleInput = document.getElementById('frontApproachAngle');
    const rearDepartureAngleInput = document.getElementById('rearDepartureAngle');
    const hPointHeightInput = document.getElementById('hPointHeight');
    const hPointXInput = document.getElementById('hPointX');
    const hipPedalDistanceInput = document.getElementById('hipPedalDistance');
    const bodyReclineAngleInput = document.getElementById('bodyReclineAngle');
    const handHeightInput = document.getElementById('handHeight');
    const handDistanceXInput = document.getElementById('handDistanceX');
    const mannequinHeightInput = document.getElementById('mannequinHeight');
    const showMannequinInput = document.getElementById('showMannequin');

    const wheelBaseMinMM = parseInt(wheelBaseInput.min, 10);
    const wheelBaseMaxMM = parseInt(wheelBaseInput.max, 10);

    // Value Displays
    const tireDiameterVal = document.getElementById('tireDiameterVal');
    const wheelArchGapVal = document.getElementById('wheelArchGapVal');
    const wheelBaseVal = document.getElementById('wheelBaseVal');
    const groundClearanceVal = document.getElementById('groundClearanceVal');
    const floorThicknessVal = document.getElementById('floorThicknessVal');
    const frontOverhangVal = document.getElementById('frontOverhangVal');
    const rearOverhangVal = document.getElementById('rearOverhangVal');
    const frontApproachAngleVal = document.getElementById('frontApproachAngleVal');
    const rearDepartureAngleVal = document.getElementById('rearDepartureAngleVal');
    const hPointHeightVal = document.getElementById('hPointHeightVal');
    const hPointXVal = document.getElementById('hPointXVal');
    const hipPedalDistanceVal = document.getElementById('hipPedalDistanceVal');
    const bodyReclineAngleVal = document.getElementById('bodyReclineAngleVal');
    const handHeightVal = document.getElementById('handHeightVal');
    const handDistanceXVal = document.getElementById('handDistanceXVal');

    // State
    let state = {
        tireDiameter: parseInt(tireDiameterInput.value),
        wheelArchGap: parseInt(wheelArchGapInput.value),
        wheelBase: parseInt(wheelBaseInput.value),
        groundClearance: parseInt(groundClearanceInput.value),
        floorThickness: parseInt(floorThicknessInput.value),
        frontOverhang: parseInt(frontOverhangInput.value),
        rearOverhang: parseInt(rearOverhangInput.value),
        frontApproachAngle: parseInt(frontApproachAngleInput.value),
        rearDepartureAngle: parseInt(rearDepartureAngleInput.value),
        frontFaceBreakX: 775,
        frontFaceBreakY: 525,
        bonnetEndX: -365,
        bonnetEndY: 660,
        windowEndX: -1445,
        windowEndY: 1125,
        rooftopEndX: -195,
        rooftopEndY: 1130,
        rearWindowEndX: -500,
        rearWindowEndY: 775,
        bumperEndX: -890,
        bumperEndY: 535,
        bonnetSplineX: 150,
        bonnetSplineY: 900,
        bonnetSplineType: 'hard',
        bonnetSplineHandleInX: -200,
        bonnetSplineHandleInY: 0,
        bonnetSplineHandleOutX: 200,
        bonnetSplineHandleOutY: 0,
        hPointHeight: parseInt(hPointHeightInput.value),
        hPointX: parseInt(hPointXInput.value),
        hipPedalDistance: parseInt(hipPedalDistanceInput.value),
        bodyReclineAngle: parseInt(bodyReclineAngleInput.value),
        handHeight: parseInt(handHeightInput.value),
        handDistanceX: parseInt(handDistanceXInput.value),
        mannequinHeight: parseInt(mannequinHeightInput.value),
        showMannequin: showMannequinInput.checked
    };

    let imageEditActive = false;
    let hasImageOverlay = false;
    let imageFlipped = false;
    let imageRotation = 0;
    let dragState = null;
    let resizeState = null;
    const MIN_FRAME_WIDTH = 120;
    const MIN_FRAME_HEIGHT = 80;

    // Constants for scaling (mm to pixels)
    const SCALE = 0.1;
    const GROUND_Y = 300;
    const CENTER_X = 400;

    // Asset Coordinates (Relative to Hip-Joint Parent Top-Left)
    // Parent Offset: Left 397, Top 99
    const ASSET_COORDS = {
        parentOffset: { x: 397, y: 99 },
        hip: { x: 591.97, y: 542.85 },
        knee: { x: 284.26, y: 515.53 },
        heel: { x: 73, y: 832 },
        head: { x: 818, y: 0 },
        shoulder: { x: 759.49, y: 224.21 },
        elbow: { x: 557.38, y: 331.64 },
        hand: { x: 256, y: 307 }
    };

    // Pivot Points for Rotation (Relative to the Image itself)
    const ASSET_PIVOTS = {
        body: { x: 51.74, y: 531.88 },
        bigArm: { x: 216.68, y: 23.67 },
        smallArm: { x: 322.46, y: 46.88 },
        bigLeg: { x: 331.38, y: 61.91 },
        smallLeg: { x: 356.26, y: 27.31 }
    };

    function getReferenceX(reference, frontWheelX, rearWheelX) {
        return reference === 'rear' ? rearWheelX : frontWheelX;
    }

    function getPointPosition(pointKey, frontWheelX, rearWheelX, wheelY) {
        const config = BODY_POINT_CONFIG[pointKey];
        if (!config) {
            return { x: 0, y: 0 };
        }
        const referenceX = getReferenceX(config.reference, frontWheelX, rearWheelX);
        return {
            x: referenceX - (state[config.xKey] * SCALE),
            y: wheelY - (state[config.yKey] * SCALE)
        };
    }

    function getSplineAnchorPx(frontWheelX, wheelY) {
        return {
            x: frontWheelX - (state.bonnetSplineX * SCALE),
            y: wheelY - (state.bonnetSplineY * SCALE)
        };
    }

    function getSplineHandlePx(handleX, handleY, anchorPx) {
        return {
            x: anchorPx.x - (handleX * SCALE),
            y: anchorPx.y - (handleY * SCALE)
        };
    }

    function formatTooltipText(pointKey) {
        const config = BODY_POINT_CONFIG[pointKey];
        if (!config) return '';
        const originLabel = config.reference === 'rear' ? 'Rear axle' : 'Front axle';
        const xVal = state[config.xKey];
        const yVal = state[config.yKey];
        return `${config.label} • ${originLabel} • X: ${xVal}mm • Y: ${yVal}mm`;
    }

    function positionTooltipAt(svgX, svgY) {
        if (!svg) return;
        const pt = svg.createSVGPoint();
        pt.x = svgX;
        pt.y = svgY;
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const screenPoint = pt.matrixTransform(ctm);
        const canvasRect = canvasArea.getBoundingClientRect();
        pointTooltip.style.left = `${screenPoint.x - canvasRect.left}px`;
        pointTooltip.style.top = `${screenPoint.y - canvasRect.top - 12}px`;
    }

    function updatePointTooltip(pointKey, svgX, svgY) {
        if (!pointKey) return;
        pointTooltip.textContent = formatTooltipText(pointKey);
        positionTooltipAt(svgX, svgY);
    }

    function showPointTooltip(pointKey, svgX, svgY) {
        if (!pointKey) return;
        tooltipPointKey = pointKey;
        updatePointTooltip(pointKey, svgX, svgY);
        pointTooltip.style.display = 'block';
    }

    function hidePointTooltip(pointKey) {
        if (pointKey && tooltipPointKey && tooltipPointKey !== pointKey) {
            return;
        }
        tooltipPointKey = null;
        pointTooltip.style.display = 'none';
    }

    function positionSplineMenu(anchorPxX, anchorPxY) {
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const pt = svg.createSVGPoint();
        pt.x = anchorPxX;
        pt.y = anchorPxY;
        const screenPoint = pt.matrixTransform(ctm);
        const canvasRect = canvasArea.getBoundingClientRect();
        splineMenu.style.left = `${screenPoint.x - canvasRect.left + 12}px`;
        splineMenu.style.top = `${screenPoint.y - canvasRect.top - 12}px`;
    }

    function updateSplineMenuActiveState() {
        splineMenu.querySelectorAll('button').forEach((button) => {
            button.classList.toggle('active', button.dataset.type === state.bonnetSplineType);
        });
    }

    function showSplineMenu(anchorPxX, anchorPxY) {
        splineMenuAnchorPx = { x: anchorPxX, y: anchorPxY };
        positionSplineMenu(anchorPxX, anchorPxY);
        updateSplineMenuActiveState();
        splineMenu.style.display = 'flex';
        splineMenuVisible = true;
        ignoreNextDocumentClick = true;
    }

    function hideSplineMenu() {
        splineMenu.style.display = 'none';
        splineMenuVisible = false;
    }

    document.addEventListener('click', (event) => {
        if (!splineMenuVisible) return;
        if (ignoreNextDocumentClick) {
            ignoreNextDocumentClick = false;
            return;
        }
        if (splineMenu.contains(event.target)) return;
        hideSplineMenu();
    });

    function ensureSplineHandlesDefaults() {
        if (state.bonnetSplineHandleInX === 0 && state.bonnetSplineHandleInY === 0 &&
            state.bonnetSplineHandleOutX === 0 && state.bonnetSplineHandleOutY === 0) {
            state.bonnetSplineHandleInX = -150;
            state.bonnetSplineHandleInY = 0;
            state.bonnetSplineHandleOutX = 150;
            state.bonnetSplineHandleOutY = 0;
        }
    }

    function setSplineType(type) {
        state.bonnetSplineType = type;
        if (type === 'hard') {
            state.bonnetSplineHandleInX = 0;
            state.bonnetSplineHandleInY = 0;
            state.bonnetSplineHandleOutX = 0;
            state.bonnetSplineHandleOutY = 0;
        } else if (type === 'symmetric') {
            ensureSplineHandlesDefaults();
            state.bonnetSplineHandleInX = -state.bonnetSplineHandleOutX;
            state.bonnetSplineHandleInY = -state.bonnetSplineHandleOutY;
        } else {
            ensureSplineHandlesDefaults();
        }
        updateSplineMenuActiveState();
        hideSplineMenu();
        draw();
    }


    function updateState() {
        state.tireDiameter = parseInt(tireDiameterInput.value);
        state.wheelArchGap = parseInt(wheelArchGapInput.value);
        state.wheelBase = parseInt(wheelBaseInput.value);
        state.groundClearance = parseInt(groundClearanceInput.value);
        state.floorThickness = parseInt(floorThicknessInput.value);
        state.frontOverhang = parseInt(frontOverhangInput.value);
        state.rearOverhang = parseInt(rearOverhangInput.value);
        state.frontApproachAngle = parseInt(frontApproachAngleInput.value);
        state.rearDepartureAngle = parseInt(rearDepartureAngleInput.value);
        // frontFaceBreakX/Y are now updated via drag, not inputs
        state.hPointHeight = parseInt(hPointHeightInput.value);
        state.hPointX = parseInt(hPointXInput.value);
        state.hipPedalDistance = parseInt(hipPedalDistanceInput.value);
        state.bodyReclineAngle = parseInt(bodyReclineAngleInput.value);
        state.handHeight = parseInt(handHeightInput.value);
        state.handDistanceX = parseInt(handDistanceXInput.value);
        state.mannequinHeight = parseInt(mannequinHeightInput.value);
        state.showMannequin = showMannequinInput.checked;

        tireDiameterVal.textContent = `${state.tireDiameter}mm`;
        wheelArchGapVal.textContent = `${state.wheelArchGap}mm`;
        wheelBaseVal.textContent = `${state.wheelBase}mm`;
        groundClearanceVal.textContent = `${state.groundClearance}mm`;
        floorThicknessVal.textContent = `${state.floorThickness}mm`;
        frontOverhangVal.textContent = `${state.frontOverhang}mm`;
        rearOverhangVal.textContent = `${state.rearOverhang}mm`;
        frontApproachAngleVal.textContent = `${state.frontApproachAngle}°`;
        rearDepartureAngleVal.textContent = `${state.rearDepartureAngle}°`;
        hPointHeightVal.textContent = `${state.hPointHeight}mm`;
        hPointXVal.textContent = `${state.hPointX}mm`;
        hipPedalDistanceVal.textContent = `${state.hipPedalDistance}mm`;
        bodyReclineAngleVal.textContent = `${state.bodyReclineAngle}°`;
        handHeightVal.textContent = `${state.handHeight}mm`;
        handDistanceXVal.textContent = `${state.handDistanceX}mm`;

        draw();
        updateHumanFigurePosition();
    }

    function draw() {
        // Clear previous drawing
        drawingGroup.innerHTML = '';

        const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
        const wheelArchGapPx = state.wheelArchGap * SCALE;
        const wheelBasePx = state.wheelBase * SCALE;
        const groundClearancePx = state.groundClearance * SCALE;
        const floorThicknessPx = state.floorThickness * SCALE;
        const hPointHeightPx = state.hPointHeight * SCALE;

        // Calculate positions (FLIPPED: Front is LEFT)
        // Front Wheel is LEFT (smaller X), Rear Wheel is RIGHT (larger X)
        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const rearWheelX = CENTER_X + (wheelBasePx / 2);
        const wheelY = GROUND_Y - tireRadiusPx;

        // Calculate Chassis and Floor Y positions
        const chassisBottomY = GROUND_Y - groundClearancePx;
        const floorY = chassisBottomY - floorThicknessPx;

        // --- Draw Body Contour (Arches + Rocker Panel) ---
        // Arch Radius = Tire Radius + Gap
        const archRadius = tireRadiusPx + wheelArchGapPx;

        const dy = chassisBottomY - wheelY;
        let dx = 0;
        if (archRadius > Math.abs(dy)) {
            dx = Math.sqrt(archRadius * archRadius - dy * dy);
        } else {
            dx = 0;
        }

        // Front Arch (Left)
        const frontArchStartX = frontWheelX - dx;
        const frontArchEndX = frontWheelX + dx;

        // Rear Arch (Right)
        const rearArchStartX = rearWheelX - dx;
        const rearArchEndX = rearWheelX + dx;

        // Determine large-arc-flag
        const largeArcFlag = (dy > 0) ? 1 : 0;

        // Path: Start at Front Arch Start -> Front Arch End -> Rear Arch Start -> Rear Arch End
        // Note: Arches are drawn clockwise (sweep-flag 1)
        const pathD = `
            M ${frontArchStartX} ${chassisBottomY}
            A ${archRadius} ${archRadius} 0 ${largeArcFlag} 1 ${frontArchEndX} ${chassisBottomY}
            L ${rearArchStartX} ${chassisBottomY}
            A ${archRadius} ${archRadius} 0 ${largeArcFlag} 1 ${rearArchEndX} ${chassisBottomY}
        `;

        const bodyContour = document.createElementNS("http://www.w3.org/2000/svg", "path");
        bodyContour.setAttribute("d", pathD);
        bodyContour.setAttribute("stroke", "#38bdf8"); // Accent color
        bodyContour.setAttribute("stroke-width", "2");
        bodyContour.setAttribute("fill", "none");
        drawingGroup.appendChild(bodyContour);

        // --- Draw Floor Line ---
        const floorLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        floorLine.setAttribute("x1", frontArchStartX);
        floorLine.setAttribute("y1", floorY);
        floorLine.setAttribute("x2", rearArchEndX);
        floorLine.setAttribute("y2", floorY);
        floorLine.setAttribute("stroke", "#f8fafc"); // Primary text color
        floorLine.setAttribute("stroke-width", "2");
        floorLine.setAttribute("stroke-dasharray", "4, 4");
        drawingGroup.appendChild(floorLine);

        // --- Draw Wheel Tangent Lines (Approach/Departure Angles) ---
        const frontApproachAngleRad = state.frontApproachAngle * Math.PI / 180;
        const rearDepartureAngleRad = state.rearDepartureAngle * Math.PI / 180;
        const lineLength = 200; // pixels to extend in each direction

        // --- Front Wheel Tangent (Left Side) ---
        // 0 deg = Bottom (90 deg in SVG), 90 deg = Left (180 deg in SVG)
        // Theta increases from 90 to 180 (Clockwise rotation of point to lift line)
        const frontTheta = (Math.PI / 2) + frontApproachAngleRad;

        // Contact Point on Tire
        const frontTangentX = frontWheelX + tireRadiusPx * Math.cos(frontTheta);
        const frontTangentY = wheelY + tireRadiusPx * Math.sin(frontTheta);

        // Tangent Vector (Perpendicular to Radius)
        // Radius vector is (cos, sin), so Tangent is (-sin, cos) for lifting up-left
        const frontDx = -Math.sin(frontTheta);
        const frontDy = Math.cos(frontTheta);

        const frontTangentLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        frontTangentLine.setAttribute("x1", frontTangentX - lineLength * frontDx);
        frontTangentLine.setAttribute("y1", frontTangentY - lineLength * frontDy);
        frontTangentLine.setAttribute("x2", frontTangentX + lineLength * frontDx);
        frontTangentLine.setAttribute("y2", frontTangentY + lineLength * frontDy);
        frontTangentLine.setAttribute("stroke", "rgba(148, 163, 184, 0.5)");
        frontTangentLine.setAttribute("stroke-width", "2");
        frontTangentLine.setAttribute("stroke-dasharray", "5, 5");
        drawingGroup.appendChild(frontTangentLine);

        // --- Rear Wheel Tangent (Right Side) ---
        // 0 deg = Bottom (90 deg in SVG), 90 deg = Right (0 deg in SVG)
        // Theta decreases from 90 to 0 (Counter-Clockwise rotation of point)
        const rearTheta = (Math.PI / 2) - rearDepartureAngleRad;

        // Contact Point on Tire
        const rearTangentX = rearWheelX + tireRadiusPx * Math.cos(rearTheta);
        const rearTangentY = wheelY + tireRadiusPx * Math.sin(rearTheta);

        // Tangent Vector (Perpendicular to Radius)
        // Radius vector is (cos, sin), so Tangent is (sin, -cos) for lifting up-right
        const rearDx = Math.sin(rearTheta);
        const rearDy = -Math.cos(rearTheta);

        const rearTangentLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        rearTangentLine.setAttribute("x1", rearTangentX - lineLength * rearDx);
        rearTangentLine.setAttribute("y1", rearTangentY - lineLength * rearDy);
        rearTangentLine.setAttribute("x2", rearTangentX + lineLength * rearDx);
        rearTangentLine.setAttribute("y2", rearTangentY + lineLength * rearDy);
        rearTangentLine.setAttribute("stroke", "rgba(148, 163, 184, 0.5)");
        rearTangentLine.setAttribute("stroke-width", "2");
        rearTangentLine.setAttribute("stroke-dasharray", "5, 5");
        drawingGroup.appendChild(rearTangentLine);

        // --- Draw Bumper Connection Lines ---
        // Front Overhang Anchor
        // Find point on front tangent line where x = frontWheelX - frontOverhang
        // Line Eq: y - y1 = m * (x - x1) => y = y1 + m * (x - x1)
        const frontOverhangPx = state.frontOverhang * SCALE;
        const targetFrontX = frontWheelX - frontOverhangPx;

        // Calculate slope m = dy/dx
        // Avoid division by zero if vertical (90 deg)
        let targetFrontY;
        if (Math.abs(frontDx) > 0.001) {
            const mFront = frontDy / frontDx;
            targetFrontY = frontTangentY + mFront * (targetFrontX - frontTangentX);
        } else {
            // Vertical line case: just project Y from tangent point (approximation)
            // or clamp to ground/chassis. For now, let's use the tangent Y 
            // but realistically this case is physically impossible if overhang > radius
            targetFrontY = frontTangentY;
        }

        // Draw Line from Anchor to Front Arch Start
        const frontBumperLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        frontBumperLine.setAttribute("x1", targetFrontX);
        frontBumperLine.setAttribute("y1", targetFrontY);
        frontBumperLine.setAttribute("x2", frontArchStartX);
        frontBumperLine.setAttribute("y2", chassisBottomY); // Arch start is at chassis bottom
        frontBumperLine.setAttribute("stroke", "#38bdf8");
        frontBumperLine.setAttribute("stroke-width", "2");
        drawingGroup.appendChild(frontBumperLine);

        // --- Draw Front Face Line ---
        // Connects the front overhang anchor (targetFrontX, targetFrontY)
        // to the Front Face Break Point
        const frontFaceBreakPos = getPointPosition('frontFaceBreak', frontWheelX, rearWheelX, wheelY);
        const breakPointX = frontFaceBreakPos.x;
        const breakPointY = frontFaceBreakPos.y;

        const frontFaceLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        frontFaceLine.setAttribute("x1", targetFrontX);
        frontFaceLine.setAttribute("y1", targetFrontY);
        frontFaceLine.setAttribute("x2", breakPointX);
        frontFaceLine.setAttribute("y2", breakPointY);
        frontFaceLine.setAttribute("stroke", COLOR_BLUE);
        frontFaceLine.setAttribute("stroke-width", "2");
        drawingGroup.appendChild(frontFaceLine);

        // Draw Interactive Anchor Dot
        const anchorDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        anchorDot.setAttribute("cx", breakPointX);
        anchorDot.setAttribute("cy", breakPointY);
        anchorDot.setAttribute("r", DOT_RADIUS.toString());
        anchorDot.setAttribute("fill", BODY_POINT_CONFIG.frontFaceBreak.color);
        anchorDot.setAttribute("stroke", "none");
        anchorDot.setAttribute("class", "interactive-anchor");
        anchorDot.style.cursor = "pointer";
        anchorDot.style.transition = "r 0.2s ease";


        // Hover effect via JS events since we're redrawing constantly
        anchorDot.addEventListener('mouseenter', () => {
            setDotVisualState(anchorDot, true);
            showPointTooltip('frontFaceBreak', parseFloat(anchorDot.getAttribute('cx')), parseFloat(anchorDot.getAttribute('cy')));
        });
        anchorDot.addEventListener('mouseleave', () => {
            if (!isDraggingFrontBreak) {
                setDotVisualState(anchorDot, false);
                hidePointTooltip('frontFaceBreak');
            }
        });

        // Drag start - calculate offset from current state, not closure
        anchorDot.addEventListener('mousedown', (e) => {
            // Get current dot position from state (not from closure variables)
            const tireRadiusPxCurrent = (state.tireDiameter / 2) * SCALE;
            const wheelBasePxCurrent = state.wheelBase * SCALE;
            const localFrontWheelX = CENTER_X - (wheelBasePxCurrent / 2);
            const localRearWheelX = CENTER_X + (wheelBasePxCurrent / 2);
            const localWheelY = GROUND_Y - tireRadiusPxCurrent;
            const referenceX = getReferenceX(BODY_POINT_CONFIG.frontFaceBreak.reference, localFrontWheelX, localRearWheelX);
            const currentBreakPointX = referenceX - (state.frontFaceBreakX * SCALE);
            const currentBreakPointY = localWheelY - (state.frontFaceBreakY * SCALE);

            const svgEl = document.querySelector("svg");
            const pt = svgEl.createSVGPoint();
            pt.x = e.clientX;
            pt.y = e.clientY;
            const svgP = pt.matrixTransform(svgEl.getScreenCTM().inverse());

            isDraggingFrontBreak = true;
            dragOffsetX = svgP.x - currentBreakPointX;
            dragOffsetY = svgP.y - currentBreakPointY;
            setDotVisualState(anchorDot, true);
            showPointTooltip('frontFaceBreak', currentBreakPointX, currentBreakPointY);
            e.preventDefault();
            e.stopPropagation();
        });

        drawingGroup.appendChild(anchorDot);

        // --- Draw Body Profile Points ---
        // Helper function to create draggable dots
        const createDraggableDot = (x, y, pointName) => {
            const dot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            dot.setAttribute("cx", x);
            dot.setAttribute("cy", y);
            dot.setAttribute("r", DOT_RADIUS.toString());
            const config = BODY_POINT_CONFIG[pointName];
            dot.setAttribute("fill", config?.color || COLOR_FRONT_POINT);
            dot.setAttribute("stroke", "none");
            dot.setAttribute("data-point", pointName);
            dot.style.cursor = "pointer";

            dot.addEventListener('mouseenter', () => {
                setDotVisualState(dot, true);
                showPointTooltip(pointName, parseFloat(dot.getAttribute('cx')), parseFloat(dot.getAttribute('cy')));
            });
            dot.addEventListener('mouseleave', () => {
                if (!isDraggingBodyPoint || currentDragPoint !== pointName) {
                    setDotVisualState(dot, false);
                    hidePointTooltip(pointName);
                }
            });

            dot.addEventListener('mousedown', (e) => {
                isDraggingBodyPoint = true;
                currentDragPoint = pointName;

                // Recalculate current dot position from state (not from closure)
                const tireRadiusPxCurrent = (state.tireDiameter / 2) * SCALE;
                const wheelBasePxCurrent = state.wheelBase * SCALE;
                const localFrontWheelX = CENTER_X - (wheelBasePxCurrent / 2);
                const localRearWheelX = CENTER_X + (wheelBasePxCurrent / 2);
                const localWheelY = GROUND_Y - tireRadiusPxCurrent;
                const config = BODY_POINT_CONFIG[pointName];
                const referenceX = getReferenceX(config.reference, localFrontWheelX, localRearWheelX);

                const currentDotX = referenceX - (state[config.xKey] * SCALE);
                const currentDotY = localWheelY - (state[config.yKey] * SCALE);

                const svgEl = document.querySelector("svg");
                const pt = svgEl.createSVGPoint();
                pt.x = e.clientX;
                pt.y = e.clientY;
                const svgP = pt.matrixTransform(svgEl.getScreenCTM().inverse());

                bodyDragOffsetX = svgP.x - currentDotX;
                bodyDragOffsetY = svgP.y - currentDotY;
                setDotVisualState(dot, true);
                showPointTooltip(pointName, currentDotX, currentDotY);
                e.preventDefault();
                e.stopPropagation();
            });

            return dot;
        };

        // Calculate positions for each body point using their respective axles
        const bonnetEndPx = getPointPosition('bonnetEnd', frontWheelX, rearWheelX, wheelY);
        const windowEndPx = getPointPosition('windowEnd', frontWheelX, rearWheelX, wheelY);
        const rooftopEndPx = getPointPosition('rooftopEnd', frontWheelX, rearWheelX, wheelY);
        const rearWindowEndPx = getPointPosition('rearWindowEnd', frontWheelX, rearWheelX, wheelY);
        const bumperEndPx = getPointPosition('bumperEnd', frontWheelX, rearWheelX, wheelY);
        const splineAnchorPx = getSplineAnchorPx(frontWheelX, wheelY);
        const splineHandleInPx = getSplineHandlePx(state.bonnetSplineHandleInX, state.bonnetSplineHandleInY, splineAnchorPx);
        const splineHandleOutPx = getSplineHandlePx(state.bonnetSplineHandleOutX, state.bonnetSplineHandleOutY, splineAnchorPx);

        if (splineMenuVisible) {
            positionSplineMenu(splineAnchorPx.x, splineAnchorPx.y);
        }

        // Rear Overhang Anchor
        // Find point on rear tangent line where x = rearWheelX + rearOverhang
        const rearOverhangPx = state.rearOverhang * SCALE;
        const targetRearX = rearWheelX + rearOverhangPx;

        let targetRearY;
        if (Math.abs(rearDx) > 0.001) {
            const mRear = rearDy / rearDx;
            targetRearY = rearTangentY + mRear * (targetRearX - rearTangentX);
        } else {
            targetRearY = rearTangentY;
        }

        // Draw Line from Anchor to Rear Arch End
        const rearBumperLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        rearBumperLine.setAttribute("x1", targetRearX);
        rearBumperLine.setAttribute("y1", targetRearY);
        rearBumperLine.setAttribute("x2", rearArchEndX);
        rearBumperLine.setAttribute("y2", chassisBottomY);
        rearBumperLine.setAttribute("stroke", "#38bdf8");
        rearBumperLine.setAttribute("stroke-width", "2");
        drawingGroup.appendChild(rearBumperLine);

        // Draw body profile path with optional spline segment
        let bodyPath = `M ${breakPointX} ${breakPointY}`;

        if (state.bonnetSplineType === 'hard') {
            bodyPath += ` L ${splineAnchorPx.x} ${splineAnchorPx.y}`;
            bodyPath += ` L ${bonnetEndPx.x} ${bonnetEndPx.y}`;
        } else {
            bodyPath += ` Q ${splineHandleInPx.x} ${splineHandleInPx.y} ${splineAnchorPx.x} ${splineAnchorPx.y}`;
            bodyPath += ` Q ${splineHandleOutPx.x} ${splineHandleOutPx.y} ${bonnetEndPx.x} ${bonnetEndPx.y}`;
        }

        bodyPath += ` L ${windowEndPx.x} ${windowEndPx.y}`;
        bodyPath += ` L ${rooftopEndPx.x} ${rooftopEndPx.y}`;
        bodyPath += ` L ${rearWindowEndPx.x} ${rearWindowEndPx.y}`;
        bodyPath += ` L ${bumperEndPx.x} ${bumperEndPx.y}`;
        bodyPath += ` L ${targetRearX} ${targetRearY}`;

        const bodyProfilePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        bodyProfilePath.setAttribute("d", bodyPath);
        bodyProfilePath.setAttribute("stroke", COLOR_BLUE);
        bodyProfilePath.setAttribute("stroke-width", "2");
        bodyProfilePath.setAttribute("fill", "none");
        drawingGroup.appendChild(bodyProfilePath);

        // Draw spline handles if applicable
        if (state.bonnetSplineType !== 'hard') {
            const handleLineIn = document.createElementNS("http://www.w3.org/2000/svg", "line");
            handleLineIn.setAttribute("x1", splineAnchorPx.x);
            handleLineIn.setAttribute("y1", splineAnchorPx.y);
            handleLineIn.setAttribute("x2", splineHandleInPx.x);
            handleLineIn.setAttribute("y2", splineHandleInPx.y);
            handleLineIn.setAttribute("stroke", "rgba(255,255,255,0.5)");
            handleLineIn.setAttribute("stroke-width", "1");
            drawingGroup.appendChild(handleLineIn);

            const handleLineOut = document.createElementNS("http://www.w3.org/2000/svg", "line");
            handleLineOut.setAttribute("x1", splineAnchorPx.x);
            handleLineOut.setAttribute("y1", splineAnchorPx.y);
            handleLineOut.setAttribute("x2", splineHandleOutPx.x);
            handleLineOut.setAttribute("y2", splineHandleOutPx.y);
            handleLineOut.setAttribute("stroke", "rgba(255,255,255,0.5)");
            handleLineOut.setAttribute("stroke-width", "1");
            drawingGroup.appendChild(handleLineOut);

            const handleDotIn = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            handleDotIn.setAttribute("cx", splineHandleInPx.x);
            handleDotIn.setAttribute("cy", splineHandleInPx.y);
            handleDotIn.setAttribute("fill", "#e2e8f0");
            setSplineDotState(handleDotIn, false, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
            handleDotIn.style.cursor = 'pointer';
            handleDotIn.addEventListener('mouseenter', () => setSplineDotState(handleDotIn, true, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1));
            handleDotIn.addEventListener('mouseleave', () => {
                if (isDraggingSplineHandle !== 'in') {
                    setSplineDotState(handleDotIn, false, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
                }
            });
            handleDotIn.addEventListener('mousedown', (event) => {
                startSplineHandleDrag('in', event, splineHandleInPx);
                setSplineDotState(handleDotIn, true, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
            });
            drawingGroup.appendChild(handleDotIn);

            const handleDotOut = document.createElementNS("http://www.w3.org/2000/svg", "circle");
            handleDotOut.setAttribute("cx", splineHandleOutPx.x);
            handleDotOut.setAttribute("cy", splineHandleOutPx.y);
            handleDotOut.setAttribute("fill", "#e2e8f0");
            setSplineDotState(handleDotOut, false, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
            handleDotOut.style.cursor = 'pointer';
            handleDotOut.addEventListener('mouseenter', () => setSplineDotState(handleDotOut, true, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1));
            handleDotOut.addEventListener('mouseleave', () => {
                if (isDraggingSplineHandle !== 'out') {
                    setSplineDotState(handleDotOut, false, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
                }
            });
            handleDotOut.addEventListener('mousedown', (event) => {
                startSplineHandleDrag('out', event, splineHandleOutPx);
                setSplineDotState(handleDotOut, true, SPLINE_HANDLE_RADIUS, SPLINE_HANDLE_RADIUS + 1);
            });
            drawingGroup.appendChild(handleDotOut);
        }

        const splineDot = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        splineDot.setAttribute("cx", splineAnchorPx.x);
        splineDot.setAttribute("cy", splineAnchorPx.y);
        splineDot.setAttribute("fill", "#ffffff");
        setSplineDotState(splineDot, false, SPLINE_DOT_RADIUS, SPLINE_DOT_ACTIVE_RADIUS);
        splineDot.style.cursor = 'pointer';
        splineDot.addEventListener('mouseenter', () => setSplineDotState(splineDot, true, SPLINE_DOT_RADIUS, SPLINE_DOT_ACTIVE_RADIUS));
        splineDot.addEventListener('mouseleave', () => {
            if (!isDraggingSplinePoint) {
                setSplineDotState(splineDot, false, SPLINE_DOT_RADIUS, SPLINE_DOT_ACTIVE_RADIUS);
            }
        });
        splineDot.addEventListener('mousedown', (event) => {
            const ctm = svg.getScreenCTM();
            if (!ctm) return;
            const pt = svg.createSVGPoint();
            pt.x = event.clientX;
            pt.y = event.clientY;
            const svgP = pt.matrixTransform(ctm.inverse());
            splinePointerDown = true;
            splinePointerStartX = svgP.x;
            splinePointerStartY = svgP.y;
            splineDragOffsetX = svgP.x - splineAnchorPx.x;
            splineDragOffsetY = svgP.y - splineAnchorPx.y;
            splineDragMoved = false;
            setSplineDotState(splineDot, true, SPLINE_DOT_RADIUS, SPLINE_DOT_ACTIVE_RADIUS);
            event.preventDefault();
            event.stopPropagation();
        });
        splineDot.addEventListener('mouseup', (event) => {
            splinePointerDown = false;
            if (isDraggingSplinePoint || splineDragMoved) {
                return;
            }
            event.stopPropagation();
            if (splineMenuVisible) {
                hideSplineMenu();
            } else {
                showSplineMenu(splineAnchorPx.x, splineAnchorPx.y);
            }
        });
        drawingGroup.appendChild(splineDot);

        // Draw draggable dots for each point (rendered above lines)
        drawingGroup.appendChild(createDraggableDot(bonnetEndPx.x, bonnetEndPx.y, "bonnetEnd"));
        drawingGroup.appendChild(createDraggableDot(windowEndPx.x, windowEndPx.y, "windowEnd"));
        drawingGroup.appendChild(createDraggableDot(rooftopEndPx.x, rooftopEndPx.y, "rooftopEnd"));
        drawingGroup.appendChild(createDraggableDot(rearWindowEndPx.x, rearWindowEndPx.y, "rearWindowEnd"));
        drawingGroup.appendChild(createDraggableDot(bumperEndPx.x, bumperEndPx.y, "bumperEnd"));


        // --- Draw Tires ---
        drawTire(rearWheelX, wheelY, tireRadiusPx, 'rear');
        drawTire(frontWheelX, wheelY, tireRadiusPx, 'front');

        // Draw Ground Line (reference)
        const groundLine = document.createElementNS("http://www.w3.org/2000/svg", "line");
        groundLine.setAttribute("x1", 0);
        groundLine.setAttribute("y1", GROUND_Y);
        groundLine.setAttribute("x2", 800);
        groundLine.setAttribute("y2", GROUND_Y);
        groundLine.setAttribute("stroke", "rgba(255,255,255,0.1)");
        groundLine.setAttribute("stroke-width", "1");
        drawingGroup.appendChild(groundLine);
    }

    function drawTire(cx, cy, r, position = 'front') {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");

        // Tire Circle (Semi-transparent fill)
        const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        circle.setAttribute("cx", cx);
        circle.setAttribute("cy", cy);
        circle.setAttribute("r", r);
        circle.setAttribute("fill", "rgba(255, 255, 255, 0.2)");
        circle.setAttribute("stroke", "none");
        group.appendChild(circle);

        // Center Point
        const center = document.createElementNS("http://www.w3.org/2000/svg", "circle");
        center.setAttribute("cx", cx);
        center.setAttribute("cy", cy);
        center.setAttribute("r", DOT_RADIUS.toString());
        center.setAttribute("fill", position === 'front' ? COLOR_FRONT_POINT : COLOR_REAR_POINT);
        center.setAttribute("stroke", "none");
        center.style.cursor = 'ew-resize';
        center.addEventListener('mousedown', (event) => startAxleDrag(position, event, cx, center));
        center.addEventListener('mouseenter', () => setDotVisualState(center, true));
        center.addEventListener('mouseleave', () => {
            if (isDraggingAxle !== position) {
                setDotVisualState(center, false);
            }
        });
        setDotVisualState(center, false);
        group.appendChild(center);

        drawingGroup.appendChild(group);
    }

    function startAxleDrag(position, event, axleX, centerElement) {
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const svgCoords = pt.matrixTransform(ctm.inverse());
        isDraggingAxle = position;
        axleDragOffsetX = svgCoords.x - axleX;
        setDotVisualState(centerElement, true);
        event.preventDefault();
        event.stopPropagation();
    }

    function startSplineHandleDrag(handleType, event, handlePx) {
        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const pt = svg.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const svgCoords = pt.matrixTransform(ctm.inverse());
        isDraggingSplineHandle = handleType;
        splineHandleDragOffsetX = svgCoords.x - handlePx.x;
        splineHandleDragOffsetY = svgCoords.y - handlePx.y;
        event.preventDefault();
        event.stopPropagation();
    }






    function updateImageEditingState() {
        const canEditImage = imageEditActive && hasImageOverlay;
        toggleImageButton.classList.toggle('active', imageEditActive);
        imageControls.classList.toggle('visible', imageEditActive);
        imageFrame.classList.toggle('editing', canEditImage);
        canvasArea.classList.toggle('editing-image', canEditImage);
        imageToolbar?.classList.toggle('actions-visible', canEditImage);
        deleteImageBtn.disabled = !hasImageOverlay;
        opacitySlider.disabled = !hasImageOverlay;
        flipImageBtn.disabled = !hasImageOverlay;
        rotationSlider.disabled = !hasImageOverlay;
        if (!canEditImage) {
            dragState = null;
            resizeState = null;
        }
    }

    function applyImageTransform() {
        const scaleX = imageFlipped ? -1 : 1;
        overlayImage.style.transform = `scaleX(${scaleX}) rotate(${imageRotation}deg)`;
    }

    function handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            overlayImage.onload = () => {
                hasImageOverlay = true;
                imageFrame.classList.add('has-image');
                resetImageFrame();
                overlayImage.style.opacity = opacitySlider.value;
                applyImageTransform();
                updateImageEditingState();
            };
            overlayImage.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    function resetImageFrame() {
        const parentWidth = canvasArea.clientWidth;
        const parentHeight = canvasArea.clientHeight;
        const width = Math.max(MIN_FRAME_WIDTH, parentWidth * 0.65);
        const height = Math.max(MIN_FRAME_HEIGHT, parentHeight * 0.55);
        imageFrame.style.width = `${width}px`;
        imageFrame.style.height = `${height}px`;
        imageFrame.style.left = `${(parentWidth - width) / 2}px`;
        imageFrame.style.top = `${(parentHeight - height) / 2}px`;
    }

    function startDrag(event) {
        if (!imageEditActive || !hasImageOverlay || event.target === resizeHandle) return;
        event.preventDefault();
        dragState = {
            startX: event.clientX,
            startY: event.clientY,
            left: parseFloat(imageFrame.style.left) || 0,
            top: parseFloat(imageFrame.style.top) || 0
        };
        window.addEventListener('pointermove', handleDragMove);
        window.addEventListener('pointerup', stopDrag);
    }

    function handleDragMove(event) {
        if (!dragState) return;
        event.preventDefault();
        const parentWidth = canvasArea.clientWidth;
        const parentHeight = canvasArea.clientHeight;
        const frameWidth = imageFrame.offsetWidth;
        const frameHeight = imageFrame.offsetHeight;
        const nextLeft = dragState.left + (event.clientX - dragState.startX);
        const nextTop = dragState.top + (event.clientY - dragState.startY);
        imageFrame.style.left = `${Math.min(Math.max(0, nextLeft), parentWidth - frameWidth)}px`;
        imageFrame.style.top = `${Math.min(Math.max(0, nextTop), parentHeight - frameHeight)}px`;
    }

    function stopDrag() {
        dragState = null;
        window.removeEventListener('pointermove', handleDragMove);
        window.removeEventListener('pointerup', stopDrag);
    }

    function startResize(event) {
        if (!imageEditActive || !hasImageOverlay) return;
        event.stopPropagation();
        event.preventDefault();
        resizeState = {
            startX: event.clientX,
            startY: event.clientY,
            width: imageFrame.offsetWidth,
            height: imageFrame.offsetHeight
        };
        window.addEventListener('pointermove', handleResizeMove);
        window.addEventListener('pointerup', stopResize);
    }

    function handleResizeMove(event) {
        if (!resizeState) return;
        event.preventDefault();
        const parentWidth = canvasArea.clientWidth;
        const parentHeight = canvasArea.clientHeight;
        const frameLeft = imageFrame.offsetLeft;
        const frameTop = imageFrame.offsetTop;
        const maxWidth = parentWidth - frameLeft;
        const maxHeight = parentHeight - frameTop;
        const constrainedMaxWidth = Math.max(MIN_FRAME_WIDTH, maxWidth);
        const constrainedMaxHeight = Math.max(MIN_FRAME_HEIGHT, maxHeight);
        const nextWidth = Math.min(Math.max(MIN_FRAME_WIDTH, resizeState.width + (event.clientX - resizeState.startX)), constrainedMaxWidth);
        const nextHeight = Math.min(Math.max(MIN_FRAME_HEIGHT, resizeState.height + (event.clientY - resizeState.startY)), constrainedMaxHeight);
        imageFrame.style.width = `${nextWidth}px`;
        imageFrame.style.height = `${nextHeight}px`;
    }

    function stopResize() {
        resizeState = null;
        window.removeEventListener('pointermove', handleResizeMove);
        window.removeEventListener('pointerup', stopResize);
    }

    // Event Listeners
    tireDiameterInput.addEventListener('input', updateState);
    wheelArchGapInput.addEventListener('input', updateState);
    wheelBaseInput.addEventListener('input', updateState);
    groundClearanceInput.addEventListener('input', updateState);
    floorThicknessInput.addEventListener('input', updateState);
    frontOverhangInput.addEventListener('input', updateState);
    rearOverhangInput.addEventListener('input', updateState);
    frontApproachAngleInput.addEventListener('input', updateState);
    rearDepartureAngleInput.addEventListener('input', updateState);
    hPointHeightInput.addEventListener('input', updateState);
    hPointXInput.addEventListener('input', updateState);
    hipPedalDistanceInput.addEventListener('input', updateState);
    bodyReclineAngleInput.addEventListener('input', updateState);
    handHeightInput.addEventListener('input', updateState);
    handDistanceXInput.addEventListener('input', updateState);
    mannequinHeightInput.addEventListener('change', updateState);
    showMannequinInput.addEventListener('change', updateState);

    toggleImageButton.addEventListener('click', () => {
        imageEditActive = !imageEditActive;
        updateImageEditingState();
    });

    imageUploadInput.addEventListener('change', (event) => {
        handleImageFile(event.target.files?.[0]);
        event.target.value = '';
    });

    deleteImageBtn.addEventListener('click', () => {
        if (!hasImageOverlay) return;
        hasImageOverlay = false;
        overlayImage.src = '';
        imageFrame.classList.remove('has-image');
        imageRotation = 0;
        rotationSlider.value = 0;
        imageFlipped = false;
        applyImageTransform();
        updateImageEditingState();
    });

    opacitySlider.addEventListener('input', (event) => {
        overlayImage.style.opacity = event.target.value;
    });

    flipImageBtn.addEventListener('click', () => {
        if (!hasImageOverlay) return;
        imageFlipped = !imageFlipped;
        applyImageTransform();
    });

    rotationSlider.addEventListener('input', (event) => {
        imageRotation = parseFloat(event.target.value);
        applyImageTransform();
    });

    imageFrame.addEventListener('pointerdown', startDrag);
    resizeHandle.addEventListener('pointerdown', startResize);

    canvasArea.addEventListener('dragover', (event) => {
        event.preventDefault();
        canvasArea.classList.add('drag-over');
    });

    canvasArea.addEventListener('dragleave', (event) => {
        if (!canvasArea.contains(event.relatedTarget)) {
            canvasArea.classList.remove('drag-over');
        }
    });

    canvasArea.addEventListener('drop', (event) => {
        event.preventDefault();
        canvasArea.classList.remove('drag-over');
        const files = event.dataTransfer?.files;
        if (files?.length) {
            handleImageFile(files[0]);
        }
    });

    updateImageEditingState();

    // Initial Draw
    updateState();

    // Handle Human Figure Scaling and Positioning
    function updateHumanFigurePosition() {
        const bodyParent = document.querySelector('.bodyandhead-parent');
        if (!bodyParent || !state.showMannequin) {
            if (bodyParent) bodyParent.style.display = 'none';
            return;
        }
        bodyParent.style.display = 'block';

        const containerWidth = canvasArea.clientWidth;
        const containerHeight = canvasArea.clientHeight;

        // SVG ViewBox dimensions
        const svgViewW = 800;
        const svgViewH = 400;

        // Calculate SVG rendering scale (contain)
        const scaleX = containerWidth / svgViewW;
        const scaleY = containerHeight / svgViewH;
        const svgScale = Math.min(scaleX, scaleY);

        // Calculate SVG rendering offsets (centering)
        const renderedW = svgViewW * svgScale;
        const renderedH = svgViewH * svgScale;
        const svgOffsetX = (containerWidth - renderedW) / 2;
        const svgOffsetY = (containerHeight - renderedH) / 2;

        // --- 1. Calculate Target Positions in Car Space (mm) ---
        const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
        const groundClearancePx = state.groundClearance * SCALE;
        const floorThicknessPx = state.floorThickness * SCALE;
        const wheelBasePx = state.wheelBase * SCALE;

        // Car Reference Points
        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const chassisBottomY = GROUND_Y - groundClearancePx;
        const floorY = chassisBottomY - floorThicknessPx;

        // Inputs
        const hPointXPx = state.hPointX * SCALE;
        const hHeightPx = state.hPointHeight * SCALE;

        // Target Hip Position (Fixed Anchor)
        const targetHipX = frontWheelX + hPointXPx;
        const targetHipY = floorY - hHeightPx;

        // Target Heel Position (Derived)
        const hipPedalDistPx = state.hipPedalDistance * SCALE;
        const targetHeelX_Ideal = targetHipX - hipPedalDistPx;
        const targetHeelY = floorY;

        // Anthropometry (based on Driver Height)
        const heightPx = state.mannequinHeight * 10 * SCALE;
        const thighLen = heightPx * 0.245;
        const shinLen = heightPx * 0.246;

        // --- 2. Leg Inverse Kinematics (Solve for Knee) ---
        let finalHeelX, finalKneeX, finalKneeY, targetThighAngle, newShinAngle;
        let rotThighDeg, rotShinDeg, extraShinScale;
        let newKneeX_Asset, newKneeY_Asset, newHeelX_Asset, newHeelY_Asset;
        let assetHipGlobalX, assetHipGlobalY, finalContainerScale;

        {
            // Safety Mechanism: Clamp Heel Position to Max Leg Reach
            const maxReach = (thighLen + shinLen) * 0.999;
            const minReach = Math.abs(thighLen - shinLen) * 1.001;
            const dy = Math.abs(targetHeelY - targetHipY);
            let dx = targetHipX - targetHeelX_Ideal;
            const currentDist = Math.sqrt(dx * dx + dy * dy);

            if (dy > maxReach) {
                dx = 0;
            } else {
                if (currentDist > maxReach) {
                    dx = Math.sqrt(maxReach * maxReach - dy * dy);
                } else if (currentDist < minReach) {
                    if (dy < minReach) {
                        dx = Math.sqrt(minReach * minReach - dy * dy);
                    }
                }
            }

            finalHeelX = targetHipX - dx;
            const distHipHeel = Math.sqrt(Math.pow(targetHipX - finalHeelX, 2) + Math.pow(targetHipY - targetHeelY, 2));

            // Thigh Angle (Global)
            const baseAngle = Math.atan2(targetHeelY - targetHipY, finalHeelX - targetHipX);
            const alpha = Math.acos((Math.pow(thighLen, 2) + Math.pow(distHipHeel, 2) - Math.pow(shinLen, 2)) / (2 * thighLen * distHipHeel));
            targetThighAngle = baseAngle + alpha;

            // Final Knee Position (Car Space)
            finalKneeX = targetHipX + thighLen * Math.cos(targetThighAngle);
            finalKneeY = targetHipY + thighLen * Math.sin(targetThighAngle);

            // Shin Angle
            newShinAngle = Math.atan2(targetHeelY - finalKneeY, finalHeelX - finalKneeX);
        }

        // --- 3. Asset Calculations (Legs) ---
        {
            // Default Asset Vectors
            const defaultThighVec = { x: ASSET_COORDS.knee.x - ASSET_COORDS.hip.x, y: ASSET_COORDS.knee.y - ASSET_COORDS.hip.y };
            const defaultShinVec = { x: ASSET_COORDS.heel.x - ASSET_COORDS.knee.x, y: ASSET_COORDS.heel.y - ASSET_COORDS.knee.y };
            const defaultThighAngle = Math.atan2(defaultThighVec.y, defaultThighVec.x);
            const defaultShinAngle = Math.atan2(defaultShinVec.y, defaultShinVec.x);

            // Rotation Deltas
            rotThighDeg = (targetThighAngle - defaultThighAngle) * 180 / Math.PI;
            rotShinDeg = (newShinAngle - defaultShinAngle) * 180 / Math.PI;

            // Scaling
            const assetThighLen = Math.sqrt(Math.pow(defaultThighVec.x, 2) + Math.pow(defaultThighVec.y, 2));
            const globalScale = thighLen / assetThighLen;
            finalContainerScale = globalScale * svgScale;

            const assetShinLen = Math.sqrt(Math.pow(defaultShinVec.x, 2) + Math.pow(defaultShinVec.y, 2));
            extraShinScale = shinLen / (assetShinLen * globalScale);

            // Asset Hip Global (relative to bodyandhead-parent)
            assetHipGlobalX = ASSET_COORDS.parentOffset.x + ASSET_COORDS.hip.x;
            assetHipGlobalY = ASSET_COORDS.parentOffset.y + ASSET_COORDS.hip.y;

            // Calculate New Knee/Heel in Asset Space
            newKneeX_Asset = assetHipGlobalX + assetThighLen * Math.cos(targetThighAngle);
            newKneeY_Asset = assetHipGlobalY + assetThighLen * Math.sin(targetThighAngle);

            const effectiveAssetShinLen = assetShinLen * extraShinScale;
            newHeelX_Asset = newKneeX_Asset + effectiveAssetShinLen * Math.cos(newShinAngle);
            newHeelY_Asset = newKneeY_Asset + effectiveAssetShinLen * Math.sin(newShinAngle);
        }

        // --- 4. Apply Leg Transforms ---
        {
            // Align Container
            const screenHipX = targetHipX * svgScale + svgOffsetX;
            const screenHipY = targetHipY * svgScale + svgOffsetY;
            const containerTx = screenHipX - (assetHipGlobalX * finalContainerScale);
            const containerTy = screenHipY - (assetHipGlobalY * finalContainerScale);

            bodyParent.style.transformOrigin = 'top left';
            bodyParent.style.transform = `translate(${containerTx}px, ${containerTy}px) scale(${finalContainerScale})`;

            // Big Leg
            const bigLegIcon = document.querySelector('.big-leg-icon');
            if (bigLegIcon) {
                bigLegIcon.style.transformOrigin = `${ASSET_PIVOTS.bigLeg.x}px ${ASSET_PIVOTS.bigLeg.y}px`;
                bigLegIcon.style.transform = `rotate(${rotThighDeg}deg)`;
            }

            // Small Leg
            const smallLegIcon = document.querySelector('.small-leg-icon');
            if (smallLegIcon) {
                // Pivot Global (Old Knee)
                const oldKneeGlobalX = ASSET_COORDS.parentOffset.x + ASSET_COORDS.knee.x;
                const oldKneeGlobalY = ASSET_COORDS.parentOffset.y + ASSET_COORDS.knee.y;
                const dx = newKneeX_Asset - oldKneeGlobalX;
                const dy = newKneeY_Asset - oldKneeGlobalY;

                smallLegIcon.style.transformOrigin = `${ASSET_PIVOTS.smallLeg.x}px ${ASSET_PIVOTS.smallLeg.y}px`;
                smallLegIcon.style.transform = `translate(${dx}px, ${dy}px) rotate(${rotShinDeg}deg) scale(${extraShinScale})`;
            }

            // Markers
            const kneeMarker = document.querySelector('.knee');
            if (kneeMarker) {
                kneeMarker.style.left = `${newKneeX_Asset - ASSET_COORDS.parentOffset.x}px`;
                kneeMarker.style.top = `${newKneeY_Asset - ASSET_COORDS.parentOffset.y}px`;
            }

            const heelMarker = document.querySelector('.heel');
            if (heelMarker) {
                heelMarker.style.left = `${newHeelX_Asset - ASSET_COORDS.parentOffset.x}px`;
                heelMarker.style.top = `${newHeelY_Asset - ASSET_COORDS.parentOffset.y}px`;
                heelMarker.style.transform = `rotate(${rotShinDeg}deg)`;
            }

            // Bottom Foot (Simplified)
            const bottomFootMarker = document.querySelector('.bottom-foot');
            if (bottomFootMarker) {
                const footVecX = 0 - ASSET_COORDS.knee.x;
                const footVecY = 793 - ASSET_COORDS.knee.y;
                const footLen = Math.sqrt(footVecX * footVecX + footVecY * footVecY);
                const footAngle = Math.atan2(footVecY, footVecX);
                const defaultShinVec = { x: ASSET_COORDS.heel.x - ASSET_COORDS.knee.x, y: ASSET_COORDS.heel.y - ASSET_COORDS.knee.y };
                const defaultShinAngle = Math.atan2(defaultShinVec.y, defaultShinVec.x);
                const newFootAngle = footAngle + (newShinAngle - defaultShinAngle);
                const effectiveFootLen = footLen * extraShinScale;
                const newFootX_Asset = newKneeX_Asset + effectiveFootLen * Math.cos(newFootAngle);
                const newFootY_Asset = newKneeY_Asset + effectiveFootLen * Math.sin(newFootAngle);

                bottomFootMarker.style.left = `${newFootX_Asset - ASSET_COORDS.parentOffset.x}px`;
                bottomFootMarker.style.top = `${newFootY_Asset - ASSET_COORDS.parentOffset.y}px`;
            }
        }

        // --- 5. Arm Inverse Kinematics ---
        {
            const handHeightPx = state.handHeight * SCALE;
            const handDistXPx = state.handDistanceX * SCALE;

            // Hand Position (relative to Hip, not Heel)
            // Front is LEFT (lower X), so subtract to move hand forward
            const targetHandX = targetHipX - handDistXPx;
            const targetHandY = targetHipY - handHeightPx;

            // Target Hand in Asset Space
            // Convert from SVG space to Asset space using globalScale only
            // (finalContainerScale includes svgScale which is for screen rendering, not coordinate conversion)
            const globalScale = thighLen / Math.sqrt(Math.pow(ASSET_COORDS.knee.x - ASSET_COORDS.hip.x, 2) + Math.pow(ASSET_COORDS.knee.y - ASSET_COORDS.hip.y, 2));
            const deltaHandX_SVG = targetHandX - targetHipX;
            const deltaHandY_SVG = targetHandY - targetHipY;
            const targetHandX_Asset = assetHipGlobalX + deltaHandX_SVG / globalScale;
            const targetHandY_Asset = assetHipGlobalY + deltaHandY_SVG / globalScale;

            // Asset Vectors
            const vecUpperArm = { x: ASSET_COORDS.elbow.x - ASSET_COORDS.shoulder.x, y: ASSET_COORDS.elbow.y - ASSET_COORDS.shoulder.y };
            const lenUpperArm = Math.sqrt(vecUpperArm.x * vecUpperArm.x + vecUpperArm.y * vecUpperArm.y);
            const vecForearm = { x: ASSET_COORDS.hand.x - ASSET_COORDS.elbow.x, y: ASSET_COORDS.hand.y - ASSET_COORDS.elbow.y };
            const lenForearm = Math.sqrt(vecForearm.x * vecForearm.x + vecForearm.y * vecForearm.y);

            // Torso Vector (Hip to Shoulder)
            const shoulderGlobalX_default = ASSET_COORDS.parentOffset.x + ASSET_COORDS.shoulder.x;
            const shoulderGlobalY_default = ASSET_COORDS.parentOffset.y + ASSET_COORDS.shoulder.y;
            const vecTorso = { x: shoulderGlobalX_default - assetHipGlobalX, y: shoulderGlobalY_default - assetHipGlobalY };
            const lenTorso = Math.sqrt(vecTorso.x * vecTorso.x + vecTorso.y * vecTorso.y);
            const defaultTorsoAngleRad = Math.atan2(vecTorso.y, vecTorso.x);
            const defaultTorsoAngleFromVertRad = Math.atan2(vecTorso.x, -vecTorso.y);

            // Recline
            const deltaRotDeg = state.bodyReclineAngle - (defaultTorsoAngleFromVertRad * 180 / Math.PI);
            const deltaRotRad = deltaRotDeg * Math.PI / 180;

            // Safety Clamp
            const maxReach = (lenUpperArm + lenForearm) * 0.999;
            const currentTorsoAngleRad = defaultTorsoAngleRad + deltaRotRad;
            let shoulderX_Asset = assetHipGlobalX + lenTorso * Math.cos(currentTorsoAngleRad);
            let shoulderY_Asset = assetHipGlobalY + lenTorso * Math.sin(currentTorsoAngleRad);

            const distShoulderHand = Math.sqrt(Math.pow(targetHandX_Asset - shoulderX_Asset, 2) + Math.pow(targetHandY_Asset - shoulderY_Asset, 2));
            let clampedDeltaRotDeg = deltaRotDeg;

            if (distShoulderHand > maxReach) {
                const distHipHand = Math.sqrt(Math.pow(targetHandX_Asset - assetHipGlobalX, 2) + Math.pow(targetHandY_Asset - assetHipGlobalY, 2));
                const cosAngle = (Math.pow(lenTorso, 2) + Math.pow(distHipHand, 2) - Math.pow(maxReach, 2)) / (2 * lenTorso * distHipHand);
                const angleFromHipHand = Math.acos(Math.min(Math.max(cosAngle, -1), 1));
                const angleHipHand = Math.atan2(targetHandY_Asset - assetHipGlobalY, targetHandX_Asset - assetHipGlobalX);

                const sol1 = angleHipHand + angleFromHipHand;
                const sol2 = angleHipHand - angleFromHipHand;
                const diff1 = Math.abs(Math.atan2(Math.sin(sol1 - currentTorsoAngleRad), Math.cos(sol1 - currentTorsoAngleRad)));
                const diff2 = Math.abs(Math.atan2(Math.sin(sol2 - currentTorsoAngleRad), Math.cos(sol2 - currentTorsoAngleRad)));
                const bestSol = (diff1 < diff2) ? sol1 : sol2;

                shoulderX_Asset = assetHipGlobalX + lenTorso * Math.cos(bestSol);
                shoulderY_Asset = assetHipGlobalY + lenTorso * Math.sin(bestSol);
                clampedDeltaRotDeg = (bestSol - defaultTorsoAngleRad) * 180 / Math.PI;
            }

            // Update UI if body angle was clamped
            const defaultBodyAngleFromVert = defaultTorsoAngleFromVertRad * 180 / Math.PI;
            const actualBodyReclineAngle = Math.round(defaultBodyAngleFromVert + clampedDeltaRotDeg);
            if (actualBodyReclineAngle !== state.bodyReclineAngle) {
                // Update state and UI display (but not the slider input to avoid feedback loop during dragging)
                state.bodyReclineAngle = actualBodyReclineAngle;
                bodyReclineAngleVal.textContent = `${actualBodyReclineAngle}°`;
                // Only update slider if user is not currently dragging it
                if (document.activeElement !== bodyReclineAngleInput) {
                    bodyReclineAngleInput.value = actualBodyReclineAngle;
                }
            }

            // Elbow IK
            const finalDistShoulderHand = Math.sqrt(Math.pow(targetHandX_Asset - shoulderX_Asset, 2) + Math.pow(targetHandY_Asset - shoulderY_Asset, 2));
            const minReach = Math.abs(lenUpperArm - lenForearm) * 1.001;
            let finalHandX_Asset = targetHandX_Asset;
            let finalHandY_Asset = targetHandY_Asset;

            if (finalDistShoulderHand < minReach) {
                const angle = Math.atan2(targetHandY_Asset - shoulderY_Asset, targetHandX_Asset - shoulderX_Asset);
                finalHandX_Asset = shoulderX_Asset + minReach * Math.cos(angle);
                finalHandY_Asset = shoulderY_Asset + minReach * Math.sin(angle);
            }

            const distForIK = Math.max(minReach, Math.min(maxReach, finalDistShoulderHand));
            const cosAlpha = (Math.pow(lenUpperArm, 2) + Math.pow(distForIK, 2) - Math.pow(lenForearm, 2)) / (2 * lenUpperArm * distForIK);
            const alphaArm = Math.acos(Math.min(Math.max(cosAlpha, -1), 1));
            const angleShoulderHand = Math.atan2(finalHandY_Asset - shoulderY_Asset, finalHandX_Asset - shoulderX_Asset);
            const angleUpperArm = angleShoulderHand - alphaArm;

            const elbowX_Asset = shoulderX_Asset + lenUpperArm * Math.cos(angleUpperArm);
            const elbowY_Asset = shoulderY_Asset + lenUpperArm * Math.sin(angleUpperArm);

            // Apply Arm Transforms
            const bodyIcon = document.querySelector('.bodyandhead-icon');
            if (bodyIcon) {
                bodyIcon.style.transformOrigin = `${ASSET_PIVOTS.body.x}px ${ASSET_PIVOTS.body.y}px`;
                bodyIcon.style.transform = `rotate(${clampedDeltaRotDeg}deg)`;
            }

            const bigArmIcon = document.querySelector('.bigarm-icon');
            if (bigArmIcon) {
                const targetLeft = shoulderX_Asset - ASSET_PIVOTS.bigArm.x;
                const targetTop = shoulderY_Asset - ASSET_PIVOTS.bigArm.y;
                const defaultUpperArmAngle = Math.atan2(vecUpperArm.y, vecUpperArm.x);
                const rotUpperArmDeg = (angleUpperArm - defaultUpperArmAngle) * 180 / Math.PI;

                bigArmIcon.style.left = `${targetLeft}px`;
                bigArmIcon.style.top = `${targetTop}px`;
                bigArmIcon.style.transformOrigin = `${ASSET_PIVOTS.bigArm.x}px ${ASSET_PIVOTS.bigArm.y}px`;
                bigArmIcon.style.transform = `rotate(${rotUpperArmDeg}deg)`;
            }

            const smallArmIcon = document.querySelector('.small-arm-icon');
            if (smallArmIcon) {
                const targetLeft = elbowX_Asset - ASSET_PIVOTS.smallArm.x;
                const targetTop = elbowY_Asset - ASSET_PIVOTS.smallArm.y;
                const angleForearm = Math.atan2(finalHandY_Asset - elbowY_Asset, finalHandX_Asset - elbowX_Asset);
                const defaultForearmAngle = Math.atan2(vecForearm.y, vecForearm.x);
                const rotForearmDeg = (angleForearm - defaultForearmAngle) * 180 / Math.PI;

                smallArmIcon.style.left = `${targetLeft}px`;
                smallArmIcon.style.top = `${targetTop}px`;
                smallArmIcon.style.transformOrigin = `${ASSET_PIVOTS.smallArm.x}px ${ASSET_PIVOTS.smallArm.y}px`;
                smallArmIcon.style.transform = `rotate(${rotForearmDeg}deg)`;
            }

            const handMarker = document.querySelector('.hand-anchor');
            if (handMarker) {
                handMarker.style.left = `${finalHandX_Asset - ASSET_COORDS.parentOffset.x}px`;
                handMarker.style.top = `${finalHandY_Asset - ASSET_COORDS.parentOffset.y}px`;
            }
        }
    }






    // Observe resize
    const resizeObserver = new ResizeObserver(() => {
        updateHumanFigurePosition();
    });
    resizeObserver.observe(canvasArea);

    // Initial call
    updateHumanFigurePosition();

    // --- Drag Handling for Front Face Break ---
    let isDraggingFrontBreak = false;
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    // --- Drag Handling for Body Profile Points ---
    let isDraggingBodyPoint = false;
    let currentDragPoint = null;
    let bodyDragOffsetX = 0;
    let bodyDragOffsetY = 0;

    // --- Drag Handling for Wheel Axles ---
    let isDraggingAxle = null; // 'front' | 'rear' | null
    let axleDragOffsetX = 0;
    let splinePointerDown = false;
    let splinePointerStartX = 0;
    let splinePointerStartY = 0;
    let isDraggingSplinePoint = false;
    let splineDragOffsetX = 0;
    let splineDragOffsetY = 0;
    let splineDragMoved = false;
    let isDraggingSplineHandle = null; // 'in' | 'out'
    let splineHandleDragOffsetX = 0;
    let splineHandleDragOffsetY = 0;

    window.addEventListener('mousemove', (e) => {
        const shouldProcess =
            isDraggingFrontBreak ||
            (isDraggingBodyPoint && currentDragPoint) ||
            isDraggingAxle ||
            isDraggingSplinePoint ||
            isDraggingSplineHandle ||
            splinePointerDown;
        if (!shouldProcess) {
            return;
        }

        const ctm = svg.getScreenCTM();
        if (!ctm) return;
        const svgPoint = svg.createSVGPoint();
        svgPoint.x = e.clientX;
        svgPoint.y = e.clientY;
        const svgCoords = svgPoint.matrixTransform(ctm.inverse());

        const dragThreshold = 2;
        if (splinePointerDown && !isDraggingSplinePoint) {
            const deltaX = svgCoords.x - splinePointerStartX;
            const deltaY = svgCoords.y - splinePointerStartY;
            const distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY);
            if (distance > dragThreshold) {
                isDraggingSplinePoint = true;
                hideSplineMenu();
            }
        }

        if (
            !isDraggingFrontBreak &&
            !(isDraggingBodyPoint && currentDragPoint) &&
            !isDraggingAxle &&
            !isDraggingSplinePoint &&
            !isDraggingSplineHandle
        ) {
            return;
        }

        const tireRadiusPx = (state.tireDiameter / 2) * SCALE;
        const wheelBasePx = state.wheelBase * SCALE;
        const frontWheelX = CENTER_X - (wheelBasePx / 2);
        const rearWheelX = CENTER_X + (wheelBasePx / 2);
            const wheelY = GROUND_Y - tireRadiusPx;
        let needsRedraw = false;
        let redrawHandledByState = false;

        // Handle front face break dragging
        if (isDraggingFrontBreak) {
            const newBreakPointX = svgCoords.x - dragOffsetX;
            const newBreakPointY = svgCoords.y - dragOffsetY;
            const referenceX = getReferenceX(BODY_POINT_CONFIG.frontFaceBreak.reference, frontWheelX, rearWheelX);
            const newBreakXPx = referenceX - newBreakPointX;
            const newBreakYPx = wheelY - newBreakPointY;

            state.frontFaceBreakX = Math.round(newBreakXPx / SCALE);
            state.frontFaceBreakY = Math.round(newBreakYPx / SCALE);

            // Clamp values if needed
            state.frontFaceBreakX = Math.max(400, Math.min(1500, state.frontFaceBreakX));
            state.frontFaceBreakY = Math.max(0, Math.min(800, state.frontFaceBreakY));

            if (tooltipPointKey === 'frontFaceBreak') {
                updatePointTooltip('frontFaceBreak', newBreakPointX, newBreakPointY);
            }
            needsRedraw = true;
        }

        // Handle body profile points dragging
        if (isDraggingBodyPoint && currentDragPoint) {
            const config = BODY_POINT_CONFIG[currentDragPoint];
            if (config) {
                const referenceX = getReferenceX(config.reference, frontWheelX, rearWheelX);
                const newPointX = svgCoords.x - bodyDragOffsetX;
                const newPointY = svgCoords.y - bodyDragOffsetY;
                const newXPx = referenceX - newPointX;
                const newYPx = wheelY - newPointY;

                state[config.xKey] = Math.round(newXPx / SCALE);
                state[config.yKey] = Math.round(newYPx / SCALE);

                if (tooltipPointKey === currentDragPoint) {
                    updatePointTooltip(currentDragPoint, newPointX, newPointY);
                }
                needsRedraw = true;
            }
        }

        if (isDraggingSplinePoint) {
            splineDragMoved = true;
            const newAnchorX = svgCoords.x - splineDragOffsetX;
            const newAnchorY = svgCoords.y - splineDragOffsetY;
            state.bonnetSplineX = Math.round((frontWheelX - newAnchorX) / SCALE);
            state.bonnetSplineY = Math.round((wheelY - newAnchorY) / SCALE);
            if (splineMenuVisible) {
                showSplineMenu(newAnchorX, newAnchorY);
            }
            needsRedraw = true;
        }

        if (isDraggingSplineHandle) {
            const anchorPx = getSplineAnchorPx(frontWheelX, wheelY);
            const newHandleX = svgCoords.x - splineHandleDragOffsetX;
            const newHandleY = svgCoords.y - splineHandleDragOffsetY;
            const vectorXmm = Math.round((anchorPx.x - newHandleX) / SCALE);
            const vectorYmm = Math.round((anchorPx.y - newHandleY) / SCALE);

            if (isDraggingSplineHandle === 'in') {
                state.bonnetSplineHandleInX = vectorXmm;
                state.bonnetSplineHandleInY = vectorYmm;
                if (state.bonnetSplineType === 'symmetric') {
                    state.bonnetSplineHandleOutX = -vectorXmm;
                    state.bonnetSplineHandleOutY = -vectorYmm;
                }
            } else {
                state.bonnetSplineHandleOutX = vectorXmm;
                state.bonnetSplineHandleOutY = vectorYmm;
                if (state.bonnetSplineType === 'symmetric') {
                    state.bonnetSplineHandleInX = -vectorXmm;
                    state.bonnetSplineHandleInY = -vectorYmm;
                }
            }
            needsRedraw = true;
        }

        // Handle wheel axle dragging (symmetric around CENTER_X)
        if (isDraggingAxle) {
            const minWheelBasePx = wheelBaseMinMM * SCALE;
            const maxWheelBasePx = wheelBaseMaxMM * SCALE;
            const targetX = svgCoords.x - axleDragOffsetX;
            let desiredWheelBasePx;

            if (isDraggingAxle === 'front') {
                desiredWheelBasePx = (CENTER_X - targetX) * 2;
            } else {
                desiredWheelBasePx = (targetX - CENTER_X) * 2;
            }

            desiredWheelBasePx = Math.max(minWheelBasePx, Math.min(maxWheelBasePx, desiredWheelBasePx));
            const newWheelBaseMm = Math.round(desiredWheelBasePx / SCALE);

            if (newWheelBaseMm !== state.wheelBase) {
                wheelBaseInput.value = newWheelBaseMm;
                updateState();
                redrawHandledByState = true;
            }
        }

        if (!redrawHandledByState && needsRedraw) {
            draw();
        }
    });

    window.addEventListener('mouseup', () => {
        isDraggingFrontBreak = false;
        isDraggingBodyPoint = false;
        currentDragPoint = null;
        isDraggingAxle = null;
        splinePointerDown = false;
        isDraggingSplinePoint = false;
        splineDragMoved = false;
        isDraggingSplineHandle = null;
        draw(); // Redraw to reset cursor/hover state if needed
    });

});
