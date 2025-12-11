export function initializeControlBindings(definitions = []) {
    const inputs = {};
    const displays = {};
    const listenerTargets = [];
    const teardownFns = [];

    definitions.forEach((definition) => {
        if (!definition?.inputId) return;

        const inputEl = document.getElementById(definition.inputId);
        if (!inputEl) return;

        inputs[definition.name] = inputEl;

        if (definition.displayId) {
            const displayEl = document.getElementById(definition.displayId);
            if (displayEl) {
                displays[definition.name] = displayEl;
            }
        }

        listenerTargets.push({
            element: inputEl,
            eventType: definition.eventType || 'input'
        });
    });

    return {
        inputs,
        displays,
        attachListeners(handler) {
            if (typeof handler !== 'function') return;
            listenerTargets.forEach((target) => {
                const boundHandler = () => handler(target.element);
                target.element.addEventListener(target.eventType, boundHandler);
                teardownFns.push(() => target.element.removeEventListener(target.eventType, boundHandler));
            });
        },
        teardown() {
            teardownFns.forEach((teardown) => teardown());
            teardownFns.length = 0;
        }
    };
}

