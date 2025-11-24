export class LayerController {
    constructor({ buttons, controlGroups, defaultLayer = 'chassis' }) {
        this.buttons = Array.from(buttons);
        this.controlGroups = Array.from(controlGroups);
        this.selectedLayer = defaultLayer;
        this.listeners = new Set();
        this.#bind();
        this.#updateUI();
    }

    #bind() {
        this.buttons.forEach((button) => {
            button.addEventListener('click', () => {
                const nextLayer = button.getAttribute('data-layer');
                this.setActiveLayer(nextLayer);
            });
        });
    }

    #updateUI() {
        this.buttons.forEach((button) => {
            const layer = button.getAttribute('data-layer');
            button.classList.toggle('active', layer === this.selectedLayer);
        });

        this.controlGroups.forEach((group) => {
            const layer = group.getAttribute('data-layer-controls');
            group.classList.toggle('active', layer === this.selectedLayer);
        });
    }

    setActiveLayer(layer) {
        if (!layer || layer === this.selectedLayer) return;
        this.selectedLayer = layer;
        this.#updateUI();
        this.listeners.forEach((listener) => listener(this.selectedLayer));
    }

    onChange(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    isActive(layer) {
        return this.selectedLayer === layer;
    }
}

