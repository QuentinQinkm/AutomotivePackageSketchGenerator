export class ProfileManager {
    constructor(stateManager) {
        this.stateManager = stateManager;
    }

    saveProfile() {
        const state = this.stateManager.getState();
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state, null, 2));
        const downloadAnchorNode = document.createElement('a');
        downloadAnchorNode.setAttribute("href", dataStr);
        downloadAnchorNode.setAttribute("download", "car-profile.json");
        document.body.appendChild(downloadAnchorNode); // required for firefox
        downloadAnchorNode.click();
        downloadAnchorNode.remove();
    }

    async loadProfile(file) {
        if (!file) return;

        try {
            const text = await file.text();
            const data = JSON.parse(text);

            // Basic validation: check if it has some key properties
            if (!data || typeof data !== 'object') {
                throw new Error('Invalid profile data');
            }

            // We can add more specific validation here if needed, 
            // e.g. checking for 'wheelBase' or 'bodyControlPoints'

            this.stateManager.setState(data);
            console.log('Profile loaded successfully');
        } catch (error) {
            console.error('Error loading profile:', error);
            alert('Failed to load profile. Please ensure the file is a valid JSON profile.');
        }
    }
}
