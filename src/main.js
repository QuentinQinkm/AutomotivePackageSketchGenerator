import { CoordinateSystem } from './utils/coordinateSystem.js';
import { ASSET_COORDS } from './constants.js';
import { ImageOverlayManager } from './image/imageOverlayManager.js';
import { ChassisRenderer } from './renderers/chassisRenderer.js';
import { HumanFigureRenderer } from './renderers/humanFigureRenderer.js';
import { PassengerRenderer } from './renderers/passengerRenderer.js';
import { StateManager } from './state/stateManager.js';
import { LayerController } from './ui/layerController.js';
import { CanvasZoomController } from './ui/canvasZoomController.js';
import { loadInlineSvgs } from './ui/inlineSvgLoader.js';
import { SmartAdjuster } from './ui/smartAdjuster.js';
import { SmartToggle } from './ui/smartToggle.js';
import { ProfileManager } from './utils/profileManager.js';
import { SmartSelectionController } from './ui/smartSelectionController.js';

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


    const hipAssetPosition = {
        x: ASSET_COORDS.parentOffset.x + ASSET_COORDS.hip.x,
        y: ASSET_COORDS.parentOffset.y + ASSET_COORDS.hip.y
    };

    const coordinateSystem = new CoordinateSystem({
        svg,
        canvasArea,
        hipAssetPosition
    });

    // --- Dynamic Defaults Calculation ---
    // User Request: 
    // Mid Row: 500mm from Driver
    // Last Row: (TireSize/2 + WheelArchGap + 100) from Rear Axle (which is relative to RearAxleX)
    // Wait, the input logic is "Distance to Driver".
    // So we need to convert the "Distance to Rear Axle" requirement into "Distance to Driver".

    // Default Values (from HTML inputs or Constants)
    const tireDiameter = parseInt(inputs.tireDiameter.value, 10);
    const wheelArchGap = parseInt(inputs.wheelArchGap.value, 10);
    const wheelBase = parseInt(inputs.wheelBase.value, 10);
    const hPointX = parseInt(inputs.hPointX.value, 10); // Driver Dist from Front Wheel

    // Calculate Rear Axle X (Relative to Front Wheel X) = WheelBase
    // Valid Rear Passenger Pos (relative to Rear Axle X) = -(TireDiameter/2 + WheelArchGap + 100)
    // (Assuming "to the rear axle" means in front of it, so negative offset from rear axle)
    // Let's assume standard packaging: Passenger hip is indeed in front of rear axle.

    const distFromRearAxle = (tireDiameter / 2) + wheelArchGap + 100;
    // Passenger X relative to Front Wheel = WheelBase - distFromRearAxle

    // We need "Distance to Driver".
    // DistToDriver = PassengerX - DriverX
    // DistToDriver = (WheelBase - distFromRearAxle) - hPointX

    const lastRowDefaultDist = Math.round(wheelBase - distFromRearAxle - hPointX);
    const midRowDefaultDist = 500;

    // Apply defaults to StateManager (which will sync inputs via subscribers/displays)
    stateManager.setState({
        midRowHPointX: midRowDefaultDist,
        passengerHPointX: lastRowDefaultDist
    }, { silent: true }); // Silent to avoid initial render burst? Or maybe false to ensure UI sync?
    // Actually, we want UI to sync. Silent=false.
    // Wait, setState syncs inputs if we implemented that method.

    // Explicitly update inputs just in case StateManager sync isn't fully wired for init
    if (inputs.midRowHPointX) inputs.midRowHPointX.value = midRowDefaultDist;
    if (inputs.passengerHPointX) inputs.passengerHPointX.value = lastRowDefaultDist;

    // Force display update via notify?
    stateManager.notify();
    // ------------------------------------

    try {
        await loadInlineSvgs(document.querySelectorAll('[data-inline-svg]'));
    } catch (e) {
        console.error('Failed to load inline SVGs:', e);
    }

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
        layerController,
        coordinateSystem // Injected
    });

    const midRowRenderer = new PassengerRenderer({
        canvasArea,
        canvasContent,
        stateManager,
        layerController,
        svg,
        coordinateSystem, // Injected
        config: {
            parentSelector: '.passenger-parent-mid',
            statePrefix: 'midRow',
            toggleKey: 'showMidRow',
            anchorLayerClass: 'passenger-anchor-layer-mid',
            isMidRow: true,
            layerName: 'passenger'
        }
    });

    const lastRowRenderer = new PassengerRenderer({
        canvasArea,
        canvasContent,
        stateManager,
        layerController,
        svg,
        coordinateSystem, // Injected
        config: {
            parentSelector: '.passenger-parent-last',
            statePrefix: 'passenger',
            toggleKey: 'showLastRow',
            anchorLayerClass: 'passenger-anchor-layer-last',
            isMidRow: false,
            layerName: 'passenger'
        }
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


    const smartSelectionController = new SmartSelectionController({
        canvasArea,
        layerController,
        stateManager
    });

    const clampByAdjuster = (param, value) => {
        if (!Number.isFinite(value)) return value;
        let minVal = -Infinity;
        let maxVal = Infinity;
        const adjuster = document.querySelector(`.smart-adjuster[data-param="${param}"]`);
        if (adjuster) {
            const parsedMin = parseFloat(adjuster.dataset.min);
            const parsedMax = parseFloat(adjuster.dataset.max);
            if (Number.isFinite(parsedMin)) minVal = parsedMin;
            if (Number.isFinite(parsedMax)) maxVal = parsedMax;
        }
        return Math.max(minVal, Math.min(maxVal, value));
    };

    // Wheelbase & Driver Position Sync Logic for Passenger Rows
    // - Wheelbase change: passengers move with chassis (existing behavior).
    // - Driver H-Point change: keep passengers fixed in world space by updating their
    //   stored "distance to driver" inversely.
    let previousWheelBase = stateManager.state.wheelBase; // Init with current value
    let previousHPointX = stateManager.state.hPointX;
    stateManager.subscribe((newState) => {
        const updates = {};

        if (newState.wheelBase !== previousWheelBase) {
            const delta = newState.wheelBase - previousWheelBase;
            previousWheelBase = newState.wheelBase;

            updates.passengerHPointX = (newState.passengerHPointX || 0) + delta;
            updates.midRowHPointX = (newState.midRowHPointX || 0) + (delta / 2);
        }

        if (newState.hPointX !== previousHPointX) {
            const deltaDriver = newState.hPointX - previousHPointX;
            previousHPointX = newState.hPointX;

            const basePassengerDist = updates.passengerHPointX !== undefined ? updates.passengerHPointX : (newState.passengerHPointX || 0);
            const baseMidRowDist = updates.midRowHPointX !== undefined ? updates.midRowHPointX : (newState.midRowHPointX || 0);

            updates.passengerHPointX = basePassengerDist - deltaDriver;
            updates.midRowHPointX = baseMidRowDist - deltaDriver;
        }

        if (Object.keys(updates).length) {
            stateManager.setState({
                passengerHPointX: clampByAdjuster('passengerHPointX', updates.passengerHPointX),
                midRowHPointX: clampByAdjuster('midRowHPointX', updates.midRowHPointX)
            });
        }
    });

    const render = (state, context) => {
        try {
            humanFigureRenderer.update(context);
            midRowRenderer.update(context);
            lastRowRenderer.update(context);
            chassisRenderer.draw(context);
        } catch (e) {
            console.error('Render Loop Error:', e);
        }
    };

    // Initialize Smart Adjusters
    // Initialize Smart Adjusters (re-run to catch new elements if any, or just run once is fine since we added HTML before DOMContentLoaded)
    // Actually adjusters querySelectorAll runs once. Since we added HTML to index.html, it's already there. 
    // Just need to make sure we don't init twice if we were dynamically adding. But we edited static HTML.

    const adjusters = document.querySelectorAll('.smart-adjuster');
    adjusters.forEach(el => {
        // Simple check to avoid double init if we were to run this multiple times
        if (!el.dataset.initialized) {
            new SmartAdjuster(el, stateManager);
            el.dataset.initialized = 'true';
        }
    });

    // Handle Smart Toggle
    const handleToggle = (toggleId, stateKey) => {
        const toggleEl = document.getElementById(toggleId);
        if (toggleEl) {
            const toggleValue = toggleEl.querySelector('.toggle-value');

            toggleEl.addEventListener('click', () => {
                const currentState = stateManager.state[stateKey];
                // If stateKey doesn't exist yet, default to true/false? 
                // StateManager should handle undefined, or we should init state.
                stateManager.setState({ [stateKey]: !currentState });
            });

            stateManager.subscribe((state) => {
                const isOn = state[stateKey];
                if (isOn) {
                    toggleEl.classList.add('on');
                    toggleEl.classList.remove('off');
                    toggleValue.textContent = 'ON';
                } else {
                    toggleEl.classList.add('off');
                    toggleEl.classList.remove('on');
                    toggleValue.textContent = 'OFF';
                }
            });
        }
    };

    handleToggle('showMannequinToggle', 'showMannequin');
    handleToggle('showMannequinToggle', 'showMannequin');
    handleToggle('showLastRowToggle', 'showLastRow');
    handleToggle('showMidRowToggle', 'showMidRow');



    stateManager.subscribe(render);

    // Handle Layer Switching for Overlays
    const chassisOverlay = document.getElementById('chassisControls');
    const driverOverlay = document.getElementById('driverControls');
    const passengerOverlay = document.getElementById('passengerControls');
    const imageOverlay = document.getElementById('imageControls');
    const profileOverlay = document.getElementById('profileControlsOverlay');
    const controlsInfill = document.querySelector('.controls-infill');

    const overlayElements = [chassisOverlay, driverOverlay, passengerOverlay, imageOverlay, profileOverlay].filter(Boolean);

    const updateControlsBackdropOffset = () => {
        if (!canvasArea) return;
        const canvasRect = canvasArea.getBoundingClientRect();
        const activeOverlay = overlayElements.find((overlay) => !overlay.classList.contains('hidden'));

        let offset = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--controls-backdrop-offset'), 10);
        if (!Number.isFinite(offset)) {
            offset = 0;
        }

        if (activeOverlay) {
            const overlayRect = activeOverlay.getBoundingClientRect();
            // The visual start of the controls (without the gradient buffer)
            const contentHeight = Math.round(canvasRect.bottom - overlayRect.top);
            // The backdrop height (with gradient buffer)
            offset = contentHeight + 120;

            document.documentElement.style.setProperty('--controls-content-height', `${contentHeight + 20}px`);
        } else {
            document.documentElement.style.setProperty('--controls-content-height', `20px`);
        }

        offset = Math.max(0, Math.min(canvasRect.height, offset));
        document.documentElement.style.setProperty('--controls-backdrop-offset', `${offset}px`);

        if (controlsInfill) {
            if (offset > 0) {
                controlsInfill.classList.add('visible');
            } else {
                controlsInfill.classList.remove('visible');
            }
        }
    };

    const updateOverlays = (activeLayer) => {
        if (chassisOverlay) chassisOverlay.classList.toggle('hidden', activeLayer !== 'chassis');
        if (driverOverlay) driverOverlay.classList.toggle('hidden', activeLayer !== 'driver');
        if (passengerOverlay) passengerOverlay.classList.toggle('hidden', activeLayer !== 'passenger');
        if (imageOverlay) imageOverlay.classList.toggle('hidden', activeLayer !== 'image');
        if (profileOverlay) profileOverlay.classList.toggle('hidden', activeLayer !== 'profile');
        updateControlsBackdropOffset();
    };

    // Initial check
    updateOverlays(layerController.selectedLayer);

    layerController.onChange((activeLayer) => {
        render(); // Re-render canvas
        updateOverlays(activeLayer); // Update overlays
    });

    window.addEventListener('resize', updateControlsBackdropOffset);

    // Handle Interaction Dimming
    // Elements for interaction dimming
    const interactionElements = document.querySelectorAll('.smart-adjuster, .smart-toggle');

    // Handle Interaction Dimming
    stateManager.subscribeInteraction((activeParam) => {
        const activeOverlay = overlayElements.find((overlay) => !overlay.classList.contains('hidden')) || null;

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
    ].filter(Boolean);

    inputHandlers.filter(input => input).forEach((input) => {
        input.addEventListener('input', () => stateManager.updateFromInputs());
    });

    if (inputs.mannequinHeight) {
        inputs.mannequinHeight.addEventListener('change', () => stateManager.updateFromInputs());
    }
    if (inputs.showMannequin) {
        inputs.showMannequin.addEventListener('change', () => stateManager.updateFromInputs());
    }

    // Initialize Profile Manager
    // Initialize Profile Manager
    const profileManager = new ProfileManager(stateManager);
    const createNewProfileBtn = document.getElementById('createNewProfileBtn');
    const uploadProfileBtn = document.getElementById('uploadProfileBtn');
    const loadProfileInput = document.getElementById('loadProfileInput');
    const overwriteProfileInput = document.getElementById('overwriteProfileInput');
    const profileResetBtn = document.getElementById('profileResetBtn');
    const profileOverwriteBtn = document.getElementById('profileOverwriteBtn');
    const profileDownloadBtn = document.getElementById('profileDownloadBtn');
    const profileLimitMessage = document.getElementById('profileLimitMessage');

    if (createNewProfileBtn) {
        createNewProfileBtn.addEventListener('click', () => {
            profileManager.addProfile();
        });
    }

    if (uploadProfileBtn) {
        uploadProfileBtn.addEventListener('click', () => {
            if (loadProfileInput) loadProfileInput.click();
        });
    }

    if (loadProfileInput) {
        loadProfileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                profileManager.loadProfile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    const confirmReset = () => {
        if (confirm('Reset canvas to default values? This will overwrite current changes.')) {
            profileManager.resetCanvas();
        }
    };

    if (profileResetBtn) {
        profileResetBtn.addEventListener('click', confirmReset);
    }

    if (profileOverwriteBtn && overwriteProfileInput) {
        profileOverwriteBtn.addEventListener('click', () => overwriteProfileInput.click());
    }

    if (overwriteProfileInput) {
        overwriteProfileInput.addEventListener('change', (e) => {
            if (e.target.files.length > 0) {
                profileManager.overwriteProfileFromFile(e.target.files[0]);
                e.target.value = '';
            }
        });
    }

    if (profileDownloadBtn) {
        profileDownloadBtn.addEventListener('click', () => profileManager.saveProfile());
    }

    const downloadSvgBtn = document.getElementById('downloadSvgBtn');
    if (downloadSvgBtn) {
        downloadSvgBtn.addEventListener('click', () => profileManager.downloadSVG());
    }

    const syncProfileLimitUI = (count) => {
        const limitReached = count >= 5;
        if (createNewProfileBtn) createNewProfileBtn.classList.toggle('hidden', limitReached);
        if (uploadProfileBtn) uploadProfileBtn.classList.toggle('hidden', limitReached);
        if (profileLimitMessage) profileLimitMessage.classList.toggle('hidden', !limitReached);
    };

    profileManager.onProfileCountChange(syncProfileLimitUI);

    // Assist Line Toggle
    const assistLineToggle = new SmartToggle(document.getElementById('assistLineToggle'), stateManager, 'showAssistLines');

    // Handle Snapshot
    const takeSnapshotBtn = document.getElementById('takeSnapshotBtn');
    if (takeSnapshotBtn) {
        takeSnapshotBtn.addEventListener('click', async () => {
            // Use html2canvas for a simpler, more robust snapshot
            const canvasArea = document.getElementById('canvasArea');
            if (!canvasArea) return;

            // 1. Temporarily hide UI elements inside canvasArea
            const uiIds = [
                'profileBarContainer',
                'profileControls',
                'alignTopBar',
                'blindZoneDisplay',
                'alignCancelBtn',
                'resizeHandle' // Hide the resize handle on the image
            ];

            const hiddenElements = [];
            uiIds.forEach(id => {
                const el = document.getElementById(id);
                if (el && el.style.display !== 'none' && !el.classList.contains('hidden')) {
                    hiddenElements.push({ el, originalDisplay: el.style.display });
                    el.style.display = 'none';
                }
            });

            // Also hide the resize handle if it's visible (it's inside imageFrame)
            const resizeHandle = document.getElementById('resizeHandle');
            if (resizeHandle) {
                hiddenElements.push({ el: resizeHandle, originalDisplay: resizeHandle.style.display });
                resizeHandle.style.display = 'none';
            }

            console.log('Snapshot: Capturing with html2canvas...');

            // Trigger Flash Animation
            const flashEl = document.getElementById('snapshotFlash');
            if (flashEl) {
                // Remove transition temporarily to set initial opacity instantly
                flashEl.style.transition = 'none';
                flashEl.style.opacity = '0.8';

                // Force reflow
                flashEl.offsetHeight;

                // Restore transition for fade out
                flashEl.style.transition = 'opacity 0.5s ease-out';
            }

            // 2. Capture
            // Use transparent background
            html2canvas(canvasArea, {
                backgroundColor: null,
                scale: 2, // Higher quality
                logging: false,
                useCORS: true, // For images
                ignoreElements: (element) => {
                    // Double check we don't capture unwanted UI if they weren't caught by ID
                    if (element.classList.contains('smart-adjuster') ||
                        element.classList.contains('controls-infill') ||
                        element.id === 'snapshotFlash') { // Ignore the flash element itself
                        return true;
                    }
                    return false;
                }
            }).then(canvas => {
                // 3. Restore UI
                hiddenElements.forEach(item => {
                    item.el.style.display = item.originalDisplay;
                });

                // Fade out flash
                if (flashEl) {
                    flashEl.style.opacity = '0';
                }

                // 4. Download
                try {
                    const pngUrl = canvas.toDataURL('image/png');
                    const downloadLink = document.createElement('a');
                    downloadLink.href = pngUrl;
                    downloadLink.download = `car-profile-${Date.now()}.png`;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);
                    console.log('Snapshot: Download triggered.');
                } catch (e) {
                    console.error('Snapshot: Error saving canvas', e);
                    alert('Error saving snapshot.');
                }
            }).catch(err => {
                console.error('Snapshot: html2canvas failed', err);
                alert('Error generating snapshot.');
                // Restore UI in case of error
                hiddenElements.forEach(item => {
                    item.el.style.display = item.originalDisplay;
                });
            });
        });
    }

    // Initial render
    // Handle Passenger Row Tabs (Mid / Last)
    const passengerRowTabs = document.querySelectorAll('.passenger-row-tabs-btn');
    const midRowControls = document.getElementById('midRowControls');
    const lastRowControls = document.getElementById('lastRowControls');

    passengerRowTabs.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();

            // Force switch to passenger layer if not already active
            if (layerController.selectedLayer !== 'passenger') {
                layerController.setActiveLayer('passenger');
            }

            const target = btn.dataset.target; // 'mid' or 'last'
            stateManager.setState({ activePassengerRow: target });
        });
    });

    stateManager.subscribe((state) => {
        const activeRow = state.activePassengerRow || 'last';

        passengerRowTabs.forEach(btn => {
            const target = btn.dataset.target;
            btn.classList.toggle('active', target === activeRow);
        });

        if (activeRow === 'mid') {
            midRowControls.classList.remove('hidden');
            lastRowControls.classList.add('hidden');
        } else {
            midRowControls.classList.add('hidden');
            lastRowControls.classList.remove('hidden');
        }
    });

    // Initial render
    stateManager.updateFromInputs();
    render();
});
