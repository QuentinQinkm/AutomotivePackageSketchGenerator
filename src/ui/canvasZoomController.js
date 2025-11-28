export class CanvasZoomController {
    constructor({
        canvasArea,
        svgElement,
        overlayLayer = null,
        overlayLayers = [],
        minZoom = 1,
        maxZoom = 5
    }) {
        this.canvasArea = canvasArea;
        this.svgElement = svgElement;
        this.overlayLayers = [];
        if (overlayLayer) {
            this.overlayLayers.push(overlayLayer);
        }
        if (Array.isArray(overlayLayers) && overlayLayers.length) {
            this.overlayLayers.push(...overlayLayers.filter(Boolean));
        }
        const viewBoxAttr = svgElement.getAttribute('viewBox') || '0 0 800 400';
        const [, , boxWidth, boxHeight] = viewBoxAttr.split(' ').map(Number);
        this.baseWidth = boxWidth || 800;
        this.baseHeight = boxHeight || 400;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.viewBoxWidth = this.baseWidth;
        this.viewBoxHeight = this.baseHeight;

        this.isDragging = false;
        this.dragStart = { x: 0, y: 0 };
        this.panStart = { x: 0, y: 0 };

        this.handleWheel = (event) => this.onWheel(event);
        this.handleMouseDown = (event) => this.onMouseDown(event);
        this.handleMouseMove = (event) => this.onMouseMove(event);
        this.handleMouseUp = () => this.onMouseUp();
        this.handleResize = () => this.applyTransform();

        this.canvasArea.addEventListener('wheel', this.handleWheel, { passive: false });
        this.canvasArea.addEventListener('mousedown', this.handleMouseDown);
        window.addEventListener('mousemove', this.handleMouseMove);
        window.addEventListener('mouseup', this.handleMouseUp);
        this.resizeObserver = new ResizeObserver(this.handleResize);
        this.resizeObserver.observe(this.canvasArea);

        this.applyTransform();
    }

    onWheel(event) {
        const delta = -event.deltaY;
        if (delta === 0) return;
        event.preventDefault();
        const zoomFactor = delta > 0 ? 1.1 : 0.9;
        const nextZoom = this.clampZoom(this.zoom * zoomFactor);
        if (Math.abs(nextZoom - this.zoom) < 0.0001) {
            return;
        }
        const focus = this.getSvgCoordinatesFromEvent(event);
        if (!focus) {
            this.zoom = nextZoom;
            this.applyTransform();
            return;
        }
        const prevZoom = this.zoom;
        this.zoom = nextZoom;
        this.adjustPanForZoom(focus, prevZoom, nextZoom);
        this.applyTransform();
    }

    clampZoom(value) {
        return Math.min(this.maxZoom, Math.max(this.minZoom, value));
    }

    adjustPanForZoom(focus, prevZoom, nextZoom) {
        const ratio = prevZoom / nextZoom;
        this.panX = focus.x - (focus.x - this.panX) * ratio;
        this.panY = focus.y - (focus.y - this.panY) * ratio;
    }

    onMouseDown(event) {
        const isMiddleButton = event.button === 1;
        const isLeftBackground = event.button === 0 && event.target === this.canvasArea;
        if (!isMiddleButton && !isLeftBackground) return;
        if (this.zoom <= this.minZoom) return;
        event.preventDefault();
        this.isDragging = true;
        this.dragStart.x = event.clientX;
        this.dragStart.y = event.clientY;
        this.panStart.x = this.panX;
        this.panStart.y = this.panY;
        this.canvasArea.classList.add('is-panning');
    }

    onMouseMove(event) {
        if (!this.isDragging) return;
        const deltaX = event.clientX - this.dragStart.x;
        const deltaY = event.clientY - this.dragStart.y;
        const unitsPerPixelX = this.viewBoxWidth / this.canvasArea.clientWidth;
        const unitsPerPixelY = this.viewBoxHeight / this.canvasArea.clientHeight;
        this.panX = this.panStart.x - deltaX * unitsPerPixelX;
        this.panY = this.panStart.y - deltaY * unitsPerPixelY;
        this.applyTransform();
    }

    onMouseUp() {
        if (!this.isDragging) return;
        this.isDragging = false;
        this.canvasArea.classList.remove('is-panning');
    }

    clampPan() {
        const maxPanX = this.baseWidth - this.viewBoxWidth;
        const maxPanY = this.baseHeight - this.viewBoxHeight;
        this.panX = Math.min(Math.max(this.panX, 0), Math.max(0, maxPanX));
        this.panY = Math.min(Math.max(this.panY, 0), Math.max(0, maxPanY));
        if (this.zoom <= this.minZoom) {
            this.panX = 0;
            this.panY = 0;
        }
    }

    applyTransform() {
        this.viewBoxWidth = this.baseWidth / this.zoom;
        this.viewBoxHeight = this.baseHeight / this.zoom;
        this.clampPan();
        this.svgElement.setAttribute('viewBox', `${this.panX} ${this.panY} ${this.viewBoxWidth} ${this.viewBoxHeight}`);

        const canvasWidth = this.canvasArea.clientWidth || 1;
        const canvasHeight = this.canvasArea.clientHeight || 1;
        const widthScale = canvasWidth / this.baseWidth;
        const heightScale = canvasHeight / this.baseHeight;
        const renderScale = Math.min(widthScale, heightScale) || 1;
        const contentWidth = this.baseWidth * renderScale;
        const contentHeight = this.baseHeight * renderScale;
        const letterboxOffsetX = (canvasWidth - contentWidth) / 2;
        const letterboxOffsetY = (canvasHeight - contentHeight) / 2;
        const translateX = letterboxOffsetX - (this.panX * renderScale * this.zoom);
        const translateY = letterboxOffsetY - (this.panY * renderScale * this.zoom);

        const totalScale = this.zoom * renderScale;

        this.overlayLayers.forEach((layer) => {
            layer.style.transformOrigin = '0 0';
            layer.style.transform = `translate(${translateX}px, ${translateY}px) scale(${totalScale})`;
        });

        const isZoomed = this.zoom > this.minZoom + 0.001;
        this.canvasArea.classList.toggle('is-zoomed', isZoomed);
        this.canvasArea.dataset.zoomScale = totalScale.toString();
        this.canvasArea.dataset.zoomOffsetX = translateX.toString();
        this.canvasArea.dataset.zoomOffsetY = translateY.toString();
    }

    getSvgCoordinatesFromEvent(event) {
        const ctm = this.svgElement.getScreenCTM();
        if (!ctm) return null;
        const pt = this.svgElement.createSVGPoint();
        pt.x = event.clientX;
        pt.y = event.clientY;
        const svgPoint = pt.matrixTransform(ctm.inverse());
        return { x: svgPoint.x, y: svgPoint.y };
    }

    reset() {
        this.zoom = 1;
        this.panX = 0;
        this.panY = 0;
        this.applyTransform();
    }

    destroy() {
        this.canvasArea.removeEventListener('wheel', this.handleWheel);
        this.canvasArea.removeEventListener('mousedown', this.handleMouseDown);
        window.removeEventListener('mousemove', this.handleMouseMove);
        window.removeEventListener('mouseup', this.handleMouseUp);
        this.resizeObserver?.disconnect();
        this.canvasArea.classList.remove('is-zoomed', 'is-panning');
        delete this.canvasArea.dataset.zoomScale;
        delete this.canvasArea.dataset.zoomOffsetX;
        delete this.canvasArea.dataset.zoomOffsetY;
        this.overlayLayers.forEach((layer) => {
            layer.style.transform = '';
        });
        this.svgElement.setAttribute('viewBox', `0 0 ${this.baseWidth} ${this.baseHeight}`);
    }
}

