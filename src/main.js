import { ImageOverlayManager } from './image/imageOverlayManager.js';
import { ChassisRenderer } from './renderers/chassisRenderer.js';
import { HumanFigureRenderer } from './renderers/humanFigureRenderer.js';
import { StateManager } from './state/stateManager.js';
import { LayerController } from './ui/layerController.js';

document.addEventListener('DOMContentLoaded', () => {
    const svg = document.getElementById('carCanvas');
    const drawingGroup = document.getElementById('drawingGroup');
    const canvasArea = document.getElementById('canvasArea');

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
        stateManager
    });

    new ImageOverlayManager({
        canvasArea,
        imageFrame: document.getElementById('imageFrame'),
        overlayImage: document.getElementById('overlayImage'),
        resizeHandle: document.getElementById('resizeHandle'),
        toggleImageButton: document.getElementById('toggleImageEdit'),
        imageControls: document.getElementById('imageControls'),
        imageToolbar: document.querySelector('.image-toolbar'),
        deleteImageBtn: document.getElementById('deleteImage'),
        opacitySlider: document.getElementById('imageOpacity'),
        imageUploadInput: document.getElementById('imageUpload'),
        flipImageBtn: document.getElementById('flipImage'),
        rotationSlider: document.getElementById('imageRotate')
    });

    const render = () => {
        chassisRenderer.draw();
        humanFigureRenderer.update();
    };

    stateManager.subscribe(render);

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

