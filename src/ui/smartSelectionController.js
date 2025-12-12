export class SmartSelectionController {
    constructor({ canvasArea, layerController, stateManager }) {
        this.canvasArea = canvasArea;
        this.layerController = layerController;
        this.stateManager = stateManager;

        this.hoveredGroup = null;
        this.potentialTarget = null;

        this.groups = [
            { id: 'driver', selector: '.bodyandhead-parent', layer: 'driver' },
            { id: 'mid', selector: '.passenger-parent-mid', layer: 'passenger', row: 'mid' },
            { id: 'last', selector: '.passenger-parent-last', layer: 'passenger', row: 'last' }
        ];

        // Bind handlers
        this.handleMouseMove = (e) => this.onMouseMove(e);
        this.handleClick = (e) => this.onClick(e);

        // Attach to window/document to ensure we catch events bubbling up or global moves
        // Attaching to canvasArea specifically.
        this.canvasArea.addEventListener('mousemove', this.handleMouseMove);
        this.canvasArea.addEventListener('click', this.handleClick);

        // Initialize Visuals
        this.updateVisuals();

        // Listen for Layer Changes (if LayerController supports it)
        if (this.layerController && typeof this.layerController.onChange === 'function') {
            this.layerController.onChange((newLayer) => {
                this.updateVisuals();
            });
        }

        // Listen for State Changes (to catch activePassengerRow switching via Tabs)
        if (this.stateManager && typeof this.stateManager.subscribe === 'function') {
            this.stateManager.subscribe((state) => {
                this.updateVisuals();
            });
        }
    }

    onMouseMove(e) {
        // 1. Get all elements under the cursor
        const elements = document.elementsFromPoint(e.clientX, e.clientY);

        // 2. Filter for our groups
        const hits = new Set();

        elements.forEach(el => {
            // Check if element belongs to any of our groups
            for (const group of this.groups) {
                // We check if the element is inside the group container
                // AND the group container is visible
                const container = document.querySelector(group.selector);
                if (container && container.style.display !== 'none' && container.contains(el)) {
                    hits.add(group);
                }
            }
        });

        // 3. Evaluate Collision
        const prevHover = this.hoveredGroup;

        // "If the cursor is hovering on overlapped, do not active"
        // Strict interpretation: If valid hits > 1, treating as ambiguous or 'overlapped' -> clear hover.
        if (hits.size === 1) {
            const targetGroup = hits.values().next().value;
            // Only update if changed
            if (prevHover !== targetGroup) {
                this.hoveredGroup = targetGroup;
                this.potentialTarget = targetGroup;
                this.updateVisuals();
            }
        } else {
            // 0 hits OR > 1 hits (overlapped) -> Clear hover
            if (prevHover) {
                this.hoveredGroup = null;
                this.potentialTarget = null;
                this.updateVisuals();
            }
        }
    }

    onClick(e) {
        if (this.potentialTarget) {
            const group = this.potentialTarget;

            // Activate Layer
            if (this.layerController) {
                this.layerController.setActiveLayer(group.layer);
            }

            // If Passenger, define active row
            if (group.layer === 'passenger') {
                // Update StateManager with new active row
                // This will trigger the UI updates in PassengerRenderer
                this.stateManager.setState({ activePassengerRow: group.row });

                // Also ensures the tab in UI is updated (if layerController doesn't handle inner tabs)
                // LayerController handles high level layers. 
                // We might need to manually trigger the tab click or update state?
                // The PassengerRenderer listens to 'activePassengerRow' change and updates visibility.
                // But the UI tabs (in index.html) need to update too. 
                // Let's assume there's a listener for that or we force it here?
                // Actually, let's look at index.html -> .passenger-row-tabs-btn
                const tabBtn = document.querySelector(`.passenger-row-tabs-btn[data-target="${group.row}"]`);
                if (tabBtn) {
                    tabBtn.click(); // Simulate click to trigger all existing logic
                }
            }
            // Force update visuals immediately after click
            this.updateVisuals();
        }
    }

    setHover(group) {
        // Deprecated by updateVisuals, but kept for compatibility/internal calls if needed
        // this.hoveredGroup = group;
        // this.updateVisuals();
    }

    clearHover() {
        // Deprecated by updateVisuals mechanics
        // this.hoveredGroup = null;
        // this.updateVisuals();
    }

    updateVisuals() {
        const activeLayer = this.layerController ? this.layerController.selectedLayer : 'chassis';
        let hasHover = false;

        // If Chassis is active, all figures are Inactive (0.6) unless hovered (0.8)
        // If Driver is active, Driver is Active (1.0), Passenger is Inactive (0.6).
        // If Passenger is active, Passenger is Active (1.0), Driver is Inactive (0.6).

        this.groups.forEach(group => {
            const container = document.querySelector(group.selector);
            if (!container) return;

            // Reset classes
            container.classList.remove('is-active', 'is-inactive', 'is-hovered');

            // 1. Determine Base State (Active vs Inactive)
            let isActive = (group.layer === activeLayer);

            // Refine for Passenger: Only the specific row is active
            if (isActive && group.layer === 'passenger') {
                const currentActiveRow = this.stateManager.state.activePassengerRow || 'last';
                // group.row must match currentActiveRow
                // Groups: { id:'mid', row:'mid' }, { id:'last', row:'last' }
                // Driver doesn't have row property, so check only if row exists.
                if (group.row && group.row !== currentActiveRow) {
                    isActive = false;
                }
            }

            if (isActive) {
                // Active State (1.0)
                container.classList.add('is-active');
                // Even if hovered, we keep is-active (1.0) or add is-hovered (0.8)?
                // User requirement: "selected 1.0". So we don't degrade to 0.8.
                // UNLESS user wants hover feedback on active?
                // Let's assume Active overrides Hover for opacity (1.0), but Cursor changes.
                // Actually CSS .is-hovered !important might override .is-active.
                // If .is-active is 1.0 !important and .is-hovered is 0.8 !important...
                // In CSS I put !important on both. Last one wins in file order or specificity.
                // I put .is-active AFTER .is-hovered in CSS edit?
                // Wait, previous edit:
                // .is-hovered ...
                // .is-active ...
                // So .is-active wins if both present. Good.

            } else {
                // Inactive State (0.6)
                container.classList.add('is-inactive');

                // 2. Determine Hover State (only relevant for Inactive?)
                // "non-selected should be 0.6, hovered to be 0.8"
                if (this.hoveredGroup === group) {
                    container.classList.add('is-hovered'); // Will override is-inactive via !important
                    hasHover = true;
                }
            }
        });

        // Force cursor on canvasArea if hovering valid target, to bypass overlay cursor issues
        if (this.hoveredGroup || (this.potentialTarget && hasHover)) {
            this.canvasArea.style.cursor = 'pointer';
        } else {
            this.canvasArea.style.cursor = '';
        }
    }

    destroy() {
        this.canvasArea.removeEventListener('mousemove', this.handleMouseMove);
        this.canvasArea.removeEventListener('click', this.handleClick);
    }
}
