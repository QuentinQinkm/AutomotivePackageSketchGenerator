export class ProfileManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.profiles = [];
        this.activeProfileIndex = 0;
        this.container = document.getElementById('profileBarContainer');
        this.defaultState = this.roundValues(this.stateManager.getState());
        this.maxProfiles = 5;
        this.profileCountListeners = new Set();

        // Initialize with a default profile
        this.addProfile('Profile 1', this.stateManager.getState(), true);

        // Subscribe to state changes to update the active profile's data
        this.stateManager.subscribe((state, context) => {
            // Ignore updates caused by our own animation to prevent overwriting the profile with intermediate values
            if (context && context.isAnimating) return;

            if (this.profiles[this.activeProfileIndex]) {
                this.profiles[this.activeProfileIndex].data = { ...state };
                this.updateDimensionsDisplay();
            }
        });

        this.render();
    }

    addProfile(name, data, silent = false) {
        if (!silent && this.profiles.length >= this.maxProfiles) {
            return false;
        }

        const shouldStripImageState = !data;
        const sourceState = data || this.defaultState;
        const snapshot = this.roundValues(sourceState);

        if (shouldStripImageState) {
            this.#stripImageState(snapshot);
        }

        const profile = {
            name: name || `Profile ${this.profiles.length + 1}`,
            data: snapshot
        };
        this.profiles.push(profile);
        if (!silent) {
            this.setActiveProfile(this.profiles.length - 1);
        } else {
            this.render();
        }
        this.#emitProfileCountChange();
        return true;
    }

    setActiveProfile(index) {
        if (index < 0 || index >= this.profiles.length) return;
        this.activeProfileIndex = index;
        const profile = this.profiles[index];

        // Render first to create the DOM elements (update active class)
        this.render();

        // Animate to the new state
        this.animateToState(profile.data);
    }

    animateToState(targetState, duration = 800) {
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        const startState = this.stateManager.getState();

        // Preserve cross-profile settings
        if (startState.hasOwnProperty('showAssistLines')) {
            targetState = { ...targetState, showAssistLines: startState.showAssistLines };
        }
        const startTime = performance.now();
        const handleDuration = 500; // Handles finish faster

        // Identify numeric keys to interpolate
        const numericKeys = Object.keys(targetState).filter(key =>
            typeof targetState[key] === 'number' &&
            typeof startState[key] === 'number' &&
            key !== 'nextControlPointId' // Don't animate IDs
        );

        // Prepare Control Point Animations
        const controlPointAnimations = [];
        const startPoints = startState.bodyControlPoints || {};
        const targetPoints = targetState.bodyControlPoints || {};
        const allSegmentIds = new Set([...Object.keys(startPoints), ...Object.keys(targetPoints)]);

        allSegmentIds.forEach(segmentId => {
            const sList = startPoints[segmentId] || [];
            const tList = targetPoints[segmentId] || [];
            const processedTargetIds = new Set();
            const processedTargetIndices = new Set();

            // 1. Handle Start Points (Matching & Disappearing)
            sList.forEach((sPoint, sIndex) => {
                // Try to find match by ID first
                let tPoint = tList.find(p => p.id === sPoint.id);
                let tIndex = tList.findIndex(p => p.id === sPoint.id);

                // Fallback: If no ID match, try matching by index (if that index hasn't been matched yet)
                if (!tPoint) {
                    if (tList[sIndex] && !processedTargetIds.has(tList[sIndex].id)) {
                        tPoint = tList[sIndex];
                        tIndex = sIndex;
                    }
                }

                if (tPoint) {
                    // Matching: Animate Start -> Target
                    processedTargetIds.add(tPoint.id);
                    processedTargetIndices.add(tIndex);
                    controlPointAnimations.push({
                        segmentId,
                        start: sPoint,
                        target: tPoint
                    });
                } else {
                    // Disappearing: Animate Start -> Neutral
                    const neutral = {
                        ...sPoint,
                        offsetParallel: 0,
                        offsetPerpendicular: 0,
                        handleIn: { parallel: 0, perpendicular: 0 },
                        handleOut: { parallel: 0, perpendicular: 0 }
                    };
                    controlPointAnimations.push({
                        segmentId,
                        start: sPoint,
                        target: neutral
                    });
                }
            });

            // 2. Handle Appearing Points (Target points not in Start)
            tList.forEach((tPoint, tIndex) => {
                if (!processedTargetIds.has(tPoint.id) && !processedTargetIndices.has(tIndex)) {
                    // Appearing: Animate Neutral -> Target
                    const neutral = {
                        ...tPoint,
                        offsetParallel: 0,
                        offsetPerpendicular: 0,
                        handleIn: { parallel: 0, perpendicular: 0 },
                        handleOut: { parallel: 0, perpendicular: 0 }
                    };
                    controlPointAnimations.push({
                        segmentId,
                        start: neutral,
                        target: tPoint
                    });
                }
            });
        });

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const handleProgress = Math.min(elapsed / handleDuration, 1);

            // Ease out cubic
            const ease = 1 - Math.pow(1 - progress, 3);
            const handleEase = 1 - Math.pow(1 - handleProgress, 3);

            const nextState = { ...startState };

            // 1. Interpolate numbers
            numericKeys.forEach(key => {
                nextState[key] = startState[key] + (targetState[key] - startState[key]) * ease;
            });

            // 2. Interpolate Control Points
            if (controlPointAnimations.length > 0) {
                const nextBodyPoints = {};

                controlPointAnimations.forEach(anim => {
                    const { segmentId, start, target } = anim;
                    if (!nextBodyPoints[segmentId]) {
                        nextBodyPoints[segmentId] = [];
                    }

                    const interpolatedPoint = { ...start }; // Copy base props (id, mode, etc.)

                    // Ensure we use a mode that allows handles to be rendered if we are transitioning to/from a smooth state
                    interpolatedPoint.mode = (start.mode !== 'hard' && target.mode === 'hard') ? start.mode : target.mode;

                    // Interpolate t
                    interpolatedPoint.t = start.t + (target.t - start.t) * ease;

                    // Interpolate offsets
                    interpolatedPoint.offsetParallel = start.offsetParallel + (target.offsetParallel - start.offsetParallel) * ease;
                    interpolatedPoint.offsetPerpendicular = start.offsetPerpendicular + (target.offsetPerpendicular - start.offsetPerpendicular) * ease;

                    // Interpolate handles (using handleEase)
                    interpolatedPoint.handleIn = {
                        parallel: start.handleIn.parallel + (target.handleIn.parallel - start.handleIn.parallel) * handleEase,
                        perpendicular: start.handleIn.perpendicular + (target.handleIn.perpendicular - start.handleIn.perpendicular) * handleEase
                    };
                    interpolatedPoint.handleOut = {
                        parallel: start.handleOut.parallel + (target.handleOut.parallel - start.handleOut.parallel) * handleEase,
                        perpendicular: start.handleOut.perpendicular + (target.handleOut.perpendicular - start.handleOut.perpendicular) * handleEase
                    };

                    // Handle Scale Animation (Appear/Disappear)
                    // If target is neutral (disappearing), scale 1 -> 0
                    // If start is neutral (appearing), scale 0 -> 1
                    // If both real, scale 1
                    let scale = 1;
                    const isStartNeutral = start.offsetParallel === 0 && start.offsetPerpendicular === 0 && start.handleIn.parallel === 0; // Heuristic
                    const isTargetNeutral = target.offsetParallel === 0 && target.offsetPerpendicular === 0 && target.handleIn.parallel === 0; // Heuristic

                    // Better check: check if it was marked as disappearing/appearing in setup
                    // We can infer from the animation setup logic:
                    // Disappearing: target was created as neutral from start point
                    // Appearing: start was created as neutral from target point

                    // Let's use the fact that we created 'neutral' objects in the setup phase.
                    // But we don't have that flag here.
                    // Let's check existence in original lists.
                    const existsInStart = startPoints[segmentId]?.some(p => p.id === start.id);
                    const existsInTarget = targetPoints[segmentId]?.some(p => p.id === target.id);

                    if (existsInStart && !existsInTarget) {
                        // Disappearing
                        scale = 1 - ease;
                    } else if (!existsInStart && existsInTarget) {
                        // Appearing
                        scale = ease;
                    }
                    interpolatedPoint._scale = scale;

                    nextBodyPoints[segmentId].push(interpolatedPoint);
                });

                nextState.bodyControlPoints = nextBodyPoints;
            } else {
                nextState.bodyControlPoints = startPoints;
            }

            // 3. Handle Image Transition
            const startImg = startState.imageData;
            const targetImg = targetState.imageData;
            const imageChanging = startImg !== targetImg;

            if (imageChanging) {
                // Different Image: Switch everything immediately to let ImageOverlayManager handle cross-fade
                nextState.imageData = targetImg;
                nextState.imageOpacity = targetState.imageOpacity;
                nextState.imageFrame = targetState.imageFrame;
                nextState.imageRotation = targetState.imageRotation;
                nextState.imageFlipped = targetState.imageFlipped;
                nextState.imageScale = targetState.imageScale;
            } else {
                // Same Image: Interpolate values for smooth slide/zoom
                nextState.imageOpacity = startState.imageOpacity + (targetState.imageOpacity - startState.imageOpacity) * ease;

                // Interpolate Frame
                if (startState.imageFrame && targetState.imageFrame) {
                    nextState.imageFrame = {
                        x: startState.imageFrame.x + (targetState.imageFrame.x - startState.imageFrame.x) * ease,
                        y: startState.imageFrame.y + (targetState.imageFrame.y - startState.imageFrame.y) * ease,
                        width: startState.imageFrame.width + (targetState.imageFrame.width - startState.imageFrame.width) * ease,
                        height: startState.imageFrame.height + (targetState.imageFrame.height - startState.imageFrame.height) * ease
                    };
                }
            }

            // 4. For other non-numeric types, keep start value until the very end
            // We exclude image props we handled above
            const handledProps = ['bodyControlPoints', 'imageOpacity', 'imageData', 'imageFrame', 'imageRotation', 'imageFlipped', 'imageScale'];
            Object.keys(targetState).forEach(key => {
                if (!numericKeys.includes(key) && !handledProps.includes(key)) {
                    nextState[key] = startState[key];
                }
            });

            this.stateManager.replaceState(nextState, { isAnimating: true });

            if (progress < 1) {
                this.animationFrameId = requestAnimationFrame(animate);
            } else {
                this.animationFrameId = null;
                // Ensure final state is exactly targetState
                this.stateManager.replaceState(targetState);
            }
        };

        this.animationFrameId = requestAnimationFrame(animate);
    }

    saveProfile() {
        const profile = this.profiles[this.activeProfileIndex];
        const processedState = this.roundValues(profile.data);
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(processedState, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", `${profile.name.replace(/\s+/g, '-').toLowerCase()}.json`);
        document.body.appendChild(downloadAnchorNode);
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    async loadProfile(file) {
        if (!file) return;

        try {
            const data = await this.#readProfileFile(file);

            // Add as new profile
            const name = file.name.replace('.json', '') || `Profile ${this.profiles.length + 1}`;
            this.addProfile(name, data);

        } catch (error) {
            console.error('Error loading profile:', error);
            alert('Failed to load profile. Please ensure the file is a valid JSON profile.');
        }
    }

    deleteProfile(index) {
        if (this.profiles.length <= 1) {
            // If only one profile, reset it instead of deleting
            if (confirm('Cannot delete the last profile. Do you want to reset it to default?')) {
                // Reset logic here (would need default state from somewhere, or just reload)
                window.location.reload();
            }
            return;
        }

        if (confirm(`Are you sure you want to delete ${this.profiles[index].name}?`)) {
            this.profiles.splice(index, 1);
            if (this.activeProfileIndex >= this.profiles.length) {
                this.activeProfileIndex = this.profiles.length - 1;
            }
            this.setActiveProfile(this.activeProfileIndex);
            this.#emitProfileCountChange();
        }
    }

    roundValues(obj) {
        if (typeof obj === 'number') {
            return Math.round(obj * 100) / 100;
        }
        if (Array.isArray(obj)) {
            return obj.map(item => this.roundValues(item));
        }
        if (obj && typeof obj === 'object') {
            const newObj = {};
            for (const key in obj) {
                newObj[key] = this.roundValues(obj[key]);
            }
            return newObj;
        }
        return obj;
    }

    #stripImageState(state) {
        state.imageData = null;
        state.imageFrame = { x: 0, y: 0, width: 0, height: 0 };
        state.imageOpacity = 50;
        state.imageRotation = 0;
        state.imageFlipped = false;
        state.imageScale = 100;
        return state;
    }

    resetCanvas() {
        const resetState = this.roundValues(this.defaultState);
        this.stateManager.replaceState(resetState);
    }

    duplicateProfile(index) {
        if (this.profiles.length >= this.maxProfiles) return;
        const source = this.profiles[index];
        if (!source) return;
        const copy = {
            name: `${source.name} Copy`,
            data: this.roundValues(source.data)
        };
        this.profiles.splice(index + 1, 0, copy);
        this.setActiveProfile(index + 1);
        this.#emitProfileCountChange();
    }

    overwriteActiveProfile(data) {
        if (!this.profiles[this.activeProfileIndex] || !data) return;
        const snapshot = this.roundValues(data);
        this.profiles[this.activeProfileIndex].data = snapshot;
        this.stateManager.replaceState(snapshot);
        this.render();
    }

    async overwriteProfileFromFile(file) {
        if (!file) return;
        try {
            const data = await this.#readProfileFile(file);
            this.overwriteActiveProfile(data);
        } catch (error) {
            console.error('Error overwriting profile:', error);
            alert('Failed to overwrite profile. Please ensure the file is a valid JSON profile.');
        }
    }

    renameProfile(index) {
        if (index < 0 || index >= this.profiles.length) return;
        const profile = this.profiles[index];
        const newName = prompt('Enter new profile name:', profile.name);
        if (newName && newName.trim() !== '') {
            this.profiles[index].name = newName.trim();
            if (typeof this.saveProfiles === 'function') {
                this.saveProfiles();
            }
            // Force a slight delay to ensure the prompt closing doesn't interfere with rendering
            requestAnimationFrame(() => {
                this.render();
                // Trigger a redraw so dimension values refresh after DOM rebuild
                if (this.stateManager && typeof this.stateManager.notify === 'function') {
                    this.stateManager.notify({ reason: 'profile-rename' });
                }
            });
        }
    }

    render() {
        if (!this.container) return;
        this.container.innerHTML = '';

        this.profiles.forEach((profile, index) => {
            const isActive = index === this.activeProfileIndex;
            const bar = document.createElement('div');
            bar.className = `profile-bar ${isActive ? 'active' : ''}`;

            if (isActive) {
                // Render full active bar
                bar.innerHTML = `
                    <div class="dimension-top-row">
                        <div class="profile-name">${profile.name}</div>
                        <div class="dimension-item">
                            <span class="dim-label">Length</span>
                            <span class="dim-value" id="dimLengthVal-${index}">----</span>
                        </div>
                        <div class="dimension-item">
                            <span class="dim-label">Height</span>
                            <span class="dim-value" id="dimHeightVal-${index}">----</span>
                        </div>
                    </div>
                    <div class="profile-options">
                        <div class="profile-option" data-action="rename">Rename</div>
                        <div class="profile-option" data-action="duplicate">Duplicate</div>
                        <div class="profile-option danger" data-action="delete">Delete</div>
                    </div>
                `;

                // Attach event listeners for options
                const deleteBtn = bar.querySelector('[data-action="delete"]');
                const duplicateBtn = bar.querySelector('[data-action="duplicate"]');
                const renameBtn = bar.querySelector('[data-action="rename"]');

                if (duplicateBtn) {
                    duplicateBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.duplicateProfile(index);
                    });
                }
                if (renameBtn) {
                    renameBtn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.renameProfile(index);
                    });
                }
                if (deleteBtn) deleteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.deleteProfile(index); });

            } else {
                // Render simple inactive pill
                bar.innerHTML = `<div class="profile-name">${profile.name}</div>`;
                bar.addEventListener('click', () => this.setActiveProfile(index));
            }

            this.container.appendChild(bar);
        });

        this.updateDimensionsDisplay();
        this.centerActiveProfile();
    }

    updateDimensionsDisplay() {
        // Only update the active profile's display
        const profile = this.profiles[this.activeProfileIndex];
        if (!profile) return;

        // Update IDs to match what ChassisRenderer expects
        const activeLengthEl = document.getElementById(`dimLengthVal-${this.activeProfileIndex}`);
        const activeHeightEl = document.getElementById(`dimHeightVal-${this.activeProfileIndex}`);

        if (activeLengthEl) activeLengthEl.id = 'dimLengthVal';
        if (activeHeightEl) activeHeightEl.id = 'dimHeightVal';

        // DO NOT call notify() here, it causes an infinite loop with the subscriber
    }

    centerActiveProfile() {
        // Defer centering by one frame so layout (including newly expanded active tab) has settled
        if (!this.container) return;
        if (this.centerRaf) cancelAnimationFrame(this.centerRaf);

        this.centerRaf = requestAnimationFrame(() => {
            this.centerRaf = null;

            const bars = Array.from(this.container.children);
            if (bars.length === 0) return;

            const activeBar = bars[this.activeProfileIndex];
            if (!activeBar) return;

            const containerWidth = this.container.offsetWidth;
            if (containerWidth === 0) return;
            const activeCenter = activeBar.offsetLeft + activeBar.offsetWidth / 2;
            const containerCenter = containerWidth / 2;
            const delta = containerCenter - activeCenter;

            this.container.style.transform = `translateX(-50%) translateX(${Math.round(delta)}px)`;
        });
    }

    getProfileCount() {
        return this.profiles.length;
    }

    onProfileCountChange(listener) {
        if (typeof listener !== 'function') {
            return () => { };
        }
        this.profileCountListeners.add(listener);
        listener(this.profiles.length);
        return () => this.profileCountListeners.delete(listener);
    }

    #emitProfileCountChange() {
        this.profileCountListeners.forEach((listener) => listener(this.profiles.length));
    }

    async #readProfileFile(file) {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data || typeof data !== 'object') {
            throw new Error('Invalid profile data');
        }
        return data;
    }
}
