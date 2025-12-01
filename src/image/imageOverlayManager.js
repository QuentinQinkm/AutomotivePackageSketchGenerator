import { CENTER_X, GROUND_Y, MIN_FRAME_HEIGHT, MIN_FRAME_WIDTH, SCALE } from '../constants.js';

export class ImageOverlayManager {
    constructor({
        canvasArea,
        imageFrame,
        overlayImage,
        resizeHandle,
        imageControls, // The overlay container
        uploadState,   // The upload UI container
        editState,     // The edit UI container
        deleteImageBtn,
        imageUploadInput,
        flipImageBtn,
        alignButton,
        alignCancelButton,
        alignTopBar,
        alignInput,
        alignConfirmBtn,
        stateManager,
        layerController = null
    }) {
        this.canvasArea = canvasArea;
        this.imageFrame = imageFrame;
        this.overlayImage = overlayImage;
        this.resizeHandle = resizeHandle;
        this.imageControls = imageControls;
        this.uploadState = uploadState;
        this.editState = editState;
        this.deleteImageBtn = deleteImageBtn;
        this.imageUploadInput = imageUploadInput;
        this.flipImageBtn = flipImageBtn;
        this.alignButton = alignButton;
        this.alignCancelButton = alignCancelButton;
        this.alignTopBar = alignTopBar;
        this.alignInput = alignInput;
        this.alignConfirmButton = alignConfirmBtn;
        this.stateManager = stateManager;
        this.layerController = layerController;

        this.alignDotsLayer = document.createElement('div');
        this.alignDotsLayer.className = 'align-dots-layer';
        if (this.resizeHandle && this.resizeHandle.parentNode === this.imageFrame) {
            this.imageFrame.insertBefore(this.alignDotsLayer, this.resizeHandle);
        } else {
            this.imageFrame.appendChild(this.alignDotsLayer);
        }

        this.hasImageOverlay = false;
        this.imageFlipped = false;
        this.imageRotation = 0;
        this.imageScale = 100;
        this.scaleBaseFrame = null;
        this.isApplyingScale = false;
        this.suppressScaleApply = false;
        this.dragState = null;
        this.resizeState = null;
        this.alignDots = [];
        this.isAlignModeActive = false;
        this.draggingAlignDot = null;
        this.isResizing = false;
        this.isDraggingFrame = false;
        this.activeResizeCursor = null;

        const wheelBaseInput = this.stateManager.inputs?.wheelBase;
        const minWheelBase = wheelBaseInput ? parseInt(wheelBaseInput.min, 10) : 1000;
        const maxWheelBase = wheelBaseInput ? parseInt(wheelBaseInput.max, 10) : 5000;
        this.alignWheelBaseBounds = {
            min: Number.isFinite(minWheelBase) ? minWheelBase : 1000,
            max: Number.isFinite(maxWheelBase) ? maxWheelBase : 5000
        };

        if (this.alignInput) {
            this.alignInput.min = this.alignWheelBaseBounds.min;
            this.alignInput.max = this.alignWheelBaseBounds.max;
        }

        this.#bindEvents();
        this.#bindAlignEvents();
        this.#setAlignButtonAvailability(false);
        this.#updateImageEditingState();
        if (this.layerController) {
            this.layerController.onChange(() => this.#updateImageEditingState());
        }

        this.boundStateListener = (state) => this.#handleStateSync(state);
        this.stateManager.subscribe(this.boundStateListener);
        this.#handleStateSync(this.stateManager.getState());
    }

    #bindEvents() {
        this.imageUploadInput.addEventListener('change', (event) => {
            const [file] = event.target.files || [];
            this.#handleImageFile(file);
            event.target.value = '';
        });

        this.deleteImageBtn.addEventListener('click', () => {
            if (!this.hasImageOverlay) return;
            this.hasImageOverlay = false;
            this.overlayImage.src = '';
            this.imageFrame.classList.remove('has-image');
            this.exitAlignMode(true);
            this.#setAlignButtonAvailability(false);

            // Reset state
            this.imageRotation = 0;
            this.imageFlipped = false;
             this.imageScale = 100;
             this.scaleBaseFrame = null;
            this.lastImageData = null;
            const emptyFrame = this.#getEmptyFrame();
            this.#applyFrameState(emptyFrame);
            this.stateManager.setState({
                imageData: null,
                imageFrame: emptyFrame,
                imageRotation: 0,
                imageOpacity: 50,
                imageFlipped: false,
                imageScale: 100
            });

            this.#applyImageTransform();
            this.#updateImageEditingState();
        });

        this.flipImageBtn.addEventListener('click', () => {
            if (!this.hasImageOverlay) return;
            this.imageFlipped = !this.imageFlipped;
            this.#applyImageTransform();
        });


        this.canvasArea.addEventListener('dragover', (event) => {
            event.preventDefault();
            this.canvasArea.classList.add('drag-over');
        });

        this.canvasArea.addEventListener('dragleave', (event) => {
            if (!this.canvasArea.contains(event.relatedTarget)) {
                this.canvasArea.classList.remove('drag-over');
            }
        });

        this.canvasArea.addEventListener('drop', (event) => {
            event.preventDefault();
            this.canvasArea.classList.remove('drag-over');
            const files = event.dataTransfer?.files;
            if (files?.length) {
                this.#handleImageFile(files[0]);
            }
        });
    }

    #bindAlignEvents() {
        if (this.alignButton) {
            this.alignButton.addEventListener('click', () => {
                if (this.alignButton.disabled) return;
                this.enterAlignMode();
            });
        }

        if (this.alignCancelButton) {
            this.alignCancelButton.addEventListener('click', () => this.exitAlignMode(true));
        }

        if (this.alignInput) {
            this.alignInput.addEventListener('input', () => this.#handleAlignInputChange());
            this.alignInput.addEventListener('blur', () => {
                let value = parseInt(this.alignInput.value, 10);
                if (Number.isFinite(value)) {
                    value = Math.round(value / 50) * 50;
                    // Clamp
                    value = Math.max(this.alignWheelBaseBounds.min, Math.min(this.alignWheelBaseBounds.max, value));
                    this.alignInput.value = value;
                    this.#handleAlignInputChange();
                }
            });
        }

        if (this.alignConfirmButton) {
            this.alignConfirmButton.addEventListener('click', () => this.confirmAlignment());
        }

        this.imageFrame.addEventListener('click', (event) => this.#handleAlignClick(event));
        this.imageFrame.addEventListener('pointerdown', (event) => this.#handleFramePointerDown(event));
        this.imageFrame.addEventListener('pointermove', (event) => this.#updateFrameCursor(event));
        this.imageFrame.addEventListener('pointerleave', () => this.#resetFrameCursor());
    }

    #updateImageEditingState() {
        const imageLayerActive = this.#isImageLayerActive();
        const canEditImage = this.hasImageOverlay && imageLayerActive;
        const isEditing = canEditImage || this.isAlignModeActive;

        // Toggle between Upload and Edit states
        if (this.hasImageOverlay) {
            this.uploadState.classList.add('hidden');
            this.editState.classList.remove('hidden');
        } else {
            this.uploadState.classList.remove('hidden');
            this.editState.classList.add('hidden');
        }

        this.imageFrame.classList.toggle('editing', isEditing);
        this.canvasArea.classList.toggle('editing-image', isEditing);
        this.#resetFrameCursor();
    }

    enterAlignMode() {
        if (!this.hasImageOverlay || this.isAlignModeActive) return;
        this.isAlignModeActive = true;
        document.body.classList.add('align-mode');
        this.alignCancelButton?.classList.remove('hidden');
        this.#clearAlignDots();
        this.alignTopBar?.classList.add('hidden');
        if (this.alignInput) {
            this.alignInput.value = '';
        }
        if (this.alignConfirmButton) {
            this.alignConfirmButton.disabled = true;
        }
        this.#updateAlignWorkflowState();
        this.#updateImageEditingState();
    }

    exitAlignMode(resetDots = false) {
        if (!this.isAlignModeActive && !resetDots) return;
        this.isAlignModeActive = false;
        document.body.classList.remove('align-mode');
        this.alignCancelButton?.classList.add('hidden');
        this.alignTopBar?.classList.add('hidden');
        if (resetDots) {
            this.#clearAlignDots();
        }
        this.#stopAlignDotDrag();
        if (this.alignInput) {
            this.alignInput.value = '';
        }
        if (this.alignConfirmButton) {
            this.alignConfirmButton.disabled = true;
        }
        this.#updateAlignWorkflowState();
        this.#updateImageEditingState();
    }

    #handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            // We load it into an image object first to get dimensions/aspect ratio
            const tempImg = new Image();
            tempImg.onload = () => {
                this.aspectRatio = tempImg.naturalWidth / tempImg.naturalHeight;

                // Calculate initial frame
                const frame = this.#calculateInitialFrame();

                // Update state
                this.stateManager.setState({
                    imageData: reader.result,
                    imageOpacity: 50,
                    imageRotation: 0,
                    imageFlipped: false,
                    imageScale: 100,
                    imageFrame: frame
                });
            };
            tempImg.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    #calculateInitialFrame() {
        // Calculate logical center based on current viewport
        const rect = this.canvasArea.getBoundingClientRect();
        const zoomScale = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const zoomOffsetX = parseFloat(this.canvasArea.dataset.zoomOffsetX || '0');
        const zoomOffsetY = parseFloat(this.canvasArea.dataset.zoomOffsetY || '0');

        // Visible center in screen coordinates (relative to canvasArea)
        const visibleCenterX = rect.width / 2;
        const visibleCenterY = rect.height / 2;

        // Convert to logical coordinates
        const logicalCenterX = (visibleCenterX - zoomOffsetX) / zoomScale;
        const logicalCenterY = (visibleCenterY - zoomOffsetY) / zoomScale;

        // Determine initial size (logical pixels)
        // We want it to be a reasonable size relative to the viewport, say 50% of visible width
        const visibleWidthLogical = rect.width / zoomScale;
        let width = Math.max(MIN_FRAME_WIDTH, visibleWidthLogical * 0.5);
        let height = width / this.aspectRatio;

        // Ensure height is not too small
        if (height < MIN_FRAME_HEIGHT) {
            height = MIN_FRAME_HEIGHT;
            width = height * this.aspectRatio;
        }

        return {
            x: logicalCenterX - width / 2,
            y: logicalCenterY - height / 2,
            width: width,
            height: height
        };
    }

    #resetImageFrame() {
        // Deprecated, logic moved to #calculateInitialFrame and state update
    }

    #applyImageTransform() {
        const scaleX = this.imageFlipped ? -1 : 1;
        // Round rotation to nearest 0.5
        const roundedRotation = Math.round(this.imageRotation * 2) / 2;
        this.overlayImage.style.transform = `scaleX(${scaleX}) rotate(${roundedRotation}deg)`;

        // Update input if it exists and value differs significantly
        const rotationInput = document.getElementById('imageRotation');
        if (rotationInput && Math.abs(parseFloat(rotationInput.value) - roundedRotation) > 0.1) {
            rotationInput.value = roundedRotation.toFixed(1);
        }
    }

    #handleAlignClick(event) {
        if (!this.isAlignModeActive || this.alignDots.length >= 2) return;
        if (event.target.closest('.align-dot') || event.target === this.resizeHandle) return;
        const point = this.#getNormalizedPoint(event);
        if (!point) return;
        const ratios = this.#convertPointToImageRatios(point);
        if (!ratios) return;
        this.#addAlignDot(ratios);
    }

    #convertPointToImageRatios(point) {
        const width = this.imageFrame.offsetWidth || 0;
        const height = this.imageFrame.offsetHeight || 0;
        if (width <= 0 || height <= 0) return null;
        const left = parseFloat(this.imageFrame.style.left) || 0;
        const top = parseFloat(this.imageFrame.style.top) || 0;
        const rawX = (point.x - left) / width;
        const rawY = (point.y - top) / height;
        if (!Number.isFinite(rawX) || !Number.isFinite(rawY)) return null;
        return {
            x: Math.max(0, Math.min(1, rawX)),
            y: Math.max(0, Math.min(1, rawY))
        };
    }

    #addAlignDot({ x, y }) {
        if (this.alignDots.length >= 2) return;
        const dotElement = document.createElement('div');
        dotElement.className = 'align-dot';
        this.alignDotsLayer.appendChild(dotElement);
        const dotData = { element: dotElement, xRatio: x, yRatio: y };
        this.alignDots.push(dotData);
        this.#positionAlignDot(dotData);
        dotElement.addEventListener('pointerdown', (event) => this.#startAlignDotDrag(dotData, event));
        this.#updateAlignWorkflowState();
    }

    #positionAlignDot(dotData) {
        const width = this.imageFrame.offsetWidth || 0;
        const height = this.imageFrame.offsetHeight || 0;
        dotData.element.style.left = `${dotData.xRatio * width}px`;
        dotData.element.style.top = `${dotData.yRatio * height}px`;
    }

    #refreshAlignDots() {
        this.alignDots.forEach((dot) => this.#positionAlignDot(dot));
    }

    #startAlignDotDrag(dotData, event) {
        if (!this.isAlignModeActive) return;
        event.preventDefault();
        event.stopPropagation();
        this.draggingAlignDot = dotData;
        this.boundAlignDotMove = (e) => this.#handleAlignDotDragMove(e);
        this.boundAlignDotUp = () => this.#stopAlignDotDrag();
        window.addEventListener('pointermove', this.boundAlignDotMove);
        window.addEventListener('pointerup', this.boundAlignDotUp);
    }

    #handleAlignDotDragMove(event) {
        if (!this.draggingAlignDot) return;
        const point = this.#getNormalizedPoint(event);
        if (!point) return;
        const ratios = this.#convertPointToImageRatios(point);
        if (!ratios) return;
        this.draggingAlignDot.xRatio = ratios.x;
        this.draggingAlignDot.yRatio = ratios.y;
        this.#positionAlignDot(this.draggingAlignDot);
    }

    #stopAlignDotDrag() {
        if (!this.draggingAlignDot) return;
        window.removeEventListener('pointermove', this.boundAlignDotMove);
        window.removeEventListener('pointerup', this.boundAlignDotUp);
        this.draggingAlignDot = null;
    }

    #updateAlignWorkflowState() {
        if (!this.alignTopBar) return;
        if (this.isAlignModeActive && this.alignDots.length === 2) {
            this.alignTopBar.classList.remove('hidden');
            if (this.alignInput && !this.alignInput.value) {
                this.alignInput.value = this.stateManager.state?.wheelBase ?? '';
            }
        } else {
            this.alignTopBar.classList.add('hidden');
            if (this.alignInput) {
                this.alignInput.value = '';
            }
        }
        if (this.alignConfirmButton) {
            this.alignConfirmButton.disabled = true;
        }
        this.#handleAlignInputChange();
    }

    #handleAlignInputChange() {
        if (!this.alignConfirmButton || !this.alignInput) return;
        let value = parseInt(this.alignInput.value, 10);

        // Round to nearest 50
        if (Number.isFinite(value)) {
            // Only round if the user has stopped typing? 
            // Or just validate? 
            // The user asked to "make the input round to the nearest 50 interval".
            // If I round while typing, it might be annoying.
            // But usually "input round to" means the final value or the step.
            // I will enforce step=50 in HTML and validate here.
            // Actually, I'll round the value used for validation/confirmation, 
            // but maybe not the input value immediately while typing unless on blur.
            // Let's add a blur listener for rounding the input display.
        }

        const isValid = this.isAlignModeActive &&
            this.alignDots.length === 2 &&
            Number.isFinite(value) &&
            value >= this.alignWheelBaseBounds.min &&
            value <= this.alignWheelBaseBounds.max;
        this.alignConfirmButton.disabled = !isValid;
    }

    confirmAlignment() {
        if (!this.isAlignModeActive || this.alignDots.length < 2 || !this.alignInput) return;
        const wheelBaseValue = parseInt(this.alignInput.value, 10);
        if (!Number.isFinite(wheelBaseValue) ||
            wheelBaseValue < this.alignWheelBaseBounds.min ||
            wheelBaseValue > this.alignWheelBaseBounds.max) {
            return;
        }

        this.stateManager.setState({ wheelBase: wheelBaseValue });
        this.#applyAlignmentTransform(wheelBaseValue);

        // Save the new frame state after alignment
        const frame = {
            x: parseFloat(this.imageFrame.style.left) || 0,
            y: parseFloat(this.imageFrame.style.top) || 0,
            width: parseFloat(this.imageFrame.style.width) || 0,
            height: parseFloat(this.imageFrame.style.height) || 0
        };
        this.stateManager.setState({ imageFrame: frame });
        this.#setScaleBaselineFromFrame(frame, { resetScale: true });

        this.exitAlignMode(true);
    }

    #applyAlignmentTransform(wheelBaseValue) {
        if (this.alignDots.length < 2) return;
        const orderedDots = this.#getOrderedAlignDots();
        if (!orderedDots) return;

        const { frontDot, rearDot } = orderedDots;

        const currentWidth = this.imageFrame.offsetWidth || 0;
        const currentHeight = this.imageFrame.offsetHeight || 0;
        if (currentWidth === 0 || currentHeight === 0) return;

        const center = { x: currentWidth / 2, y: currentHeight / 2 };
        const frontPx = {
            x: (frontDot.xRatio * currentWidth),
            y: (frontDot.yRatio * currentHeight)
        };
        const rearPx = {
            x: (rearDot.xRatio * currentWidth),
            y: (rearDot.yRatio * currentHeight)
        };

        const dx = rearPx.x - frontPx.x;
        const dy = rearPx.y - frontPx.y;
        const distPx = Math.hypot(dx, dy);

        if (distPx < 1) return;

        const currentAngleRad = Math.atan2(dy, dx);
        const currentAngleDeg = currentAngleRad * 180 / Math.PI;

        const rotationCorrection = -currentAngleDeg;
        let normalizedRotation = this.imageRotation + rotationCorrection;
        normalizedRotation = Math.round(normalizedRotation * 2) / 2;

        const targetWheelBasePx = wheelBaseValue * SCALE;
        const scaleFactor = targetWheelBasePx / distPx;

        const newWidth = currentWidth * scaleFactor;
        const newHeight = currentHeight * scaleFactor;

        if (newWidth < 1 || newHeight < 1) return;

        const sx = this.imageFlipped ? -1 : 1;
        const currentRotation = this.imageRotation;

        const normFront = this.#toNormalizedSource(frontPx, center, currentWidth, currentHeight, sx, currentRotation);
        const normRear = this.#toNormalizedSource(rearPx, center, currentWidth, currentHeight, sx, currentRotation);

        const newCenter = { x: newWidth / 2, y: newHeight / 2 };
        const finalFrontPx = this.#fromNormalizedSource(normFront, newCenter, newWidth, newHeight, sx, normalizedRotation);
        const finalRearPx = this.#fromNormalizedSource(normRear, newCenter, newWidth, newHeight, sx, normalizedRotation);

        this.imageRotation = normalizedRotation;
        this.stateManager.setState({ imageRotation: normalizedRotation });
        this.#applyImageTransform();

        this.imageFrame.style.width = `${newWidth}px`;
        this.imageFrame.style.height = `${newHeight}px`;

        const tireRadiusPx = (this.stateManager.state.tireDiameter / 2) * SCALE;
        const wheelCenterY = GROUND_Y - tireRadiusPx;

        const currentMidX = (finalFrontPx.x + finalRearPx.x) / 2;
        const currentMidY = (finalFrontPx.y + finalRearPx.y) / 2;

        const targetMidX = CENTER_X;
        const targetMidY = wheelCenterY;

        const offsetX = targetMidX - currentMidX;
        const offsetY = targetMidY - currentMidY;

        this.imageFrame.style.left = `${Math.round(offsetX)}px`;
        this.imageFrame.style.top = `${Math.round(offsetY)}px`;

        frontDot.xRatio = finalFrontPx.x / newWidth;
        frontDot.yRatio = finalFrontPx.y / newHeight;

        rearDot.xRatio = finalRearPx.x / newWidth;
        rearDot.yRatio = finalRearPx.y / newHeight;

        this.#refreshAlignDots();
    }

    #toNormalizedSource(pointPx, center, width, height, scaleX, rotationDeg) {
        const angleRad = rotationDeg * Math.PI / 180;
        const dx = pointPx.x - center.x;
        const dy = pointPx.y - center.y;

        const cos = Math.cos(-angleRad);
        const sin = Math.sin(-angleRad);
        const unrotatedX = (dx * cos) - (dy * sin);
        const unrotatedY = (dx * sin) + (dy * cos);

        const unscaledX = unrotatedX * scaleX;
        const unscaledY = unrotatedY;

        const srcX = unscaledX + (width / 2);
        const srcY = unscaledY + (height / 2);

        return {
            x: srcX / width,
            y: srcY / height
        };
    }

    #fromNormalizedSource(normPoint, center, width, height, scaleX, rotationDeg) {
        const srcX = normPoint.x * width;
        const srcY = normPoint.y * height;

        const centeredX = srcX - (width / 2);
        const centeredY = srcY - (height / 2);

        const flippedX = centeredX * scaleX;
        const flippedY = centeredY;

        const angleRad = rotationDeg * Math.PI / 180;
        const cos = Math.cos(angleRad);
        const sin = Math.sin(angleRad);

        const rotatedX = (flippedX * cos) - (flippedY * sin);
        const rotatedY = (flippedX * sin) + (flippedY * cos);

        return {
            x: rotatedX + center.x,
            y: rotatedY + center.y
        };
    }

    #setAlignButtonAvailability(enabled) {
        if (!this.alignButton) return;
        this.alignButton.disabled = !enabled;
    }

    #clearAlignDots() {
        this.alignDots = [];
        this.alignDotsLayer.innerHTML = '';
        this.draggingAlignDot = null;
    }

    #handleFramePointerDown(event) {
        if (!this.hasImageOverlay || this.isAlignModeActive || !this.imageFrame.classList.contains('editing')) return;
        if (event.button !== undefined && event.button !== 0) return;
        if (event.target.closest('.align-dot')) return;

        const edges = this.#getEdgeHitTest(event);
        if (edges.resize) {
            this.activeResizeCursor = edges.cursor;
            this.#startResize(event, edges);
        } else {
            this.#startDrag(event);
        }
    }

    #getEdgeHitTest(event) {
        const rect = this.imageFrame.getBoundingClientRect();
        const threshold = 12;
        const nearLeft = Math.abs(event.clientX - rect.left) <= threshold;
        const nearRight = Math.abs(rect.right - event.clientX) <= threshold;
        const nearTop = Math.abs(event.clientY - rect.top) <= threshold;
        const nearBottom = Math.abs(rect.bottom - event.clientY) <= threshold;

        const horizontal = nearLeft || nearRight;
        const vertical = nearTop || nearBottom;
        let cursor = 'grab';

        if (horizontal && vertical) {
            if ((nearLeft && nearTop) || (nearRight && nearBottom)) {
                cursor = 'nwse-resize';
            } else {
                cursor = 'nesw-resize';
            }
        } else if (horizontal) {
            cursor = 'ew-resize';
        } else if (vertical) {
            cursor = 'ns-resize';
        }

        return {
            nearLeft,
            nearRight,
            nearTop,
            nearBottom,
            horizontal,
            vertical,
            resize: horizontal || vertical,
            cursor
        };
    }

    #updateFrameCursor(event) {
        if (!this.hasImageOverlay || this.isAlignModeActive || !this.imageFrame.classList.contains('editing')) return;
        if (this.isResizing) {
            this.imageFrame.style.cursor = this.activeResizeCursor || 'nwse-resize';
            return;
        }
        if (this.isDraggingFrame) {
            this.imageFrame.style.cursor = 'grabbing';
            return;
        }

        const edges = this.#getEdgeHitTest(event);
        if (edges.resize) {
            this.imageFrame.style.cursor = edges.cursor;
        } else {
            this.imageFrame.style.cursor = 'grab';
        }
    }

    #resetFrameCursor() {
        if (!this.hasImageOverlay || this.isAlignModeActive || !this.imageFrame.classList.contains('editing')) {
            this.imageFrame.style.cursor = '';
            return;
        }

        if (this.isResizing) {
            this.imageFrame.style.cursor = this.activeResizeCursor || 'nwse-resize';
        } else if (this.isDraggingFrame) {
            this.imageFrame.style.cursor = 'grabbing';
        } else {
            this.imageFrame.style.cursor = 'grab';
        }
    }

    #startDrag(event) {
        if (!this.hasImageOverlay || this.isAlignModeActive) return;
        event.preventDefault();
        const point = this.#getNormalizedPoint(event);
        this.dragState = {
            startX: point.x,
            startY: point.y,
            left: parseFloat(this.imageFrame.style.left) || 0,
            top: parseFloat(this.imageFrame.style.top) || 0
        };
        this.isDraggingFrame = true;
        this.imageFrame.style.cursor = 'grabbing';
        this.boundDragMove = (e) => this.#handleDragMove(e);
        this.boundStopDrag = () => this.#stopDrag();
        window.addEventListener('pointermove', this.boundDragMove);
        window.addEventListener('pointerup', this.boundStopDrag);
    }

    #handleDragMove(event) {
        if (!this.dragState) return;
        event.preventDefault();
        const point = this.#getNormalizedPoint(event);
        const nextLeft = this.dragState.left + (point.x - this.dragState.startX);
        const nextTop = this.dragState.top + (point.y - this.dragState.startY);
        this.imageFrame.style.left = `${nextLeft}px`;
        this.imageFrame.style.top = `${nextTop}px`;
    }

    #stopDrag() {
        this.dragState = null;
        window.removeEventListener('pointermove', this.boundDragMove);
        window.removeEventListener('pointerup', this.boundStopDrag);
        this.isDraggingFrame = false;
        this.#resetFrameCursor();

        // Save new position to state
        this.stateManager.setState({
            imageFrame: {
                x: parseFloat(this.imageFrame.style.left) || 0,
                y: parseFloat(this.imageFrame.style.top) || 0,
                width: parseFloat(this.imageFrame.style.width) || 0,
                height: parseFloat(this.imageFrame.style.height) || 0
            }
        });
    }

    #startResize(event, edges = null) {
        if (!this.hasImageOverlay || this.isAlignModeActive) return;
        event.stopPropagation();
        event.preventDefault();
        const point = this.#getNormalizedPoint(event);
        this.resizeState = {
            startX: point.x,
            startY: point.y,
            width: this.imageFrame.offsetWidth,
            height: this.imageFrame.offsetHeight,
            left: parseFloat(this.imageFrame.style.left) || 0,
            top: parseFloat(this.imageFrame.style.top) || 0,
            edges: edges || this.#getEdgeHitTest(event)
        };
        this.isResizing = true;
        this.activeResizeCursor = this.resizeState.edges.cursor || 'nwse-resize';
        this.imageFrame.style.cursor = this.activeResizeCursor;
        this.boundResizeMove = (e) => this.#handleResizeMove(e);
        this.boundStopResize = () => this.#stopResize();
        window.addEventListener('pointermove', this.boundResizeMove);
        window.addEventListener('pointerup', this.boundStopResize);
    }

    #handleResizeMove(event) {
        if (!this.resizeState) return;
        event.preventDefault();
        const point = this.#getNormalizedPoint(event);

        const edges = this.resizeState.edges || {};
        const deltaX = point.x - this.resizeState.startX;
        const deltaY = point.y - this.resizeState.startY;

        let nextLeft = this.resizeState.left;
        let nextTop = this.resizeState.top;
        let nextWidth = this.resizeState.width;
        let nextHeight = this.resizeState.height;

        if (edges.nearRight) {
            nextWidth = Math.max(MIN_FRAME_WIDTH, this.resizeState.width + deltaX);
        } else if (edges.nearLeft) {
            nextWidth = Math.max(MIN_FRAME_WIDTH, this.resizeState.width - deltaX);
            nextLeft = this.resizeState.left + (this.resizeState.width - nextWidth);
        }

        if (edges.nearBottom) {
            nextHeight = Math.max(MIN_FRAME_HEIGHT, this.resizeState.height + deltaY);
        } else if (edges.nearTop) {
            nextHeight = Math.max(MIN_FRAME_HEIGHT, this.resizeState.height - deltaY);
            nextTop = this.resizeState.top + (this.resizeState.height - nextHeight);
        }

        this.imageFrame.style.left = `${nextLeft}px`;
        this.imageFrame.style.top = `${nextTop}px`;
        this.imageFrame.style.width = `${nextWidth}px`;
        this.imageFrame.style.height = `${nextHeight}px`;
    }

    #stopResize() {
        this.resizeState = null;
        window.removeEventListener('pointermove', this.boundResizeMove);
        window.removeEventListener('pointerup', this.boundStopResize);
        this.isResizing = false;
        this.activeResizeCursor = null;

        // Save new size to state
        const frame = {
            x: parseFloat(this.imageFrame.style.left) || 0,
            y: parseFloat(this.imageFrame.style.top) || 0,
            width: parseFloat(this.imageFrame.style.width) || 0,
            height: parseFloat(this.imageFrame.style.height) || 0
        };
        this.stateManager.setState({ imageFrame: frame });
        this.#setScaleBaselineFromFrame(frame, { resetScale: true });
        this.#resetFrameCursor();
    }

    #getNormalizedPoint(event) {
        const rect = this.canvasArea.getBoundingClientRect();
        const zoomScale = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const zoomOffsetX = parseFloat(this.canvasArea.dataset.zoomOffsetX || '0');
        const zoomOffsetY = parseFloat(this.canvasArea.dataset.zoomOffsetY || '0');
        const relX = event.clientX - rect.left;
        const relY = event.clientY - rect.top;
        return {
            x: (relX - zoomOffsetX) / zoomScale,
            y: (relY - zoomOffsetY) / zoomScale
        };
    }



    #getOrderedAlignDots() {
        if (this.alignDots.length < 2) return null;
        const [dotA, dotB] = this.alignDots;
        if (dotA.xRatio <= dotB.xRatio) {
            return { frontDot: dotA, rearDot: dotB };
        }
        return { frontDot: dotB, rearDot: dotA };
    }

    #isImageLayerActive() {
        return this.layerController ? this.layerController.isActive('image') : true;
    }

    #handleStateSync(state) {
        const imageChanged = state.imageData !== this.lastImageData;

        if (imageChanged) {
            this.lastImageData = state.imageData;
            if (state.imageData) {
                this.hasImageOverlay = true;
                this.imageFrame.classList.add('has-image');
                this.overlayImage.src = state.imageData;
                this.#setAlignButtonAvailability(true);
                if (state.imageFrame && state.imageFrame.width > 0) {
                    this.#applyFrameState(state.imageFrame);
                }
            } else {
                this.hasImageOverlay = false;
                this.imageFrame.classList.remove('has-image');
                this.overlayImage.src = '';
                this.#setAlignButtonAvailability(false);
                this.exitAlignMode(true);
                this.#applyFrameState(this.#getEmptyFrame());
                this.scaleBaseFrame = null;
                this.imageScale = 100;
            }
            this.#updateImageEditingState();
        }

        if (!this.hasImageOverlay) {
            return;
        }

        // Opacity (state is 0-100, css expects 0-1)
        this.overlayImage.style.opacity = (state.imageOpacity !== undefined ? state.imageOpacity : 50) / 100;

        // Rotation & flip
        let transformChanged = false;
        if (state.imageRotation !== undefined && state.imageRotation !== this.imageRotation) {
            this.imageRotation = state.imageRotation;
            transformChanged = true;
        }
        if (state.imageFlipped !== undefined && state.imageFlipped !== this.imageFlipped) {
            this.imageFlipped = state.imageFlipped;
            transformChanged = true;
        }
        if (transformChanged) {
            this.#applyImageTransform();
        }

        if (state.imageScale !== undefined && state.imageScale !== this.imageScale) {
            this.imageScale = state.imageScale;
            if (!this.suppressScaleApply) {
                if (!this.scaleBaseFrame && state.imageFrame && state.imageFrame.width > 0) {
                    this.scaleBaseFrame = this.#deriveBaselineFromScaledFrame(state.imageFrame, this.imageScale);
                } else {
                    this.#applyScaleFromState();
                }
            }
        }

        // Frame sync (skip while dragging/resizing)
        if (state.imageFrame && state.imageFrame.width > 0 && !this.dragState && !this.resizeState) {
            if (this.#frameDiffersFromState(state.imageFrame)) {
                this.#applyFrameState(state.imageFrame);
            }
        }

        if (!this.isApplyingScale && state.imageFrame && state.imageFrame.width > 0) {
            if (this.imageScale === 100) {
                this.scaleBaseFrame = { ...state.imageFrame };
            } else if (!this.scaleBaseFrame) {
                this.scaleBaseFrame = this.#deriveBaselineFromScaledFrame(state.imageFrame, this.imageScale);
            }
        }
    }

    #frameDiffersFromState(targetFrame) {
        const currentFrame = {
            x: parseFloat(this.imageFrame.style.left) || 0,
            y: parseFloat(this.imageFrame.style.top) || 0,
            width: parseFloat(this.imageFrame.style.width) || 0,
            height: parseFloat(this.imageFrame.style.height) || 0
        };

        return Math.abs(currentFrame.x - targetFrame.x) > 1 ||
            Math.abs(currentFrame.y - targetFrame.y) > 1 ||
            Math.abs(currentFrame.width - targetFrame.width) > 1 ||
            Math.abs(currentFrame.height - targetFrame.height) > 1;
    }

    #applyFrameState(frame) {
        const nextFrame = frame || this.#getEmptyFrame();
        this.imageFrame.style.left = `${nextFrame.x || 0}px`;
        this.imageFrame.style.top = `${nextFrame.y || 0}px`;
        this.imageFrame.style.width = `${nextFrame.width || 0}px`;
        this.imageFrame.style.height = `${nextFrame.height || 0}px`;
    }

    #getEmptyFrame() {
        return { x: 0, y: 0, width: 0, height: 0 };
    }

    #getCurrentFrame() {
        return {
            x: parseFloat(this.imageFrame.style.left) || 0,
            y: parseFloat(this.imageFrame.style.top) || 0,
            width: parseFloat(this.imageFrame.style.width) || 0,
            height: parseFloat(this.imageFrame.style.height) || 0
        };
    }

    #setScaleBaselineFromFrame(frame, { resetScale = false } = {}) {
        if (!frame || frame.width <= 0 || frame.height <= 0) return;
        this.scaleBaseFrame = { ...frame };
        if (resetScale && this.imageScale !== 100) {
            this.suppressScaleApply = true;
            this.imageScale = 100;
            this.stateManager.setState({ imageScale: 100 });
            this.suppressScaleApply = false;
        }
    }

    #deriveBaselineFromScaledFrame(frame, scaleValue) {
        const scale = Math.max(0.25, (scaleValue || 100) / 100);
        if (scale === 1) {
            return { ...frame };
        }
        const centerX = frame.x + (frame.width / 2);
        const centerY = frame.y + (frame.height / 2);
        const width = frame.width / scale;
        const height = frame.height / scale;
        return {
            x: centerX - (width / 2),
            y: centerY - (height / 2),
            width,
            height
        };
    }

    #applyScaleFromState() {
        if (!this.scaleBaseFrame || this.scaleBaseFrame.width <= 0 || this.scaleBaseFrame.height <= 0) {
            const current = this.#getCurrentFrame();
            if (current.width <= 0 || current.height <= 0) {
                return;
            }
            this.scaleBaseFrame = { ...current };
        }

        const base = this.scaleBaseFrame;
        const scale = Math.max(0.25, (this.imageScale || 100) / 100);
        const centerX = base.x + (base.width / 2);
        const centerY = base.y + (base.height / 2);
        const width = Math.max(MIN_FRAME_WIDTH, base.width * scale);
        const height = Math.max(MIN_FRAME_HEIGHT, base.height * scale);
        const frame = {
            x: centerX - (width / 2),
            y: centerY - (height / 2),
            width,
            height
        };

        this.isApplyingScale = true;
        this.#applyFrameState(frame);
        this.stateManager.setState({ imageFrame: frame });
        this.isApplyingScale = false;
    }
}

