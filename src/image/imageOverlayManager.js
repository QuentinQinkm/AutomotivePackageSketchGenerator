import { MIN_FRAME_HEIGHT, MIN_FRAME_WIDTH } from '../constants.js';

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
        stateManager
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
        this.stateManager = stateManager;

        this.hasImageOverlay = false;
        this.imageFlipped = false;
        this.imageRotation = 0;
        this.dragState = null;
        this.resizeState = null;

        this.#bindEvents();
        this.#updateImageEditingState();

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

    #updateImageEditingState() {
        // Toggle between Upload and Edit states
        if (this.hasImageOverlay) {
            this.uploadState.classList.add('hidden');
            this.editState.classList.remove('hidden');
            this.imageFrame.classList.add('editing'); // Always editing if loaded? Or maybe just selectable?
        } else {
            this.uploadState.classList.remove('hidden');
            this.editState.classList.add('hidden');
            this.imageFrame.classList.remove('editing');
        }

        this.canvasArea.classList.toggle('editing-image', this.hasImageOverlay);
    }

    #handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            this.overlayImage.onload = () => {
                this.hasImageOverlay = true;
                this.imageFrame.classList.add('has-image');
                this.aspectRatio = this.overlayImage.naturalWidth / this.overlayImage.naturalHeight;
                this.#resetImageFrame();

                // Initialize state
                this.stateManager.setState({
                    imageOpacity: 100,
                    imageRotation: 0
                });

                this.#applyImageTransform();
                this.#updateImageEditingState();
            };
            this.overlayImage.src = reader.result;
        };
        reader.readAsDataURL(file);
    }

    #resetImageFrame() {
        const parentWidth = this.canvasArea.clientWidth;
        const parentHeight = this.canvasArea.clientHeight;
        // Start with a reasonable width, e.g., 50% of parent
        let width = Math.max(MIN_FRAME_WIDTH, parentWidth * 0.5);
        let height = width / this.aspectRatio;

        // Ensure height is not too small, adjust width if necessary
        if (height < MIN_FRAME_HEIGHT) {
            height = MIN_FRAME_HEIGHT;
            width = height * this.aspectRatio;
        }

        this.imageFrame.style.width = `${width}px`;
        this.imageFrame.style.height = `${height}px`;
        this.imageFrame.style.left = `${(parentWidth - width) / 2}px`;
        this.imageFrame.style.top = `${(parentHeight - height) / 2}px`;
    }

    #applyImageTransform() {
        const scaleX = this.imageFlipped ? -1 : 1;
        this.overlayImage.style.transform = `scaleX(${scaleX}) rotate(${this.imageRotation}deg)`;
    }

    #startDrag(event) {
        if (!this.hasImageOverlay || event.target === this.resizeHandle) return;
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
        // Removed clamping to allow free movement
        const nextLeft = this.dragState.left + (point.x - this.dragState.startX);
        const nextTop = this.dragState.top + (point.y - this.dragState.startY);
        this.imageFrame.style.left = `${nextLeft}px`;
        this.imageFrame.style.top = `${nextTop}px`;
    }

    #stopDrag() {
        this.dragState = null;
        window.removeEventListener('pointermove', this.boundDragMove);
        window.removeEventListener('pointerup', this.boundStopDrag);
    }

    #startResize(event) {
        if (!this.hasImageOverlay) return;
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
}

