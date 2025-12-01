export class ProfileManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
        this.profiles = [];
        this.activeProfileIndex = 0;
        this.container = document.getElementById('profileBarContainer');

        // Initialize with a default profile
        this.addProfile('Profile 1', this.stateManager.getState(), true);

        // Subscribe to state changes to update the active profile's data
        this.stateManager.subscribe((state) => {
            if (this.profiles[this.activeProfileIndex]) {
                this.profiles[this.activeProfileIndex].data = { ...state };
                this.updateDimensionsDisplay();
            }
        });

        this.render();
    }

    addProfile(name, data, silent = false) {
        const profile = {
            name: name || `Profile ${this.profiles.length + 1}`,
            data: data ? this.roundValues(data) : this.roundValues(this.stateManager.getState())
        };
        this.profiles.push(profile);
        if (!silent) {
            this.setActiveProfile(this.profiles.length - 1);
        }
        this.render();
    }

    setActiveProfile(index) {
        if (index < 0 || index >= this.profiles.length) return;
        this.activeProfileIndex = index;
        const profile = this.profiles[index];

        // Render first to create the DOM elements
        this.render();

        // Then update state, which triggers notify -> ChassisRenderer updates the new DOM
        this.stateManager.replaceState(profile.data);
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
            const text = await file.text();
            const data = JSON.parse(text);

            if (!data || typeof data !== 'object') {
                throw new Error('Invalid profile data');
            }

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
                        <div class="profile-option" data-action="overwrite">Overwrite</div>
                        <div class="profile-option" data-action="download">Download</div>
                        <div class="profile-option danger" data-action="delete">Delete</div>
                    </div>
                `;

                // Attach event listeners for options
                const overwriteBtn = bar.querySelector('[data-action="overwrite"]');
                const downloadBtn = bar.querySelector('[data-action="download"]');
                const deleteBtn = bar.querySelector('[data-action="delete"]');

                if (overwriteBtn) overwriteBtn.addEventListener('click', (e) => { e.stopPropagation(); this.saveProfile(); }); // Overwrite acts as save for now
                if (downloadBtn) downloadBtn.addEventListener('click', (e) => { e.stopPropagation(); this.saveProfile(); });
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
        // Calculate offset to center the active element
        // The container is centered at 50% left.
        // We need to translate the container so the active element's center aligns with the container's anchor point (which is screen center).

        if (!this.container) return;

        const bars = Array.from(this.container.children);
        if (bars.length === 0) return;

        const activeBar = bars[this.activeProfileIndex];
        if (!activeBar) return;

        // Get widths and positions relative to container
        // Since we can't easily get layout before paint, we might need to wait or assume widths.
        // But we can use offsetLeft.

        const containerWidth = this.container.offsetWidth; // This might be full width of children
        const activeCenter = activeBar.offsetLeft + activeBar.offsetWidth / 2;

        // We want activeCenter to be at 0 relative to the container's transform origin?
        // Container is left: 50%, transform: translateX(-50%).
        // This puts the container's visual center at screen center IF the container's width is centered.
        // But flex container width depends on content.

        // Let's adjust translateX.
        // Default is -50%.
        // We want the active item to be at the screen center.
        // Screen Center = Container Left + Active Item Left + Active Item Width/2
        // We want Screen Center to coincide with viewport center.

        // Actually, simpler:
        // We want to shift the container such that the active item's center is at the container's anchor point.
        // Container anchor is at 50% of viewport.
        // So we want (Container Left + Active Center) = Viewport Center.
        // Container Left is determined by `left: 50%` and `transform: translateX(...)`.

        // Let T be the translation X.
        // Container Visual Left = ViewportWidth/2 + T. (Wait, transform is relative to element width usually).
        // If transform is percentage, it's % of element width.
        // If pixels, it's pixels.

        // Let's use pixel translation for precise control.
        // We want: ActiveBar.offsetLeft + ActiveBar.offsetWidth/2 + T = 0 (relative to anchor).
        // So T = -(ActiveBar.offsetLeft + ActiveBar.offsetWidth/2).

        // But we also need to account for the initial `left: 50%`.
        // The container's origin (0,0) is at 50% of the screen width.
        // So if we translate by -ActiveCenter, the ActiveCenter will be at the origin (Screen Center).

        const offset = -(activeBar.offsetLeft + activeBar.offsetWidth / 2);
        this.container.style.transform = `translateX(${offset}px)`;
    }
}
