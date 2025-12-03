export class SmartToggle {
    constructor(element, stateManager, paramName = null) {
        this.element = element;
        this.stateManager = stateManager;
        this.paramName = paramName || element.dataset.param;
        this.label = element.dataset.label || this.paramName;

        if (!element.querySelector('.toggle-label')) {
            this.buildDOM();
        }

        this.toggleSwitch = element.querySelector('.toggle-switch');

        this.init();
    }

    buildDOM() {
        // Clear existing content to avoid duplication if called multiple times
        this.element.innerHTML = `
            <div class="toggle-label">${this.label}</div>
            <div class="toggle-value">OFF</div>
        `;
    }

    init() {
        this.element.addEventListener('click', () => this.toggle());

        // Initial sync
        this.updateVisuals();

        // Subscribe to state changes
        this.stateManager.subscribe(() => this.updateVisuals());
    }

    toggle() {
        const currentValue = this.stateManager.state[this.paramName];
        this.stateManager.setState({ [this.paramName]: !currentValue });
    }

    updateVisuals() {
        const isActive = this.stateManager.state[this.paramName];
        const valueEl = this.element.querySelector('.toggle-value');

        if (isActive) {
            this.element.classList.add('on');
            this.element.classList.remove('off');
            if (valueEl) valueEl.textContent = 'ON';
        } else {
            this.element.classList.add('off');
            this.element.classList.remove('on');
            if (valueEl) valueEl.textContent = 'OFF';
        }
    }
}
