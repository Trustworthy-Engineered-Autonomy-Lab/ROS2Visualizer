/**
 * Cloud Storage Integration JavaScript
 * Handles cloud storage authentication, file browsing, and importing
 * for the Flight Trajectory Visualizer
 */

class CloudStorageManager {
    constructor() {
        this.provider = null;
        this.authenticated = false;
        this.currentFolderId = null;
        this.breadcrumbs = [];
        this.fileList = [];
        this.selectedFiles = [];
        
        // Cloud file browser elements
        this.fileBrowserModal = document.getElementById('fileBrowserModal');
        this.fileBrowserBody = document.getElementById('fileBrowserBody');
        this.breadcrumbsContainer = document.getElementById('breadcrumbs');
        this.fileListContainer = document.getElementById('cloudFileList');
        this.selectedFilesContainer = document.getElementById('selectedFilesList');
        this.importSelectedBtn = document.getElementById('importSelectedBtn');
        
        // Initialize the manager
        this.init();
    }
    
    /**
     * Initialize the cloud storage manager
     */
    init() {
        // Check authentication status on page load
        this.checkAuthStatus();
        
        // Add event listeners
        document.getElementById('browseGoogleDrive').addEventListener('click', () => this.openFileBrowser('google'));
        document.getElementById('browseOneDrive').addEventListener('click', () => this.openFileBrowser('microsoft'));
        
        if (this.importSelectedBtn) {
            this.importSelectedBtn.addEventListener('click', () => this.importSelectedFiles());
        }
    }
    
    /**
     * Check authentication status for cloud providers
     */
    checkAuthStatus() {
        fetch('/cloud/auth/status')
            .then(response => response.json())
            .then(data => {
                if (data.google_authenticated) {
                    document.getElementById('googleDriveStatus').innerHTML = '<span class="badge bg-success">Connected</span>';
                    document.getElementById('browseGoogleDrive').disabled = false;
                } else {
                    document.getElementById('googleDriveStatus').innerHTML = '<span class="badge bg-secondary">Not Connected</span>';
                    document.getElementById('browseGoogleDrive').disabled = true;
                }
                
                if (data.microsoft_authenticated) {
                    document.getElementById('oneDriveStatus').innerHTML = '<span class="badge bg-success">Connected</span>';
                    document.getElementById('browseOneDrive').disabled = false;
                } else {
                    document.getElementById('oneDriveStatus').innerHTML = '<span class="badge bg-secondary">Not Connected</span>';
                    document.getElementById('browseOneDrive').disabled = true;
                }
            })
            .catch(error => {
                console.error('Error checking authentication status:', error);
            });
    }
    
    /**
     * Open the cloud file browser modal
     * @param {string} provider - The cloud provider ('google' or 'microsoft')
     */
    openFileBrowser(provider) {
        this.provider = provider;
        this.currentFolderId = null;
        this.breadcrumbs = [{id: null, name: 'Root'}];
        this.selectedFiles = [];
        
        // Update UI
        this.updateBreadcrumbs();
        this.updateSelectedFilesList();
        
        // Show loading state
        this.fileListContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-3">Loading files...</p></div>';
        
        // Show the modal
        const fileBrowserModal = new bootstrap.Modal(this.fileBrowserModal);
        fileBrowserModal.show();
        
        // Load files
        this.loadFiles();
    }
    
    /**
     * Load files from cloud storage
     * @param {string} folderId - Optional folder ID to list contents of
     */
    loadFiles(folderId) {
        this.currentFolderId = folderId || null;
        
        // Update URL with query parameters
        const url = `/cloud/list_files?provider=${this.provider}${folderId ? `&folder_id=${folderId}` : ''}`;
        
        fetch(url)
            .then(response => response.json())
            .then(data => {
                if (data.error) {
                    this.showError(data.error);
                    return;
                }
                
                this.fileList = data.files || [];
                this.renderFileList();
            })
            .catch(error => {
                this.showError(`Error loading files: ${error.message}`);
            });
    }
    
    /**
     * Render the file list in the UI
     */
    renderFileList() {
        if (this.fileList.length === 0) {
            this.fileListContainer.innerHTML = '<div class="text-center py-5"><p class="text-muted">No files found in this folder</p></div>';
            return;
        }
        
        // Sort files: folders first, then files
        const sortedFiles = [...this.fileList].sort((a, b) => {
            if (a.is_folder && !b.is_folder) return -1;
            if (!a.is_folder && b.is_folder) return 1;
            return a.name.localeCompare(b.name);
        });
        
        let html = '<div class="list-group">';
        
        sortedFiles.forEach(file => {
            const fileId = file.id;
            const fileName = file.name;
            const isFolder = file.is_folder;
            const fileSize = file.size ? this.formatFileSize(file.size) : '';
            const isSelected = this.selectedFiles.some(f => f.id === fileId);
            
            html += `
                <div class="list-group-item list-group-item-action d-flex justify-content-between align-items-center ${isSelected ? 'active' : ''}">
                    <div class="d-flex align-items-center">
                        <i class="fas ${isFolder ? 'fa-folder text-warning' : 'fa-file text-info'} me-3"></i>
                        <span>${fileName}</span>
                    </div>
                    <div class="d-flex align-items-center">
                        ${fileSize ? `<span class="badge bg-secondary me-2">${fileSize}</span>` : ''}
                        ${isFolder ? 
                            `<button class="btn btn-sm btn-outline-info" onclick="cloudManager.navigateToFolder('${fileId}', '${fileName}')">
                                <i class="fas fa-folder-open"></i>
                            </button>` : 
                            `<button class="btn btn-sm ${isSelected ? 'btn-danger' : 'btn-outline-primary'}" onclick="cloudManager.toggleFileSelection('${fileId}', '${fileName}', ${isFolder}, '${file.mime_type || ''}')">
                                <i class="fas ${isSelected ? 'fa-times' : 'fa-plus'}"></i>
                            </button>`
                        }
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        this.fileListContainer.innerHTML = html;
    }
    
    /**
     * Navigate to a folder
     * @param {string} folderId - The folder ID to navigate to
     * @param {string} folderName - The folder name
     */
    navigateToFolder(folderId, folderName) {
        // Add to breadcrumbs
        this.breadcrumbs.push({id: folderId, name: folderName});
        this.updateBreadcrumbs();
        
        // Show loading state
        this.fileListContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-3">Loading files...</p></div>';
        
        // Load files in the folder
        this.loadFiles(folderId);
    }
    
    /**
     * Navigate to a breadcrumb
     * @param {number} index - The breadcrumb index to navigate to
     */
    navigateToBreadcrumb(index) {
        // Truncate breadcrumbs array to the selected index + 1
        this.breadcrumbs = this.breadcrumbs.slice(0, index + 1);
        this.updateBreadcrumbs();
        
        // Show loading state
        this.fileListContainer.innerHTML = '<div class="text-center py-5"><div class="spinner-border text-primary" role="status"></div><p class="mt-3">Loading files...</p></div>';
        
        // Load files for the selected breadcrumb
        const folderId = this.breadcrumbs[index].id;
        this.loadFiles(folderId);
    }
    
    /**
     * Update breadcrumbs in the UI
     */
    updateBreadcrumbs() {
        let html = '';
        
        this.breadcrumbs.forEach((crumb, index) => {
            if (index === this.breadcrumbs.length - 1) {
                // Current folder (last breadcrumb)
                html += `<li class="breadcrumb-item active">${crumb.name}</li>`;
            } else {
                // Parent folder (clickable)
                html += `<li class="breadcrumb-item"><a href="#" onclick="cloudManager.navigateToBreadcrumb(${index})">${crumb.name}</a></li>`;
            }
        });
        
        this.breadcrumbsContainer.innerHTML = html;
    }
    
    /**
     * Toggle file selection
     * @param {string} fileId - The file ID
     * @param {string} fileName - The file name
     * @param {boolean} isFolder - Whether the item is a folder
     * @param {string} mimeType - The file mime type
     */
    toggleFileSelection(fileId, fileName, isFolder, mimeType) {
        if (isFolder) {
            return; // Don't allow selecting folders
        }
        
        // Check if file is already selected
        const existingIndex = this.selectedFiles.findIndex(f => f.id === fileId);
        
        if (existingIndex >= 0) {
            // Remove from selection
            this.selectedFiles.splice(existingIndex, 1);
        } else {
            // Add to selection
            this.selectedFiles.push({
                id: fileId,
                name: fileName,
                provider: this.provider,
                mime_type: mimeType
            });
        }
        
        // Update UI
        this.renderFileList();
        this.updateSelectedFilesList();
    }
    
    /**
     * Update selected files list in UI
     */
    updateSelectedFilesList() {
        if (this.selectedFiles.length === 0) {
            this.selectedFilesContainer.innerHTML = '<p class="text-muted">No files selected</p>';
            this.importSelectedBtn.disabled = true;
            return;
        }
        
        let html = '<ul class="list-group">';
        
        this.selectedFiles.forEach(file => {
            html += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <span>${file.name}</span>
                    <button class="btn btn-sm btn-outline-danger" onclick="cloudManager.toggleFileSelection('${file.id}', '${file.name}', false, '${file.mime_type || ''}')">
                        <i class="fas fa-times"></i>
                    </button>
                </li>
            `;
        });
        
        html += '</ul>';
        this.selectedFilesContainer.innerHTML = html;
        this.importSelectedBtn.disabled = false;
    }
    
    /**
     * Import selected files
     */
    importSelectedFiles() {
        if (this.selectedFiles.length === 0) {
            return;
        }
        
        // Show loading state
        this.importSelectedBtn.disabled = true;
        this.importSelectedBtn.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Importing...';
        
        // Prepare data for import
        const importData = {
            provider: this.provider,
            files: this.selectedFiles.map(file => ({
                id: file.id,
                name: file.name
            }))
        };
        
        // Call the API to download and process files
        fetch('/cloud/download_file', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(importData)
        })
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                this.showError(data.error);
                return;
            }
            
            // Close modal
            const fileBrowserModal = bootstrap.Modal.getInstance(this.fileBrowserModal);
            fileBrowserModal.hide();
            
            // Show success message
            this.showSuccess(`Successfully imported ${this.selectedFiles.length} file(s) from ${this.provider === 'google' ? 'Google Drive' : 'OneDrive'}.`);
            
            // Refresh the trajectory data in the main application
            if (typeof refreshTrajectories === 'function') {
                refreshTrajectories(data.processed_data);
            }
        })
        .catch(error => {
            this.showError(`Error importing files: ${error.message}`);
        })
        .finally(() => {
            // Reset button state
            this.importSelectedBtn.disabled = false;
            this.importSelectedBtn.innerHTML = 'Import Selected Files';
        });
    }
    
    /**
     * Show error message
     * @param {string} message - The error message
     */
    showError(message) {
        const alertEl = document.createElement('div');
        alertEl.className = 'alert alert-danger alert-dismissible fade show';
        alertEl.role = 'alert';
        alertEl.innerHTML = `
            <strong>Error:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.querySelector('.app-container').prepend(alertEl);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alertEl);
            bsAlert.close();
        }, 5000);
    }
    
    /**
     * Show success message
     * @param {string} message - The success message
     */
    showSuccess(message) {
        const alertEl = document.createElement('div');
        alertEl.className = 'alert alert-success alert-dismissible fade show';
        alertEl.role = 'alert';
        alertEl.innerHTML = `
            <strong>Success:</strong> ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        document.querySelector('.app-container').prepend(alertEl);
        
        // Auto-dismiss after 5 seconds
        setTimeout(() => {
            const bsAlert = new bootstrap.Alert(alertEl);
            bsAlert.close();
        }, 5000);
    }
    
    /**
     * Format file size for display
     * @param {number} bytes - The file size in bytes
     * @returns {string} - Formatted file size
     */
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

// Initialize the cloud storage manager when the DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    // Check if we're on a page with cloud storage functionality
    if (document.getElementById('browseGoogleDrive') || document.getElementById('fileBrowserModal')) {
        window.cloudManager = new CloudStorageManager();
    }
    
    // Check for the simplified cloud folder link interface
    initSimplifiedCloudInterface();
});

// Initialize the simplified cloud folder link interface
function initSimplifiedCloudInterface() {
    const processCloudLinkBtn = document.getElementById('process-cloud-link-btn');
    if (processCloudLinkBtn) {
        console.log('Found process-cloud-link-btn, adding event listener');
        processCloudLinkBtn.addEventListener('click', function() {
            processCloudFolderLink();
        });
    } else {
        console.log('Could not find process-cloud-link-btn');
        // Try again after a short delay
        setTimeout(initSimplifiedCloudInterface, 1000);
    }
}

/**
 * Add cloud storage integration to the main index page
 */
function initCloudIntegration() {
    // Add cloud storage modal to the page
    const modalHTML = `
        <div class="modal fade" id="fileBrowserModal" tabindex="-1" aria-labelledby="fileBrowserModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-lg modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title" id="fileBrowserModalLabel">
                            Browse ${this.provider === 'google' ? 'Google Drive' : 'OneDrive'}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body" id="fileBrowserBody">
                        <nav aria-label="breadcrumb">
                            <ol class="breadcrumb" id="breadcrumbs"></ol>
                        </nav>
                        
                        <div id="cloudFileList" class="mb-4"></div>
                        
                        <div class="selected-files">
                            <h6>Selected Files</h6>
                            <div id="selectedFilesList"></div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                        <button type="button" class="btn btn-primary" id="importSelectedBtn" disabled>Import Selected Files</button>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    // Add the modal to the page if it doesn't exist
    if (!document.getElementById('fileBrowserModal')) {
        document.body.insertAdjacentHTML('beforeend', modalHTML);
    }
    
    // Add cloud storage status section to the sidebar
    const cloudStatusHTML = `
        <div class="control-panel mb-4">
            <h5 class="border-bottom pb-2"><i class="fas fa-cloud me-2"></i>Cloud Storage</h5>
            <div class="mb-2">
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span>Google Drive:</span>
                    <span id="googleDriveStatus"><span class="badge bg-secondary">Not Connected</span></span>
                </div>
                <button id="browseGoogleDrive" class="btn btn-sm btn-outline-primary w-100" disabled>
                    <i class="fas fa-folder-open me-2"></i>Browse Google Drive
                </button>
            </div>
            <div>
                <div class="d-flex justify-content-between align-items-center mb-2">
                    <span>OneDrive:</span>
                    <span id="oneDriveStatus"><span class="badge bg-secondary">Not Connected</span></span>
                </div>
                <button id="browseOneDrive" class="btn btn-sm btn-outline-primary w-100" disabled>
                    <i class="fas fa-folder-open me-2"></i>Browse OneDrive
                </button>
            </div>
        </div>
    `;
    
    // Add cloud storage status after the file upload section
    const fileUploadSection = document.querySelector('.control-panel:nth-of-type(1)');
    if (fileUploadSection && !document.getElementById('googleDriveStatus')) {
        fileUploadSection.insertAdjacentHTML('afterend', cloudStatusHTML);
    }
    
    // Initialize the cloud storage manager
    if (typeof window.cloudManager === 'undefined') {
        window.cloudManager = new CloudStorageManager();
    }
}

/**
 * Process a cloud file or folder link for direct import of CSV files
 */
function processCloudFolderLink() {
    const provider = document.getElementById('cloud-provider').value;
    const cloudLink = document.getElementById('cloud-folder-link').value.trim();
    
    if (!cloudLink) {
        showMessage('Please enter a cloud file or folder link', 'danger');
        return;
    }
    
    // Show loading indicator
    const button = document.getElementById('process-cloud-link-btn');
    const originalText = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> Processing...';
    
    // Call the API to process the cloud link
    fetch('/process_cloud_folder', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            provider: provider,
            folder_link: cloudLink
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.error) {
            showMessage(data.error, 'danger');
            return;
        }
        
        // Determine if this is a file or folder and what cloud provider
        const resourceType = data.is_file ? 'file' : 'folder';
        const providerName = provider === 'google' ? 'Google Drive' : 
                           (cloudLink.includes('sharepoint.com') ? 'SharePoint' : 'OneDrive');
                           
        // Log processing information for debugging
        console.log(`Processing ${providerName} ${resourceType}:`, data);
        
        // Display processing steps in a modal before showing results
        showProcessingDetails(data, providerName, resourceType);
        
        // Show success message
        showMessage(
            `Successfully processed ${providerName} ${resourceType}.`, 
            'success'
        );
        
        // Update the trajectory visualization with the new data
        if (typeof refreshTrajectories === 'function') {
            refreshTrajectories(data.processed_data);
        }
    })
    .catch(error => {
        showMessage(`Error processing cloud link: ${error.message}`, 'danger');
    })
    .finally(() => {
        // Reset button state
        button.disabled = false;
        button.innerHTML = originalText;
    });
}

/**
 * Display processing details in a modal
 * @param {Object} data - The response data from the server
 * @param {string} providerName - The name of the cloud provider
 * @param {string} resourceType - Whether it's a file or folder
 */
function showProcessingDetails(data, providerName, resourceType) {
    // Create modal element
    const modalId = 'processingDetailsModal';
    let modal = document.getElementById(modalId);
    
    // If modal doesn't exist, create it
    if (!modal) {
        modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'modal fade';
        modal.tabIndex = -1;
        modal.setAttribute('aria-labelledby', `${modalId}Label`);
        modal.setAttribute('aria-hidden', 'true');
        
        document.body.appendChild(modal);
    }
    
    // Set modal content based on processing details
    const steps = data.processing_details?.steps || [];
    const fileCount = data.is_file ? 1 : (data.processing_details?.folder_info?.total_files || 'multiple');
    
    let stepsHtml = '';
    steps.forEach(step => {
        stepsHtml += `
            <div class="d-flex justify-content-between align-items-center mb-2">
                <div>
                    <i class="fas fa-check-circle text-success me-2"></i>
                    ${step.name}
                </div>
                <span class="badge bg-light text-dark">${step.time}</span>
            </div>
        `;
    });
    
    // List of files being processed
    let filesHtml = '';
    if (data.processed_data && Array.isArray(data.processed_data)) {
        filesHtml = '<div class="mt-3 border-top pt-3"><h6>Files Processed:</h6><ul class="list-group">';
        
        data.processed_data.forEach(file => {
            const pointCount = file.points ? file.points.length : 'Unknown';
            const fileSize = file.file_size || 'Unknown size';
            
            filesHtml += `
                <li class="list-group-item d-flex justify-content-between align-items-center">
                    <div>
                        <i class="fas fa-file-csv text-info me-2"></i>
                        ${file.filename}
                    </div>
                    <div>
                        <span class="badge bg-secondary me-2">${fileSize}</span>
                        <span class="badge bg-primary">${pointCount} points</span>
                    </div>
                </li>
            `;
        });
        
        filesHtml += '</ul></div>';
    }
    
    // Set modal HTML
    modal.innerHTML = `
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <h5 class="modal-title" id="${modalId}Label">
                        <i class="fas fa-cloud-download-alt me-2"></i>
                        Processing ${providerName} ${resourceType}
                    </h5>
                    <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
                </div>
                <div class="modal-body">
                    <p>Successfully processed ${fileCount} file(s) from ${providerName}.</p>
                    
                    <div class="processing-steps mb-3">
                        <h6>Processing Steps:</h6>
                        ${stepsHtml}
                    </div>
                    
                    ${filesHtml}
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-primary" data-bs-dismiss="modal">Continue to Visualization</button>
                </div>
            </div>
        </div>
    `;
    
    // Initialize and show modal
    const modalInstance = new bootstrap.Modal(modal);
    modalInstance.show();
    
    // Auto-dismiss after a delay (optional)
    setTimeout(() => {
        modalInstance.hide();
    }, 5000);
}

/**
 * Show a message to the user
 * @param {string} message - The message to display
 * @param {string} type - The message type (success, info, warning, danger)
 */
function showMessage(message, type = 'info') {
    const alertEl = document.createElement('div');
    alertEl.className = `alert alert-${type} alert-dismissible fade show`;
    alertEl.role = 'alert';
    alertEl.innerHTML = `
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
    `;
    
    document.querySelector('.app-container').prepend(alertEl);
    
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
        const bsAlert = new bootstrap.Alert(alertEl);
        bsAlert.close();
    }, 5000);
}

// When the main application script is loaded, initialize cloud integration
if (typeof window.addEventListener === 'function') {
    window.addEventListener('load', initCloudIntegration);
}