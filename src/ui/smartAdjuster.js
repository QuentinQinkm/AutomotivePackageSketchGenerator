export class SmartAdjuster {
    constructor(element, stateManager, paramName = null, options = {}) {
        this.element = element;
        this.stateManager = stateManager;

        // Read config from data attributes if not provided
        this.paramName = paramName || element.dataset.param;
        this.label = element.dataset.label || this.paramName;

        this.min = parseFloat(element.dataset.min) || options.min || 0;
        this.max = parseFloat(element.dataset.max) || options.max || 1000;
        this.step = parseFloat(element.dataset.step) || options.step || 10;

        // Build DOM if empty
        if (!element.querySelector('.adjuster-value')) {
            this.buildDOM();
        }

        this.valueDisplay = element.querySelector('.adjuster-value');
        this.knobTrack = element.querySelector('.adjuster-knob-track');

        // Visual Configuration
        this.gap = 15; // Pixels between ticks
        this.numTicks = 9; // Number of visible ticks (odd number for center)
        this.ticks = [];

        // Interaction State
        this.isDragging = false;
        this.startX = 0;
        this.startValue = 0;
        this.currentTrackOffset = 0;

        // Sensitivity: 1 gap = 1 step
        this.sensitivity = this.step / this.gap;

        this.init();
    }

    buildDOM() {
        this.element.innerHTML = `
            <div class="adjuster-label">${this.label}</div>
            <div class="adjuster-knob-container">
                <div class="adjuster-knob-mask">
                    <div class="adjuster-knob-track"></div>
                </div>
            </div>
            <div class="adjuster-value">--</div>
        `;
    }

    init() {
        // Create Tick Elements
        this.createTicks();

        this.element.addEventListener('mousedown', (e) => this.handleMouseDown(e));
        window.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        window.addEventListener('mouseup', () => this.handleMouseUp());

        // Initial value sync
        this.updateDisplay();
        this.updateKnobVisuals();

        // Subscribe to state changes
        this.stateManager.subscribe(() => this.updateDisplay());
    }

    createTicks() {
        if (!this.knobTrack) return;
        this.knobTrack.innerHTML = '';
        this.ticks = [];
        for (let i = 0; i < this.numTicks; i++) {
            const tick = document.createElement('div');
            tick.className = 'knob-tick';
            this.knobTrack.appendChild(tick);
            this.ticks.push(tick);
        }
    }

    handleMouseDown(e) {
        this.isDragging = true;
        this.startX = e.clientX;
        this.startValue = this.stateManager.state[this.paramName];
        this.element.classList.add('is-dragging');
        document.body.style.cursor = 'ew-resize';

        // Report interaction start
        this.stateManager.setInteraction(this.paramName);

        e.preventDefault();
    }

    handleMouseMove(e) {
        if (!this.isDragging) return;

        const deltaX = e.clientX - this.startX;

        // Calculate continuous value based on drag
        // Drag Right (Positive Delta) -> Value Down (Reverse interaction)
        // 1 gap = 1 step
        const stepsMoved = -deltaX / this.gap;
        let continuousValue = this.startValue + (stepsMoved * this.step);

        // Clamp to boundaries
        // This implements "dial stops scroll when reach max/min"
        continuousValue = Math.max(this.min, Math.min(this.max, continuousValue));

        // Calculate effective delta based on clamped value
        // This ensures the visual knob stops exactly at the limit
        const effectiveDeltaX = ((continuousValue - this.startValue) / this.step) * this.gap;

        // Update State (Discrete)
        const discreteValue = Math.round(continuousValue / this.step) * this.step;
        if (discreteValue !== this.stateManager.state[this.paramName]) {
            this.stateManager.setState({ [this.paramName]: discreteValue });
        }

        // Update Visual Track
        // Invert direction: Drag Right -> Track moves Left (to show higher values coming from right)
        this.currentTrackOffset = -effectiveDeltaX;

        // Pass the continuous value to visuals to determine tick visibility
        this.updateKnobVisuals(continuousValue);
    }

    handleMouseUp() {
        if (this.isDragging) {
            this.isDragging = false;
            this.element.classList.remove('is-dragging');
            document.body.style.cursor = '';

            // Clear interaction
            this.stateManager.setInteraction(null);

            // Reset offset logic
            // Since we calculate from startValue every time, we don't strictly need to reset 
            // currentTrackOffset to 0 if we updated startValue.
            // But to keep it clean for the next drag (which starts at delta 0):
            this.currentTrackOffset = 0;
            this.updateKnobVisuals(this.stateManager.state[this.paramName]);
        }
    }

    updateKnobVisuals(currentContinuousValue = null) {
        if (!this.ticks.length) return;

        // If not dragging, use current state value
        if (currentContinuousValue === null) {
            currentContinuousValue = this.stateManager.state[this.paramName];
        }

        const centerIndex = Math.floor(this.numTicks / 2);

        // Phase is the shift within one gap
        // We use the track offset directly
        const phase = this.currentTrackOffset % this.gap;

        this.ticks.forEach((tick, i) => {
            // logicalOffset: -4, -3, -2, -1, 0, 1, 2, 3, 4
            const logicalOffset = i - centerIndex;

            // Position in pixels relative to container center
            // We add phase because track moves. 
            // If track moves Left (negative offset), phase is negative.
            // Ticks shift left.
            let pos = (logicalOffset * this.gap) + phase;

            // Calculate the value this tick represents
            // Tick at +1 (Right) represents Value + Step
            // Tick at -1 (Left) represents Value - Step
            // We need to account for the phase shift in the value calculation
            // Actually, simpler: 
            // The "Center" of the widget represents `currentContinuousValue`.
            // A tick at `pos` pixels from center represents:
            // value = currentContinuousValue + (pos / gap) * step
            const tickValue = currentContinuousValue + (pos / this.gap) * this.step;

            // Check boundaries
            // "No extra strokes left/right ... when reach the limit"
            // We add a small epsilon to handle floating point precision
            const isVisible = tickValue >= (this.min - 0.01) && tickValue <= (this.max + 0.01);

            if (!isVisible) {
                tick.style.opacity = 0;
                return;
            }

            // Distance from center (0)
            const dist = Math.abs(pos);

            // Visual Morphing
            const maxDist = this.gap * 2.5;
            let intensity = Math.max(0, 1 - (dist / maxDist));
            intensity = Math.pow(intensity, 3);

            // Dimensions
            const height = 8 + (8 * intensity);
            const opacity = 0.4 + (0.4 * intensity);
            const width = 1 + (1.5 * intensity);

            tick.style.transform = `translate(calc(-50% + ${pos}px), -50%)`;
            tick.style.height = `${height}px`;
            tick.style.opacity = opacity;
            tick.style.width = `${width}px`;
            tick.style.borderRadius = `${width}px`;
        });
    }

    updateDisplay() {
        const value = this.stateManager.state[this.paramName];
        if (value !== undefined) {
            // Determine decimal places based on step
            const decimals = (this.step.toString().split('.')[1] || '').length;
            this.valueDisplay.textContent = value.toFixed(decimals);
        }
    }
}
