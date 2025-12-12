import { SCALE, CENTER_X, GROUND_Y, ASSET_COORDS } from '../constants.js';

export class CoordinateSystem {
    constructor({ svg, canvasArea, hipAssetPosition }) {
        this.svg = svg;
        this.canvasArea = canvasArea;

        // This is specific to Human figures, maybe pass it in or keep generic?
        // We'll keep it here for now as part of the "Asset" coordinate system
        this.hipAssetPosition = hipAssetPosition;

        this.ctm = null;
        this.svgRect = null;
        this.cachedScale = 1;

        // Force initial update
        this.update();
    }

    update() {
        if (!this.svg) return;
        this.ctm = this.svg.getScreenCTM();
        this.svgRect = this.canvasArea.getBoundingClientRect();

        // Calculate SVG Unit Scale (average of X and Y scale)
        if (this.ctm) {
            const scaleX = Math.hypot(this.ctm.a, this.ctm.b);
            const scaleY = Math.hypot(this.ctm.c, this.ctm.d);
            this.svgUnitScale = (scaleX + scaleY) / 2;
        }
    }

    // --- World (mm) <-> Canvas (SVG px) ---

    // Converts World (mm) X to Canvas (px) X
    worldXToCanvasX(mmX) {
        // This depends on the reference frame. 
        // Most things are relative to CENTER_X.
        // Assuming absolute world coordinates where 0 is far left?
        // Actually, the app uses center-relative logic often.
        // But renderers render objects at absolute SVG coordinates.
        // E.g. RearWheelX = CENTER_X + WheelBase/2.
        // So "World MM" usually implies relative to some point, but let's assume
        // the inputs here are already in "SVG Coordinate Space" (px) but derived from MM.
        // Wait, "worldToCanvasPoint" in renderers took x/y which were ALREADY computed pixels.
        // Let's stick to that: "World" here means "SVG Coordinate Space".
        return mmX;
    }

    // --- SVG (px) <-> Screen (px) ---

    // Gets the screen coordinates (clientX, clientY) for a point in SVG space
    svgToScreen(x, y) {
        if (!this.svg || !this.ctm) return null;
        const pt = this.svg.createSVGPoint();
        pt.x = x;
        pt.y = y;
        return pt.matrixTransform(this.ctm);
    }

    // Gets the SVG coordinates for a screen point (e.g. Mouse Event)
    screenToSvg(clientX, clientY) {
        if (!this.svg || !this.ctm) return null;
        const pt = this.svg.createSVGPoint();
        pt.x = clientX;
        pt.y = clientY;
        return pt.matrixTransform(this.ctm.inverse());
    }

    // --- Screen (px) <-> Overlay Local (px) ---

    // Converts a scren point to the local coordinate system of the Overlay/DOM container
    // taking into account the Zoom/Pan CSS transforms applied to the container.
    screenToOverlayLocal(screenPoint) {
        if (!this.svgRect) this.update();

        const zoom = parseFloat(this.canvasArea.dataset.zoomScale || '1');
        const offsetX = parseFloat(this.canvasArea.dataset.zoomOffsetX || '0');
        const offsetY = parseFloat(this.canvasArea.dataset.zoomOffsetY || '0');

        const relX = screenPoint.x - this.svgRect.left;
        const relY = screenPoint.y - this.svgRect.top;

        return {
            x: (relX - offsetX) / zoom,
            y: (relY - offsetY) / zoom
        };
    }

    // --- Composition: World (SVG px) -> Overlay Local (px) ---
    // Used for placing DOM elements (anchors, divs) over SVG positions
    worldToOverlay(x, y) {
        const screenPt = this.svgToScreen(x, y);
        if (!screenPt) return null;
        return this.screenToOverlayLocal(screenPt);
    }

    // --- Asset System (Human Figures) ---

    // Converts a World Point (SVG Px) to a point relative to the Asset Image
    worldToAsset(worldPoint, pose) {
        if (!worldPoint || !pose?.hip || !pose.globalScale || !this.hipAssetPosition) return null;
        return {
            x: this.hipAssetPosition.x + ((worldPoint.x - pose.hip.x) / pose.globalScale),
            y: this.hipAssetPosition.y + ((worldPoint.y - pose.hip.y) / pose.globalScale)
        };
    }

    // Converts an Asset Point to Local Overlay Coordinates (relative to parent container)
    assetToLocal(assetPoint) {
        if (!assetPoint) return null;
        return {
            x: assetPoint.x - ASSET_COORDS.parentOffset.x,
            y: assetPoint.y - ASSET_COORDS.parentOffset.y
        };
    }
}
