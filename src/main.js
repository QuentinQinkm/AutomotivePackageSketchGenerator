import { ImageOverlayManager } from './image/imageOverlayManager.js';
import { ChassisRenderer } from './renderers/chassisRenderer.js';
import { HumanFigureRenderer } from './renderers/humanFigureRenderer.js';
import { StateManager } from './state/stateManager.js';
import { LayerController } from './ui/layerController.js';
import { CanvasZoomController } from './ui/canvasZoomController.js';
import { loadInlineSvgs } from './ui/inlineSvgLoader.js';
import { SmartAdjuster } from './ui/smartAdjuster.js';

document.addEventListener('DOMContentLoaded', async () => {
    const svg = document.getElementById('carCanvas');
    const drawingGroup = document.getElementById('drawingGroup');
    const canvasArea = document.getElementById('canvasArea');
    const canvasContent = document.getElementById('canvasContent');
    const imageOverlayWrapper = document.getElementById('imageOverlayWrapper');
    const alignCancelBtn = document.getElementById('alignCancelBtn');
    const alignTopBar = document.getElementById('alignTopBar');
    const alignInput = document.getElementById('alignWheelBaseInput');
    const alignConfirmBtn = document.getElementById('alignConfirmBtn');
    const alignImageBtn = document.getElementById('alignImageBtn');

    const inputs = {
        tireDiameter: document.getElementById('tireDiameter'),
        wheelArchGap: document.getElementById('wheelArchGap'),
        wheelBase: document.getElementById('wheelBase'),
        groundClearance: document.getElementById('groundClearance'),
        floorThickness: document.getElementById('floorThickness'),
        frontOverhang: document.getElementById('frontOverhang'),
        rearOverhang: document.getElementById('rearOverhang'),
        frontApproachAngle: document.getElementById('frontApproachAngle'),
        rearDepartureAngle: document.getElementById('rearDepartureAngle'),
        hPointHeight: document.getElementById('hPointHeight'),
        hPointX: document.getElementById('hPointX'),
        hipPedalDistance: document.getElementById('hipPedalDistance'),
        bodyReclineAngle: document.getElementById('bodyReclineAngle'),
        handHeight: document.getElementById('handHeight'),
        handDistanceX: document.getElementById('handDistanceX'),
        mannequinHeight: document.getElementById('mannequinHeight'),
        showMannequin: document.getElementById('showMannequin')
    };

    const displays = {
        tireDiameter: document.getElementById('tireDiameterVal'),
        wheelArchGap: document.getElementById('wheelArchGapVal'),
        wheelBase: document.getElementById('wheelBaseVal'),
        groundClearance: document.getElementById('groundClearanceVal'),
        floorThickness: document.getElementById('floorThicknessVal'),
        frontOverhang: document.getElementById('frontOverhangVal'),
        rearOverhang: document.getElementById('rearOverhangVal'),
        frontApproachAngle: document.getElementById('frontApproachAngleVal'),
        rearDepartureAngle: document.getElementById('rearDepartureAngleVal'),
        hPointHeight: document.getElementById('hPointHeightVal'),
        hPointX: document.getElementById('hPointXVal'),
        hipPedalDistance: document.getElementById('hipPedalDistanceVal'),
        bodyReclineAngle: document.getElementById('bodyReclineAngleVal'),
        handHeight: document.getElementById('handHeightVal'),
        handDistanceX: document.getElementById('handDistanceXVal')
    };

    const stateManager = new StateManager({ inputs, displays });

    await loadInlineSvgs(document.querySelectorAll('[data-inline-svg]'));

    const layerController = new LayerController({
        buttons: document.querySelectorAll('.layer-button'),
        controlGroups: document.querySelectorAll('[data-layer-controls]')
    });

    const chassisRenderer = new ChassisRenderer({
        svg,
        drawingGroup,
        canvasArea,
        stateManager,
        layerController
    });

    const humanFigureRenderer = new HumanFigureRenderer({
        canvasArea,
        canvasContent,
        svg,
        stateManager,
        layerController
    });

    const zoomController = new CanvasZoomController({
        canvasArea,
        svgElement: svg,
        overlayLayers: [canvasContent, imageOverlayWrapper]
    });

    new ImageOverlayManager({
        canvasArea,
        imageFrame: document.getElementById('imageFrame'),
        overlayImage: document.getElementById('overlayImage'),
        resizeHandle: document.getElementById('resizeHandle'),
        imageControls: document.getElementById('imageControls'),
        uploadState: document.getElementById('imageUploadState'),
        editState: document.getElementById('imageEditState'),
        deleteImageBtn: document.getElementById('deleteImageBtn'),
        imageUploadInput: document.getElementById('imageUploadInput'),
        flipImageBtn: document.getElementById('flipImageBtn'),
        alignButton: alignImageBtn,
        alignCancelButton: alignCancelBtn,
        alignTopBar,
        alignInput,
        alignConfirmBtn,
        stateManager,
        layerController
    });

    const render = () => {
        chassisRenderer.draw();
        humanFigureRenderer.update();
    };

    // Initialize Smart Adjusters
    const adjusters = document.querySelectorAll('.smart-adjuster');
    adjusters.forEach(el => {
        new SmartAdjuster(el, stateManager);
    });

    // Handle Smart Toggle
    const showMannequinToggle = document.getElementById('showMannequinToggle');
    if (showMannequinToggle) {
        const toggleValue = showMannequinToggle.querySelector('.toggle-value');

        showMannequinToggle.addEventListener('click', () => {
            const currentState = stateManager.state.showMannequin;
            stateManager.setState({ showMannequin: !currentState });
        });

        // Sync initial state
        stateManager.subscribe((state) => {
            const isOn = state.showMannequin;
            if (isOn) {
                showMannequinToggle.classList.add('on');
                showMannequinToggle.classList.remove('off');
                toggleValue.textContent = 'ON';
            } else {
                showMannequinToggle.classList.add('off');
                showMannequinToggle.classList.remove('on');
                toggleValue.textContent = 'OFF';
            }
        });
    }

    stateManager.subscribe(render);

    // Handle Layer Switching for Overlays
    const chassisOverlay = document.getElementById('chassisControls');
    const driverOverlay = document.getElementById('driverControls');
    const imageOverlay = document.getElementById('imageControls');

    const updateOverlays = (activeLayer) => {
        if (chassisOverlay) chassisOverlay.classList.toggle('hidden', activeLayer !== 'chassis');
        if (driverOverlay) driverOverlay.classList.toggle('hidden', activeLayer !== 'driver');
        if (imageOverlay) imageOverlay.classList.toggle('hidden', activeLayer !== 'image');
    };

    // Initial check
    updateOverlays(layerController.selectedLayer);

    layerController.onChange((activeLayer) => {
        render(); // Re-render canvas
        updateOverlays(activeLayer); // Update overlays
    });

    // Handle Interaction Dimming
    // Elements for interaction dimming
    const interactionElements = document.querySelectorAll('.smart-adjuster, .smart-toggle');

    // Handle Interaction Dimming
    stateManager.subscribeInteraction((activeParam) => {
        const activeOverlay = !chassisOverlay.classList.contains('hidden') ? chassisOverlay :
            !driverOverlay.classList.contains('hidden') ? driverOverlay :
                !imageOverlay.classList.contains('hidden') ? imageOverlay : null;

        if (!activeOverlay) return;

        if (activeParam) {
            activeOverlay.classList.add('has-interaction');
            // Update active state for all adjusters
            interactionElements.forEach(el => {
                const p = el.dataset.param;
                // For toggle, param might be implied or explicit? 
                // showMannequinToggle doesn't have data-param in HTML?
                // I need to check index.html.
                // It has id="showMannequinToggle".
                // I should add data-param="showMannequin" to it in index.html?
                // Or handle it here.

                let isActive = false;
                if (Array.isArray(activeParam)) {
                    isActive = activeParam.includes(p);
                } else {
                    isActive = (p === activeParam);
                }

                // Special case for showMannequin toggle if it lacks data-param
                if (el.id === 'showMannequinToggle' && (activeParam === 'showMannequin' || (Array.isArray(activeParam) && activeParam.includes('showMannequin')))) {
                    isActive = true;
                }

                if (isActive) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            });
        } else {
            activeOverlay.classList.remove('has-interaction');
            interactionElements.forEach(el => el.classList.remove('active'));
        }
    });

    const inputHandlers = [
        inputs.tireDiameter,
        inputs.wheelArchGap,
        inputs.wheelBase,
        inputs.groundClearance,
        inputs.floorThickness,
        inputs.frontOverhang,
        inputs.rearOverhang,
        inputs.frontApproachAngle,
        inputs.rearDepartureAngle,
        inputs.hPointHeight,
        inputs.hPointX,
        inputs.hipPedalDistance,
        inputs.bodyReclineAngle,
        inputs.handHeight,
        inputs.handDistanceX
    ];

    inputHandlers.forEach((input) => {
        input.addEventListener('input', () => stateManager.updateFromInputs());
    });

    inputs.mannequinHeight.addEventListener('change', () => stateManager.updateFromInputs());
    inputs.showMannequin.addEventListener('change', () => stateManager.updateFromInputs());

    // Initial render
    stateManager.updateFromInputs();
});

