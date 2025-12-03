import { ImageOverlayManager } from './image/imageOverlayManager.js';
import { ChassisRenderer } from './renderers/chassisRenderer.js';
import { HumanFigureRenderer } from './renderers/humanFigureRenderer.js';
import { StateManager } from './state/stateManager.js';
import { LayerController } from './ui/layerController.js';
import { CanvasZoomController } from './ui/canvasZoomController.js';
import { loadInlineSvgs } from './ui/inlineSvgLoader.js';
import { SmartAdjuster } from './ui/smartAdjuster.js';
import { SmartToggle } from './ui/smartToggle.js';
import { ProfileManager } from './utils/profileManager.js';

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

    const render = (state, context) => {
        humanFigureRenderer.update(context);
        chassisRenderer.draw(context);
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
    const profileOverlay = document.getElementById('profileControlsOverlay');
    const controlsInfill = document.querySelector('.controls-infill');

    const overlayElements = [chassisOverlay, driverOverlay, imageOverlay, profileOverlay].filter(Boolean);

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
    ];

    inputHandlers.forEach((input) => {
        input.addEventListener('input', () => stateManager.updateFromInputs());
    });

    inputs.mannequinHeight.addEventListener('change', () => stateManager.updateFromInputs());
    inputs.showMannequin.addEventListener('change', () => stateManager.updateFromInputs());

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
    // Initial render
    stateManager.updateFromInputs();
    render();
});
