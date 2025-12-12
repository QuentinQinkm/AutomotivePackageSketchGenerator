import { DOT_RADIUS, DOT_RADIUS_ACTIVE } from '../constants.js';

export class BaseHumanRenderer {
    constructor({
        canvasArea,
        canvasContent,
        stateManager,
        layerController,
        svg,
        coordinateSystem,
        anchorClass,
        layerName
    }) {
        this.canvasArea = canvasArea;
        this.canvasContent = canvasContent || canvasArea; // Fallback
        this.stateManager = stateManager;
        this.layerController = layerController;
        this.svg = svg;
        this.coordinateSystem = coordinateSystem;
        this.anchorClass = anchorClass;
        this.layerName = layerName;

        this.anchors = new Map();
        this.activeAnchor = null;
        this.dragOffset = { x: 0, y: 0 };
        this.anchorLayer = null;

        this.pointTooltip = document.querySelector('.point-tooltip');
        if (!this.pointTooltip) {
            this.pointTooltip = document.createElement('div');
            this.pointTooltip.className = 'point-tooltip';
            this.canvasArea.appendChild(this.pointTooltip);
        }

        // Bind events
        this.boundHandleDragMove = (e) => this.handleDragMove(e);
        this.boundHandleDragEnd = () => this.handleDragEnd();
    }

    createAnchorLayer(className) {
        this.anchorLayer = document.createElement('div');
        this.anchorLayer.className = className;
        this.canvasContent.appendChild(this.anchorLayer); // Use canvasContent
    }

    createAnchor({ key, color }) {
        const anchor = document.createElement('div');
        anchor.className = `interactive-anchor ${this.anchorClass}`;
        anchor.dataset.key = key;
        anchor.style.backgroundColor = color;
        anchor.style.width = `${DOT_RADIUS * 2}px`;
        anchor.style.height = `${DOT_RADIUS * 2}px`;
        anchor.style.borderRadius = '50%';
        anchor.style.position = 'absolute';
        anchor.style.transform = 'translate(-50%, -50%)'; // Center pivot
        anchor.style.cursor = 'grab';
        anchor.style.display = 'none'; // Hidden by default
        anchor.style.pointerEvents = 'auto'; // Ensure clickable

        anchor.addEventListener('mousedown', (e) => this.onAnchorMouseDown(key, e));
        anchor.addEventListener('mouseenter', () => this.showTooltip(key, anchor));
        anchor.addEventListener('mouseleave', () => this.hideTooltip());

        this.anchorLayer.appendChild(anchor);
        this.anchors.set(key, anchor);
        return anchor;
    }

    updateAnchorPosition(key, worldX, worldY) {
        const anchor = this.anchors.get(key);
        if (!anchor) return;

        // Convert World (SVG) -> Overlay (Screen-relative-ish)
        const overlayPt = this.coordinateSystem.worldToOverlay(worldX, worldY);
        if (overlayPt) {
            anchor.style.left = `${overlayPt.x}px`;
            anchor.style.top = `${overlayPt.y}px`;
        }
    }

    setAnchorsVisible(visible) {
        if (!this.anchorLayer) return;
        this.anchorLayer.style.display = visible ? 'block' : 'none';
        this.anchors.forEach(anchor => {
            anchor.style.display = visible ? 'block' : 'none';
        });
    }

    onAnchorMouseDown(key, event) {
        if (!this.layerController.isActive(this.layerName)) return;

        event.preventDefault();
        event.stopPropagation();

        this.activeAnchor = key;
        const anchor = this.anchors.get(key);
        if (anchor) {
            anchor.style.cursor = 'grabbing';
            anchor.style.transform = 'translate(-50%, -50%) scale(1.2)'; // Visual feedback
        }

        // NOTE: We drag in SVG coordinates usually, or Screen coordinates?
        // Logic in subclasses uses `svgCoords`.
        // So we need to calculate offset in SVG space?
        // Or simply pass the raw mouse position to `onDrag` and let subclass handle?
        // Subclasses expect `svgCoords` (x, y in world space).
        // Let's get current mouse in World Space.
        const svgPt = this.coordinateSystem.screenToSvg(event.clientX, event.clientY);
        if (svgPt) {
            // We usually want delta, or absolute position?
            // Subclasses seem to use absolute `svgCoords`.
            // But dragging usually requires offset to anchor center.
            // Let's cheat and assume zero offset or handle it if needed.
            // Simplest: just track that we are dragging.
        }

        window.addEventListener('mousemove', this.boundHandleDragMove);
        window.addEventListener('mouseup', this.boundHandleDragEnd);
    }

    handleDragMove(event) {
        if (!this.activeAnchor) return;

        const svgPt = this.coordinateSystem.screenToSvg(event.clientX, event.clientY);
        if (!svgPt) return;

        this.onDrag(this.activeAnchor, svgPt);
    }

    handleDragEnd() {
        if (this.activeAnchor) {
            const anchor = this.anchors.get(this.activeAnchor);
            if (anchor) {
                anchor.style.cursor = 'grab';
                anchor.style.transform = 'translate(-50%, -50%)';
            }
        }
        this.activeAnchor = null;
        window.removeEventListener('mousemove', this.boundHandleDragMove);
        window.removeEventListener('mouseup', this.boundHandleDragEnd);
        this.cancelDrag();
    }

    cancelDrag() {
        // Optional hook
        this.activeAnchor = null;
    }

    // Abstract
    onDrag(key, svgCoords) {
        console.warn('onDrag not implemented in subclass');
    }

    showTooltip(key, anchor) {
        if (!this.pointTooltip) return;
        // Simple tooltip logic
        // Could be enhanced
    }

    hideTooltip() {
        if (!this.pointTooltip) return;
        this.pointTooltip.style.opacity = '0';
    }
}
