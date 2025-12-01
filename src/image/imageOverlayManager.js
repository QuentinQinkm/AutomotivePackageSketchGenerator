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
        this.dragState = null;
        this.resizeState = null;
        this.alignDots = [];
        this.isAlignModeActive = false;
        this.draggingAlignDot = null;

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

        // Subscribe to state changes for opacity and rotation
        this.stateManager.subscribe(state => {
            if (this.hasImageOverlay) {
                // Opacity is 0-100 in state, 0-1 in CSS
                this.overlayImage.style.opacity = (state.imageOpacity !== undefined ? state.imageOpacity : 100) / 100;

                if (state.imageRotation !== undefined) {
                    this.imageRotation = state.imageRotation;
                    this.#applyImageTransform();
                }
            }
        });
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
            this.stateManager.setState({
                imageRotation: 0,
                imageOpacity: 100
            });

            this.#applyImageTransform();
            this.#updateImageEditingState();
        });

        this.flipImageBtn.addEventListener('click', () => {
            if (!this.hasImageOverlay) return;
            this.imageFlipped = !this.imageFlipped;
            this.#applyImageTransform();
        });

        this.imageFrame.addEventListener('pointerdown', (event) => this.#startDrag(event));
        this.resizeHandle.addEventListener('pointerdown', (event) => this.#startResize(event));

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

        // Subscribe to state changes
        this.stateManager.subscribe(state => {
            // Handle Image Data (Source)
            if (state.imageData !== this.lastImageData) {
                this.lastImageData = state.imageData;
                if (state.imageData) {
                    this.hasImageOverlay = true;
                    this.imageFrame.classList.add('has-image');
                    this.overlayImage.src = state.imageData;
                    this.#setAlignButtonAvailability(true);
                    this.#updateImageEditingState();

                    // Restore frame if available
                    if (state.imageFrame && state.imageFrame.width > 0) {
                        this.imageFrame.style.left = `${state.imageFrame.x}px`;
                        this.imageFrame.style.top = `${state.imageFrame.y}px`;
                        this.imageFrame.style.width = `${state.imageFrame.width}px`;
                        this.imageFrame.style.height = `${state.imageFrame.height}px`;
                    }
                } else {
                    this.hasImageOverlay = false;
                    this.imageFrame.classList.remove('has-image');
                    this.overlayImage.src = '';
                    this.#setAlignButtonAvailability(false);
                    this.#updateImageEditingState();
                }
            }

            if (this.hasImageOverlay) {
                // Opacity
                this.overlayImage.style.opacity = (state.imageOpacity !== undefined ? state.imageOpacity : 100) / 100;

                // Rotation & Flip
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

                // Frame Position (if updated externally, e.g. undo/redo or profile switch)
                // We check if the DOM matches the state to avoid jitter during drag
                if (state.imageFrame && state.imageFrame.width > 0 && !this.dragState && !this.resizeState) {
                    const currentFrame = {
                        x: parseFloat(this.imageFrame.style.left) || 0,
                        y: parseFloat(this.imageFrame.style.top) || 0,
                        width: parseFloat(this.imageFrame.style.width) || 0,
                        height: parseFloat(this.imageFrame.style.height) || 0
                    };

                    if (Math.abs(currentFrame.x - state.imageFrame.x) > 1 ||
                        Math.abs(currentFrame.y - state.imageFrame.y) > 1 ||
                        Math.abs(currentFrame.width - state.imageFrame.width) > 1 ||
                        Math.abs(currentFrame.height - state.imageFrame.height) > 1) {

                        this.imageFrame.style.left = `${state.imageFrame.x}px`;
                        this.imageFrame.style.top = `${state.imageFrame.y}px`;
                        this.imageFrame.style.width = `${state.imageFrame.width}px`;
                        this.imageFrame.style.height = `${state.imageFrame.height}px`;
                    }
                }
            }
        });
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
                    imageOpacity: 100,
                    imageRotation: 0,
                    imageFlipped: false,
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
        this.stateManager.setState({
            imageFrame: {
                x: parseFloat(this.imageFrame.style.left) || 0,
                y: parseFloat(this.imageFrame.style.top) || 0,
                width: parseFloat(this.imageFrame.style.width) || 0,
                height: parseFloat(this.imageFrame.style.height) || 0
            }
        });

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

    #startDrag(event) {
        if (!this.hasImageOverlay || this.isAlignModeActive || event.target === this.resizeHandle) return;
        event.preventDefault();
        const point = this.#getNormalizedPoint(event);
        this.dragState = {
            startX: point.x,
            startY: point.y,
            left: parseFloat(this.imageFrame.style.left) || 0,
            top: parseFloat(this.imageFrame.style.top) || 0
        };
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

    #startResize(event) {
        if (!this.hasImageOverlay || this.isAlignModeActive) return;
        event.stopPropagation();
        event.preventDefault();
        const point = this.#getNormalizedPoint(event);
        this.resizeState = {
            startX: point.x,
            startY: point.y,
            width: this.imageFrame.offsetWidth,
            height: this.imageFrame.offsetHeight
        };
        this.boundResizeMove = (e) => this.#handleResizeMove(e);
        this.boundStopResize = () => this.#stopResize();
        window.addEventListener('pointermove', this.boundResizeMove);
        window.addEventListener('pointerup', this.boundStopResize);
    }

    #handleResizeMove(event) {
        if (!this.resizeState) return;
        event.preventDefault();
        const point = this.#getNormalizedPoint(event);

        // Calculate new width based on drag
        let nextWidth = Math.max(MIN_FRAME_WIDTH, this.resizeState.width + (point.x - this.resizeState.startX));

        // Enforce aspect ratio
        let nextHeight = nextWidth / this.aspectRatio;

        // Optional: Check if height is too small
        if (nextHeight < MIN_FRAME_HEIGHT) {
            nextHeight = MIN_FRAME_HEIGHT;
            nextWidth = nextHeight * this.aspectRatio;
        }

        this.imageFrame.style.width = `${nextWidth}px`;
        this.imageFrame.style.height = `${nextHeight}px`;
    }

    #stopResize() {
        this.resizeState = null;
        window.removeEventListener('pointermove', this.boundResizeMove);
        window.removeEventListener('pointerup', this.boundStopResize);

        // Save new size to state
        this.stateManager.setState({
            imageFrame: {
                x: parseFloat(this.imageFrame.style.left) || 0,
                y: parseFloat(this.imageFrame.style.top) || 0,
                width: parseFloat(this.imageFrame.style.width) || 0,
                height: parseFloat(this.imageFrame.style.height) || 0
            }
        });
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
}

