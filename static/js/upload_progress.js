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
        // Configuration
        this.options = {
            formSelector: options.formSelector || '#upload-form',
            fileInputSelector: options.fileInputSelector || '#file-input',
            progressContainerSelector: options.progressContainerSelector || '#upload-progress-container',
            progressBarSelector: options.progressBarSelector || '#upload-progress-bar',
            progressTextSelector: options.progressTextSelector || '#upload-progress-text',
            statsContainerSelector: options.statsContainerSelector || '#upload-stats',
            endpoint: options.endpoint || '/analyze_csv',
            onSuccess: options.onSuccess || null,
            onError: options.onError || null,
            onProgress: options.onProgress || null,
            maxConcurrentUploads: options.maxConcurrentUploads || 3,
            chunkSize: options.chunkSize || 5 * 1024 * 1024 // 5MB chunks
        };

        // DOM elements
        this.form = document.querySelector(this.options.formSelector);
        this.fileInput = document.querySelector(this.options.fileInputSelector);
        this.progressContainer = document.querySelector(this.options.progressContainerSelector);
        this.progressBar = document.querySelector(this.options.progressBarSelector);
        this.progressText = document.querySelector(this.options.progressTextSelector);
        this.statsContainer = document.querySelector(this.options.statsContainerSelector);

        // Internal state
        this.resetState();
        
        // Event initialization
        this.initEventListeners();
    }

    resetState() {
        this.uploadQueue = [];
        this.activeUploads = 0;
        this.uploadStart = 0;
        this.uploadedBytes = 0;
        this.totalBytes = 0;
        this.uploadSpeed = 0;
        this.estimatedTimeRemaining = 0;
        this.lastUpdate = 0;
        this.uploadResults = [];
        this.error = null;
    }

    initEventListeners() {
        if (!this.form || !this.fileInput) {
            console.error('Form or file input not found');
            return;
        }

        this.fileInput.addEventListener('change', this.handleFileSelect.bind(this));
        this.form.addEventListener('submit', this.handleFormSubmit.bind(this));
    }

    handleFileSelect(event) {
        const files = this.fileInput.files;
        this.resetState();
        
        if (files.length === 0) {
            if (this.progressContainer) {
                this.progressContainer.classList.add('d-none');
            }
            return;
        }
        
        // Calculate total file size
        for (let i = 0; i < files.length; i++) {
            this.totalBytes += files[i].size;
        }
        
        // Update UI
        if (this.progressContainer) {
            this.progressContainer.classList.remove('d-none');
        }
        
        // Enable upload button if it exists
        const uploadButton = document.getElementById('upload-button');
        if (uploadButton) {
            uploadButton.disabled = false;
        }
        
        // Show file info
        const fileInfoText = document.getElementById('upload-file-info');
        if (fileInfoText) {
            fileInfoText.textContent = `${files.length} file(s) selected. Total size: ${this.formatSize(this.totalBytes)}. Click 'Upload Files' to begin processing.`;
            fileInfoText.classList.remove('text-muted');
            fileInfoText.classList.add('text-success');
        }
        
        // Show initial stats
        this.updateProgressUI(0, 'Ready to upload');
    }

    handleFormSubmit(event) {
        event.preventDefault();
        const files = this.fileInput.files;
        
        if (files.length === 0) {
            this.showError('No files selected for upload');
            return;
        }
        
        // Reset upload state
        this.resetState();
        
        // Calculate total bytes
        for (let i = 0; i < files.length; i++) {
            this.totalBytes += files[i].size;
            this.uploadQueue.push(files[i]);
        }
        
        // Set upload start time
        this.uploadStart = Date.now();
        this.lastUpdate = this.uploadStart;
        
        // Show progress UI
        if (this.progressContainer) {
            this.progressContainer.classList.remove('d-none');
        }
        
        // Start upload process
        this.processQueue();
    }

    processQueue() {
        // If there are no more files to process and no active uploads, we're done
        if (this.uploadQueue.length === 0 && this.activeUploads === 0) {
            // Upload is complete - dispatch event
            const event = new CustomEvent('upload-complete', {
                detail: {
                    files: this.uploadResults,
                    totalTime: (Date.now() - this.uploadStart) / 1000,
                    totalBytes: this.totalBytes
                }
            });
            document.dispatchEvent(event);
            
            // Call success callback if provided
            if (typeof this.options.onSuccess === 'function') {
                this.options.onSuccess(this.uploadResults);
            }
            
            return;
        }
        
        // Start new uploads if there are files in the queue and we're under the concurrency limit
        while (this.uploadQueue.length > 0 && this.activeUploads < this.options.maxConcurrentUploads) {
            const file = this.uploadQueue.shift();
            this.uploadFile(file);
        }
    }

    uploadFile(file) {
        this.activeUploads++;
        
        // For large files, we would implement chunked uploads here
        // but for simplicity in this implementation, we're using the standard approach
        
        const formData = new FormData();
        formData.append('files[]', file);
        
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (event) => this.updateProgress(event));
        
        xhr.addEventListener('load', () => {
            this.activeUploads--;
            
            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    const response = JSON.parse(xhr.responseText);
                    this.uploadResults = response.files;
                } catch (error) {
                    this.showError('Error parsing server response');
                }
            } else {
                this.showError(`Server returned error: ${xhr.status}`);
            }
            
            // Continue processing queue
            this.processQueue();
        });
        
        xhr.addEventListener('error', () => {
            this.activeUploads--;
            this.showError('Network error occurred during upload');
            this.processQueue();
        });
        
        xhr.addEventListener('abort', () => {
            this.activeUploads--;
            this.processQueue();
        });
        
        xhr.open('POST', this.options.endpoint);
        xhr.send(formData);
    }

    updateProgress(event) {
        if (!event.lengthComputable) return;
        
        const now = Date.now();
        const timeElapsed = (now - this.lastUpdate) / 1000;
        
        if (timeElapsed > 0.5) { // Only update every 500ms for efficiency
            const newlyUploadedBytes = event.loaded - this.uploadedBytes;
            this.uploadedBytes = event.loaded;
            
            // Calculate upload speed (bytes per second)
            this.uploadSpeed = newlyUploadedBytes / timeElapsed;
            
            // Calculate remaining time
            const remainingBytes = this.totalBytes - this.uploadedBytes;
            this.estimatedTimeRemaining = remainingBytes / (this.uploadSpeed || 1);
            
            // Calculate percentage
            const percentage = Math.round((this.uploadedBytes / this.totalBytes) * 100);
            
            // Format progress text
            const text = `Uploading: ${percentage}% - ${this.formatSize(this.uploadSpeed)}/s - ETA: ${this.formatTime(this.estimatedTimeRemaining)}`;
            
            // Update UI
            this.updateProgressUI(percentage, text);
            
            // Call progress callback if provided
            if (typeof this.options.onProgress === 'function') {
                this.options.onProgress(percentage, this.uploadSpeed, this.estimatedTimeRemaining);
            }
            
            this.lastUpdate = now;
        }
    }

    updateProgressUI(percentage, text) {
        if (this.progressBar) {
            this.progressBar.style.width = `${percentage}%`;
            this.progressBar.setAttribute('aria-valuenow', percentage);
        }
        
        if (this.progressText) {
            this.progressText.textContent = text;
        }
        
        if (this.statsContainer) {
            this.statsContainer.innerHTML = `
                <div class="d-flex justify-content-between small text-muted mt-1">
                    <span>Speed: ${this.formatSize(this.uploadSpeed)}/s</span>
                    <span>ETA: ${this.formatTime(this.estimatedTimeRemaining)}</span>
                </div>
            `;
        }
    }

    resetProgressUI() {
        this.updateProgressUI(0, 'Upload completed');
        
        if (this.progressContainer) {
            setTimeout(() => {
                this.progressContainer.classList.add('d-none');
            }, 3000);
        }
    }

    handleUploadSuccess(response) {
        this.resetProgressUI();
        
        // Dispatch event with results
        const event = new CustomEvent('upload-complete', {
            detail: { files: response.files }
        });
        document.dispatchEvent(event);
        
        // Call success callback if provided
        if (typeof this.options.onSuccess === 'function') {
            this.options.onSuccess(response);
        }
    }

    showError(message) {
        this.error = message;
        
        // Dispatch error event
        const event = new CustomEvent('upload-error', {
            detail: { message }
        });
        document.dispatchEvent(event);
        
        // Call error callback if provided
        if (typeof this.options.onError === 'function') {
            this.options.onError(message);
        }
        
        console.error('Upload error:', message);
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 B';
        
        const units = ['B', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(1024));
        
        return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
    }

    formatTime(seconds) {
        if (!isFinite(seconds) || seconds < 0) {
            return 'calculating...';
        }
        
        if (seconds < 60) {
            return Math.round(seconds) + ' sec';
        } else if (seconds < 3600) {
            return Math.round(seconds / 60) + ' min';
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.round((seconds % 3600) / 60);
            return hours + ' hr ' + minutes + ' min';
        }
    }
}

// Initialize the upload tracker when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on a page that requires the upload tracker
    const uploadForm = document.querySelector('#upload-form');
    if (uploadForm) {
        window.uploadTracker = new UploadProgressTracker({
            endpoint: '/analyze_csv',
            onSuccess: function(response) {
                console.log('Upload completed successfully:', response);
            },
            onError: function(message) {
                console.error('Upload error:', message);
            },
            onProgress: function(percentage, speed, eta) {
                console.log(`Progress: ${percentage}%, Speed: ${speed} bytes/s, ETA: ${eta} seconds`);
            }
        });
    }
});