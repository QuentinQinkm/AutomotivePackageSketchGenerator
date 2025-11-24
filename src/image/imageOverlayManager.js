import { MIN_FRAME_HEIGHT, MIN_FRAME_WIDTH } from '../constants.js';

export class ImageOverlayManager {
    constructor({
        canvasArea,
        imageFrame,
        overlayImage,
        resizeHandle,
        toggleImageButton,
        imageControls,
        imageToolbar,
        deleteImageBtn,
        opacitySlider,
        imageUploadInput,
        flipImageBtn,
        rotationSlider
    }) {
        this.canvasArea = canvasArea;
        this.imageFrame = imageFrame;
        this.overlayImage = overlayImage;
        this.resizeHandle = resizeHandle;
        this.toggleImageButton = toggleImageButton;
        this.imageControls = imageControls;
        this.imageToolbar = imageToolbar;
        this.deleteImageBtn = deleteImageBtn;
        this.opacitySlider = opacitySlider;
        this.imageUploadInput = imageUploadInput;
        this.flipImageBtn = flipImageBtn;
        this.rotationSlider = rotationSlider;

        this.imageEditActive = false;
        this.hasImageOverlay = false;
        this.imageFlipped = false;
        this.imageRotation = 0;
        this.dragState = null;
        this.resizeState = null;

        this.#bindEvents();
        this.#updateImageEditingState();
    }

    #bindEvents() {
        this.toggleImageButton.addEventListener('click', () => {
            this.imageEditActive = !this.imageEditActive;
            this.#updateImageEditingState();
        });

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
            this.imageRotation = 0;
            this.rotationSlider.value = 0;
            this.imageFlipped = false;
            this.#applyImageTransform();
            this.#updateImageEditingState();
        });

        this.opacitySlider.addEventListener('input', (event) => {
            this.overlayImage.style.opacity = event.target.value;
        });

        this.flipImageBtn.addEventListener('click', () => {
            if (!this.hasImageOverlay) return;
            this.imageFlipped = !this.imageFlipped;
            this.#applyImageTransform();
        });

        this.rotationSlider.addEventListener('input', (event) => {
            this.imageRotation = parseFloat(event.target.value);
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
        const canEditImage = this.imageEditActive && this.hasImageOverlay;
        this.toggleImageButton.classList.toggle('active', this.imageEditActive);
        this.imageControls.classList.toggle('visible', this.imageEditActive);
        this.imageFrame.classList.toggle('editing', canEditImage);
        this.canvasArea.classList.toggle('editing-image', canEditImage);
        this.imageToolbar?.classList.toggle('actions-visible', canEditImage);
        this.deleteImageBtn.disabled = !this.hasImageOverlay;
        this.opacitySlider.disabled = !this.hasImageOverlay;
        this.flipImageBtn.disabled = !this.hasImageOverlay;
        this.rotationSlider.disabled = !this.hasImageOverlay;
        if (!canEditImage) {
            this.dragState = null;
            this.resizeState = null;
        }
    }

    #handleImageFile(file) {
        if (!file || !file.type.startsWith('image/')) return;
        const reader = new FileReader();
        reader.onload = () => {
            this.overlayImage.onload = () => {
                this.hasImageOverlay = true;
                this.imageFrame.classList.add('has-image');
                this.#resetImageFrame();
                this.overlayImage.style.opacity = this.opacitySlider.value;
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
        const width = Math.max(MIN_FRAME_WIDTH, parentWidth * 0.65);
        const height = Math.max(MIN_FRAME_HEIGHT, parentHeight * 0.55);
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
        if (!this.imageEditActive || !this.hasImageOverlay || event.target === this.resizeHandle) return;
        event.preventDefault();
        this.dragState = {
            startX: event.clientX,
            startY: event.clientY,
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
        const parentWidth = this.canvasArea.clientWidth;
        const parentHeight = this.canvasArea.clientHeight;
        const frameWidth = this.imageFrame.offsetWidth;
        const frameHeight = this.imageFrame.offsetHeight;
        const nextLeft = this.dragState.left + (event.clientX - this.dragState.startX);
        const nextTop = this.dragState.top + (event.clientY - this.dragState.startY);
        this.imageFrame.style.left = `${Math.min(Math.max(0, nextLeft), parentWidth - frameWidth)}px`;
        this.imageFrame.style.top = `${Math.min(Math.max(0, nextTop), parentHeight - frameHeight)}px`;
    }

    #stopDrag() {
        this.dragState = null;
        window.removeEventListener('pointermove', this.boundDragMove);
        window.removeEventListener('pointerup', this.boundStopDrag);
    }

    #startResize(event) {
        if (!this.imageEditActive || !this.hasImageOverlay) return;
        event.stopPropagation();
        event.preventDefault();
        this.resizeState = {
            startX: event.clientX,
            startY: event.clientY,
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
        const parentWidth = this.canvasArea.clientWidth;
        const parentHeight = this.canvasArea.clientHeight;
        const frameLeft = this.imageFrame.offsetLeft;
        const frameTop = this.imageFrame.offsetTop;
        const maxWidth = parentWidth - frameLeft;
        const maxHeight = parentHeight - frameTop;
        const constrainedMaxWidth = Math.max(MIN_FRAME_WIDTH, maxWidth);
        const constrainedMaxHeight = Math.max(MIN_FRAME_HEIGHT, maxHeight);
        const nextWidth = Math.min(
            Math.max(MIN_FRAME_WIDTH, this.resizeState.width + (event.clientX - this.resizeState.startX)),
            constrainedMaxWidth
        );
        const nextHeight = Math.min(
            Math.max(MIN_FRAME_HEIGHT, this.resizeState.height + (event.clientY - this.resizeState.startY)),
            constrainedMaxHeight
        );
        this.imageFrame.style.width = `${nextWidth}px`;
        this.imageFrame.style.height = `${nextHeight}px`;
    }

    #stopResize() {
        this.resizeState = null;
        window.removeEventListener('pointermove', this.boundResizeMove);
        window.removeEventListener('pointerup', this.boundStopResize);
    }
}

