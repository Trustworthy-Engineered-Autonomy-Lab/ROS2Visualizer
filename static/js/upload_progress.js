/**
 * Upload Progress Tracker with ETA
 * 
 * Provides a professional upload experience with real-time progress tracking, 
 * estimated time remaining, and upload speed information.
 * 
 * Optimized for large file uploads (gigabyte-scale) in the ROS2 Humble flight data visualizer.
 * 
 * @author TEA Labs (Trustworthy Engineered Autonomy)
 */

class UploadProgressTracker {
    constructor(options = {}) {
        // Default configuration
        this.config = {
            progressBarSelector: '#upload-progress-bar',
            progressTextSelector: '#upload-progress-text',
            speedSelector: '#upload-speed',
            etaSelector: '#upload-eta',
            fileInfoSelector: '#upload-file-info',
            uploadFormSelector: '#upload-form',
            fileInputSelector: '#file-input',
            uploadButtonSelector: '#upload-button',
            ...options
        };

        // Initialize state
        this.resetState();
        
        // Bind methods
        this.initEventListeners = this.initEventListeners.bind(this);
        this.handleFileSelect = this.handleFileSelect.bind(this);
        this.handleFormSubmit = this.handleFormSubmit.bind(this);
        this.updateProgress = this.updateProgress.bind(this);
        this.formatSize = this.formatSize.bind(this);
        this.formatTime = this.formatTime.bind(this);
        this.resetState = this.resetState.bind(this);
        
        // Initialize UI elements
        this.progressBar = document.querySelector(this.config.progressBarSelector);
        this.progressText = document.querySelector(this.config.progressTextSelector);
        this.speedText = document.querySelector(this.config.speedSelector);
        this.etaText = document.querySelector(this.config.etaSelector);
        this.fileInfoText = document.querySelector(this.config.fileInfoSelector);
        this.uploadForm = document.querySelector(this.config.uploadFormSelector);
        this.fileInput = document.querySelector(this.config.fileInputSelector);
        this.uploadButton = document.querySelector(this.config.uploadButtonSelector);
        
        // Initialize event listeners
        this.initEventListeners();
    }
    
    resetState() {
        // Reset tracking variables
        this.uploadStartTime = 0;
        this.lastUpdateTime = 0;
        this.lastLoadedBytes = 0;
        this.uploadSpeed = 0;
        this.eta = 0;
        this.totalFiles = 0;
        this.totalSize = 0;
        this.uploadedFiles = 0;
        this.activeUploads = 0;
        this.uploadQueue = [];
    }
    
    initEventListeners() {
        // Listen for file selection changes
        if (this.fileInput) {
            this.fileInput.addEventListener('change', this.handleFileSelect);
        }
        
        // Listen for form submission
        if (this.uploadForm) {
            this.uploadForm.addEventListener('submit', this.handleFormSubmit);
        }
    }
    
    handleFileSelect(event) {
        const files = event.target.files;
        this.totalFiles = files.length;
        this.totalSize = Array.from(files).reduce((total, file) => total + file.size, 0);
        
        // Update file info display
        if (this.fileInfoText) {
            this.fileInfoText.textContent = `${this.totalFiles} file(s) selected (${this.formatSize(this.totalSize)})`;
        }
        
        // Enable upload button if files selected
        if (this.uploadButton) {
            this.uploadButton.disabled = files.length === 0;
        }
    }
    
    handleFormSubmit(event) {
        event.preventDefault();
        
        // Reset progress UI
        this.resetProgressUI();
        
        // Show progress container
        const progressContainer = document.querySelector('#progress-container');
        if (progressContainer) {
            progressContainer.style.display = 'block';
        }
        
        // Get form data
        const formData = new FormData(this.uploadForm);
        
        // Create and configure XMLHttpRequest
        const xhr = new XMLHttpRequest();
        
        // Set up progress tracking
        xhr.upload.addEventListener('progress', this.updateProgress);
        
        // Set up completion handler
        xhr.addEventListener('load', () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                // Success
                this.updateProgressUI(100, 'Upload complete');
                
                // Parse response and update UI
                try {
                    const response = JSON.parse(xhr.responseText);
                    this.handleUploadSuccess(response);
                } catch (error) {
                    console.error('Error parsing response', error);
                    this.showError('Error processing server response');
                }
            } else {
                // Error
                this.showError(`Upload failed: ${xhr.statusText}`);
            }
        });
        
        // Error handler
        xhr.addEventListener('error', () => {
            this.showError('Network error occurred during upload');
        });
        
        // Abort handler
        xhr.addEventListener('abort', () => {
            this.showError('Upload was aborted');
        });
        
        // Record start time
        this.uploadStartTime = Date.now();
        this.lastUpdateTime = this.uploadStartTime;
        
        // Start the upload
        xhr.open('POST', this.uploadForm.action);
        xhr.send(formData);
    }
    
    updateProgress(event) {
        if (!event.lengthComputable) return;
        
        const currentTime = Date.now();
        const timeElapsed = (currentTime - this.uploadStartTime) / 1000; // in seconds
        const loaded = event.loaded;
        const total = event.total;
        const percentComplete = Math.round((loaded / total) * 100);
        
        // Calculate upload speed (bytes per second)
        const timeIncrement = (currentTime - this.lastUpdateTime) / 1000; // in seconds
        if (timeIncrement > 0) {
            const loadedIncrement = loaded - this.lastLoadedBytes;
            this.uploadSpeed = loadedIncrement / timeIncrement; // bytes per second
            
            // Smooth the speed calculation with a simple moving average
            this.uploadSpeed = 0.7 * this.uploadSpeed + 0.3 * this.lastSpeed;
            this.lastSpeed = this.uploadSpeed;
        }
        
        // Calculate ETA (in seconds)
        const remainingBytes = total - loaded;
        this.eta = this.uploadSpeed > 0 ? remainingBytes / this.uploadSpeed : 0;
        
        // Update the UI
        this.updateProgressUI(percentComplete, 
                             `Uploading: ${this.formatSize(loaded)} of ${this.formatSize(total)}`);
        
        // Update speed and ETA display
        if (this.speedText) {
            this.speedText.textContent = `${this.formatSize(this.uploadSpeed)}/s`;
        }
        
        if (this.etaText) {
            this.etaText.textContent = `ETA: ${this.formatTime(this.eta)}`;
        }
        
        // Update last values for next calculation
        this.lastUpdateTime = currentTime;
        this.lastLoadedBytes = loaded;
    }
    
    updateProgressUI(percentage, text) {
        // Update progress bar
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
            this.progressBar.setAttribute('aria-valuenow', percentage);
        }
        
        // Update progress text
        if (this.progressText) {
            this.progressText.textContent = text;
        }
    }
    
    resetProgressUI() {
        this.updateProgressUI(0, 'Preparing upload...');
        
        if (this.speedText) {
            this.speedText.textContent = '--';
        }
        
        if (this.etaText) {
            this.etaText.textContent = 'ETA: --';
        }
        
        // Reset state
        this.lastSpeed = 0;
    }
    
    handleUploadSuccess(response) {
        // Handle response from server
        if (response.files) {
            // Display analysis results
            const analysisContainer = document.querySelector('#analysis-container');
            if (analysisContainer) {
                analysisContainer.style.display = 'block';
            }
            
            // Trigger analysis display update
            if (typeof updateAnalysisSummary === 'function') {
                window.setTimeout(() => {
                    updateAnalysisSummary();
                    updateFileList();
                }, 500);
            }
        }
    }
    
    showError(message) {
        // Display error in UI
        const errorContainer = document.querySelector('#error-container');
        const errorMessage = document.querySelector('#error-message');
        
        if (errorContainer && errorMessage) {
            errorMessage.textContent = message;
            errorContainer.style.display = 'block';
            
            // Auto-hide after 10 seconds
            window.setTimeout(() => {
                errorContainer.style.display = 'none';
            }, 10000);
        }
        
        console.error(message);
    }
    
    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
    }
    
    formatTime(seconds) {
        if (!isFinite(seconds) || seconds <= 0) {
            return '--';
        }
        
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }
}

// Initialize upload tracker when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Initialize for the data cleaning page
    if (document.querySelector('#upload-form')) {
        window.uploadTracker = new UploadProgressTracker({
            progressBarSelector: '#upload-progress-bar',
            progressTextSelector: '#upload-progress-text',
            speedSelector: '#upload-speed',
            etaSelector: '#upload-eta',
            fileInfoSelector: '#upload-file-info',
            uploadFormSelector: '#upload-form',
            fileInputSelector: '#file-input',
            uploadButtonSelector: '#upload-button'
        });
    }
});