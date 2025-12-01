export class StateManager {
    constructor({ inputs, displays }) {
        this.inputs = inputs;
        this.displays = displays;
        this.state = this.#buildInitialState();
        this.listeners = new Set();
        this.wheelBaseBounds = {
            min: parseInt(this.inputs.wheelBase.min, 10),
            max: parseInt(this.inputs.wheelBase.max, 10)
        };
        this.interactingParam = null;
        this.interactionListeners = new Set();
    }

    #buildInitialState() {
        return {
            tireDiameter: parseInt(this.inputs.tireDiameter.value, 10),
            wheelArchGap: parseInt(this.inputs.wheelArchGap.value, 10),
            wheelBase: parseInt(this.inputs.wheelBase.value, 10),
            groundClearance: parseInt(this.inputs.groundClearance.value, 10),
            floorThickness: parseInt(this.inputs.floorThickness.value, 10),
            frontOverhang: parseInt(this.inputs.frontOverhang.value, 10),
            rearOverhang: parseInt(this.inputs.rearOverhang.value, 10),
            frontApproachAngle: parseInt(this.inputs.frontApproachAngle.value, 10),
            rearDepartureAngle: parseInt(this.inputs.rearDepartureAngle.value, 10),
            frontFaceBreakX: 775,
            frontFaceBreakY: 525,
            bonnetEndX: -365,
            bonnetEndY: 660,
            windowEndX: -1445,
            windowEndY: 1125,
            rooftopEndX: -195,
            rooftopEndY: 1130,
            rearWindowEndX: -500,
            rearWindowEndY: 775,
            bumperEndX: -890,
            bumperEndY: 535,
            hPointHeight: parseInt(this.inputs.hPointHeight.value, 10),
            hPointX: parseInt(this.inputs.hPointX.value, 10),
            hipPedalDistance: parseInt(this.inputs.hipPedalDistance.value, 10),
            bodyReclineAngle: parseInt(this.inputs.bodyReclineAngle.value, 10),
            handHeight: parseInt(this.inputs.handHeight.value, 10),
            handDistanceX: parseInt(this.inputs.handDistanceX.value, 10),
            mannequinHeight: parseInt(this.inputs.mannequinHeight.value, 10),
            showMannequin: this.inputs.showMannequin.checked,
            bodyControlPoints: {},
            nextControlPointId: 1,
            imageOpacity: 50,
            imageRotation: 0,
            imageScale: 100,
            imageData: null,
            imageFlipped: false,
            imageFrame: { x: 0, y: 0, width: 0, height: 0 }
        };
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    notify(context) {
        this.listeners.forEach((listener) => listener(this.state, context));
    }

    subscribeInteraction(listener) {
        this.interactionListeners.add(listener);
        return () => this.interactionListeners.delete(listener);
    }

    setInteraction(paramName) {
        let changed = false;
        if (Array.isArray(paramName)) {
            // Simple check: different length or different content
            if (!Array.isArray(this.interactingParam) ||
                this.interactingParam.length !== paramName.length ||
                !paramName.every((val, index) => val === this.interactingParam[index])) {
                this.interactingParam = paramName;
                changed = true;
            }
        } else if (this.interactingParam !== paramName) {
            this.interactingParam = paramName;
            changed = true;
        }

        if (changed) {
            this.interactionListeners.forEach(l => l(this.interactingParam));
        }
    }

    updateFromInputs() {
        this.state.tireDiameter = parseInt(this.inputs.tireDiameter.value, 10);
        this.state.wheelArchGap = parseInt(this.inputs.wheelArchGap.value, 10);
        this.state.wheelBase = parseInt(this.inputs.wheelBase.value, 10);
        this.state.groundClearance = parseInt(this.inputs.groundClearance.value, 10);
        this.state.floorThickness = parseInt(this.inputs.floorThickness.value, 10);
        this.state.frontOverhang = parseInt(this.inputs.frontOverhang.value, 10);
        this.state.rearOverhang = parseInt(this.inputs.rearOverhang.value, 10);
        this.state.frontApproachAngle = parseInt(this.inputs.frontApproachAngle.value, 10);
        this.state.rearDepartureAngle = parseInt(this.inputs.rearDepartureAngle.value, 10);
        this.state.hPointHeight = parseInt(this.inputs.hPointHeight.value, 10);
        this.state.hPointX = parseInt(this.inputs.hPointX.value, 10);
        this.state.hipPedalDistance = parseInt(this.inputs.hipPedalDistance.value, 10);
        this.state.bodyReclineAngle = parseInt(this.inputs.bodyReclineAngle.value, 10);
        this.state.handHeight = parseInt(this.inputs.handHeight.value, 10);
        this.state.handDistanceX = parseInt(this.inputs.handDistanceX.value, 10);
        this.state.mannequinHeight = parseInt(this.inputs.mannequinHeight.value, 10);
        this.state.showMannequin = this.inputs.showMannequin.checked;

        this.#syncValueDisplays();
        this.notify();
    }

    #syncValueDisplays() {
        if (!this.displays) return;
        this.displays.tireDiameter.textContent = `${this.state.tireDiameter}mm`;
        this.displays.wheelArchGap.textContent = `${this.state.wheelArchGap}mm`;
        this.displays.wheelBase.textContent = `${this.state.wheelBase}mm`;
        this.displays.groundClearance.textContent = `${this.state.groundClearance}mm`;
        this.displays.floorThickness.textContent = `${this.state.floorThickness}mm`;
        this.displays.frontOverhang.textContent = `${this.state.frontOverhang}mm`;
        this.displays.rearOverhang.textContent = `${this.state.rearOverhang}mm`;
        this.displays.frontApproachAngle.textContent = `${this.state.frontApproachAngle}°`;
        this.displays.rearDepartureAngle.textContent = `${this.state.rearDepartureAngle}°`;
        this.displays.hPointHeight.textContent = `${this.state.hPointHeight}mm`;
        this.displays.hPointX.textContent = `${this.state.hPointX}mm`;
        this.displays.hipPedalDistance.textContent = `${this.state.hipPedalDistance}mm`;
        this.displays.bodyReclineAngle.textContent = `${this.state.bodyReclineAngle}°`;
        this.displays.handHeight.textContent = `${this.state.handHeight}mm`;
        this.displays.handDistanceX.textContent = `${this.state.handDistanceX}mm`;
    }

    setState(partial, { silent = false, ...context } = {}) {
        if (!partial || typeof partial !== 'object') return;

        Object.entries(partial).forEach(([key, value]) => {
            if (value === undefined) return;
            this.state[key] = value;
            this.#syncInputValue(key, value);
        });

        if (!silent) {
            this.notify(context);
        }
    }

    replaceState(newState, { silent = false, ...context } = {}) {
        if (!newState || typeof newState !== 'object') return;

        // We want to keep the structure but replace values.
        // However, if newState is missing keys that are in this.state, they should probably be reset or removed?
        // For this app, we want to fully adopt newState.
        // But we should probably preserve keys that are NOT in newState if they are essential?
        // Actually, for profile switching, we want exact match.

        // But we must be careful not to lose internal state if any.
        // The state object seems to be just data.

        // Let's merge newState into a fresh default state to ensure we have all keys, 
        // effectively resetting anything not in newState to default.
        const defaultState = this.#buildInitialState();
        this.state = { ...defaultState, ...newState };

        // Sync all inputs
        Object.entries(this.state).forEach(([key, value]) => {
            this.#syncInputValue(key, value);
        });

        if (!silent) {
            this.notify(context);
        }
    }



    getState() {
        return this.state;
    }

    getWheelBaseBounds() {
        return this.wheelBaseBounds;
    }

    addBodyControlPoint(segmentId, t) {
        if (!segmentId && segmentId !== 0) return null;
        if (!this.state.bodyControlPoints[segmentId]) {
            this.state.bodyControlPoints[segmentId] = [];
        }
        if (this.state.bodyControlPoints[segmentId].length >= 2) {
            return null;
        }
        const id = this.state.nextControlPointId++;
        this.state.bodyControlPoints[segmentId].push({
            id,
            t: Math.max(0, Math.min(1, t)),
            offsetParallel: 0,
            offsetPerpendicular: 0,
            mode: 'hard',
            handleIn: { parallel: 0, perpendicular: 0 },
            handleOut: { parallel: 0, perpendicular: 0 }
        });
        this.notify();
        return id;
    }

    removeBodyControlPoint(segmentId, pointId) {
        const points = this.state.bodyControlPoints[segmentId];
        if (!points || !points.length) return;
        const next = points.filter((point) => point.id !== pointId);
        this.state.bodyControlPoints[segmentId] = next;
        this.notify();
    }

    getBodyControlPoints(segmentId) {
        return this.state.bodyControlPoints[segmentId] || [];
    }

    updateBodyControlPoint(segmentId, pointId, data, { silent = false } = {}) {
        const points = this.state.bodyControlPoints[segmentId];
        if (!points) return;
        const point = points.find((p) => p.id === pointId);
        if (!point) return;
        if (typeof data.t === 'number') {
            point.t = Math.max(0, Math.min(1, data.t));
        }
        if (typeof data.offsetParallel === 'number') {
            point.offsetParallel = data.offsetParallel;
        }
        if (typeof data.offsetPerpendicular === 'number') {
            point.offsetPerpendicular = data.offsetPerpendicular;
        }
        if (!silent) {
            this.notify();
        }
    }

    setBodyControlPointMode(segmentId, pointId, mode) {
        const point = this.#findControlPoint(segmentId, pointId);
        if (!point) return;
        point.mode = mode;
        if (mode === 'hard') {
            point.handleIn = { parallel: 0, perpendicular: 0 };
            point.handleOut = { parallel: 0, perpendicular: 0 };
        } else if (mode === 'symmetric') {
            if (point.handleOut.parallel === 0 && point.handleOut.perpendicular === 0) {
                point.handleOut = { parallel: 0, perpendicular: -150 };
            }
            point.handleIn = {
                parallel: -point.handleOut.parallel,
                perpendicular: -point.handleOut.perpendicular
            };
        } else if (mode === 'asymmetric') {
            if (point.handleIn.parallel === 0 && point.handleIn.perpendicular === 0 &&
                point.handleOut.parallel === 0 && point.handleOut.perpendicular === 0) {
                point.handleIn = { parallel: 0, perpendicular: 150 };
                point.handleOut = { parallel: 0, perpendicular: -150 };
            }
        }
        this.notify();
    }

    updateBodyControlPointHandle(segmentId, pointId, handleKey, values, { symmetricMode = false, silent = false } = {}) {
        const point = this.#findControlPoint(segmentId, pointId);
        if (!point) return;
        point[handleKey] = {
            parallel: values.parallel,
            perpendicular: values.perpendicular
        };
        if (symmetricMode) {
            if (handleKey === 'handleIn') {
                point.handleOut = {
                    parallel: -values.parallel,
                    perpendicular: -values.perpendicular
                };
            } else {
                point.handleIn = {
                    parallel: -values.parallel,
                    perpendicular: -values.perpendicular
                };
            }
        }
        if (!silent) {
            this.notify();
        }
    }

    #findControlPoint(segmentId, pointId) {
        const points = this.state.bodyControlPoints[segmentId];
        if (!points) return null;
        return points.find((p) => p.id === pointId);
    }

    #syncInputValue(key, value) {
        if (!this.inputs || !this.inputs[key]) return;
        const input = this.inputs[key];

        if (input.type === 'checkbox') {
            input.checked = Boolean(value);
            return;
        }

        // Avoid fighting the user's active edits
        if (document.activeElement === input) return;

        input.value = value != null ? value.toString() : '';
    }
}

