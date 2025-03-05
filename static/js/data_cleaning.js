/**
 * Flight Trajectory Data Cleaning JavaScript
 * Handles the data cleaning workflow and UI interactions
 */

document.addEventListener('DOMContentLoaded', function() {
    // State management
    const appState = {
        currentStep: 'upload',
        uploadedFiles: [],
        fileAnalysis: [],
        cleaningConfig: {},
        cleaningResults: [],
        selectedFileIndex: 0
    };

    // DOM elements
    const workflowSteps = document.querySelectorAll('#workflow-steps a');
    const sections = document.querySelectorAll('.cleaning-section');
    const uploadForm = document.getElementById('upload-form');
    const fileInput = document.getElementById('file-input');
    const fileList = document.getElementById('file-list');
    const analysisLoader = document.getElementById('analysis-loader');
    const analyzeBackBtn = document.getElementById('analyze-back-btn');
    const analyzeNextBtn = document.getElementById('analyze-next-btn');
    const cleaningConfigForm = document.getElementById('cleaning-config-form');
    const configureBackBtn = document.getElementById('configure-back-btn');
    const previewLoader = document.getElementById('preview-loader');
    const previewBackBtn = document.getElementById('preview-back-btn');
    const previewNextBtn = document.getElementById('preview-next-btn');
    const processLoader = document.getElementById('process-loader');
    const processResults = document.getElementById('process-results');
    const processBackBtn = document.getElementById('process-back-btn');
    const processNextBtn = document.getElementById('process-next-btn');

    // Initialize charts
    let distanceChart, altitudeChart;
    
    // Event listeners
    initEventListeners();

    /**
     * Initialize event listeners for interactive elements
     */
    function initEventListeners() {
        // Workflow step navigation
        workflowSteps.forEach(step => {
            step.addEventListener('click', (e) => {
                e.preventDefault();
                const stepName = step.getAttribute('data-step');
                
                // Only allow navigation to completed steps or the next step
                const currentIndex = getStepIndex(appState.currentStep);
                const targetIndex = getStepIndex(stepName);
                
                if (targetIndex <= currentIndex + 1) {
                    navigateToStep(stepName);
                }
            });
        });
        
        // File upload form
        uploadForm.addEventListener('submit', (e) => {
            e.preventDefault();
            if (fileInput.files.length > 0) {
                uploadFiles(fileInput.files);
            } else {
                showAlert('Please select at least one file to upload', 'danger');
            }
        });
        
        // Enable upload button when files are selected
        fileInput.addEventListener('change', function() {
            console.log("File input change detected");
            // Get direct reference to the button
            const uploadButton = document.getElementById('upload-button');
            if (uploadButton) {
                uploadButton.disabled = this.files.length === 0;
                console.log("Upload button disabled:", uploadButton.disabled);
            } else {
                console.error("Upload button not found");
            }
            
            // Update file info text
            const fileInfoText = document.getElementById('upload-file-info');
            if (fileInfoText) {
                if (this.files.length > 0) {
                    // Calculate total size
                    let totalSize = 0;
                    for (let i = 0; i < this.files.length; i++) {
                        totalSize += this.files[i].size;
                    }
                    // Format file size
                    const formattedSize = formatFileSize(totalSize);
                    
                    fileInfoText.textContent = `${this.files.length} file(s) selected (${formattedSize}). Click 'Upload Files' to begin processing.`;
                    fileInfoText.classList.remove('text-muted');
                    fileInfoText.classList.add('text-success');
                } else {
                    fileInfoText.textContent = 'No files selected';
                    fileInfoText.classList.remove('text-success');
                    fileInfoText.classList.add('text-muted');
                }
            }
        });
        
        // Helper function to format file size
        function formatFileSize(bytes) {
            if (bytes === 0) return '0 B';
            const units = ['B', 'KB', 'MB', 'GB', 'TB'];
            const i = Math.floor(Math.log(bytes) / Math.log(1024));
            return parseFloat((bytes / Math.pow(1024, i)).toFixed(2)) + ' ' + units[i];
        }
        
        // Navigation buttons
        analyzeBackBtn.addEventListener('click', () => navigateToStep('upload'));
        analyzeNextBtn.addEventListener('click', () => navigateToStep('configure'));
        configureBackBtn.addEventListener('click', () => navigateToStep('analyze'));
        previewBackBtn.addEventListener('click', () => navigateToStep('configure'));
        previewNextBtn.addEventListener('click', () => {
            navigateToStep('process');
            processAllFiles();
        });
        processBackBtn.addEventListener('click', () => navigateToStep('preview'));
        processNextBtn.addEventListener('click', () => navigateToStep('visualize'));
        
        // Cleaning configuration form
        cleaningConfigForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const formData = new FormData(cleaningConfigForm);
            
            // Convert form data to nested object structure
            const config = {};
            
            for (const [key, value] of formData.entries()) {
                // Handle special cases for arrays (checkboxes with same name)
                if (key === 'anomaly_detection.metrics') {
                    if (!config.anomaly_detection) config.anomaly_detection = {};
                    if (!config.anomaly_detection.metrics) config.anomaly_detection.metrics = [];
                    config.anomaly_detection.metrics.push(value);
                    continue;
                }
                
                // Handle nested properties (e.g., "file_size_filtering.enabled")
                if (key.includes('.')) {
                    const [section, property] = key.split('.');
                    if (!config[section]) config[section] = {};
                    
                    // Convert boolean values
                    if (value === 'on') {
                        config[section][property] = true;
                    } else if (property === 'enabled') {
                        config[section][property] = false;
                    } else if (!isNaN(Number(value)) && value !== '') {
                        // Convert numeric values
                        config[section][property] = Number(value);
                    } else {
                        // Handle comma-separated lists
                        if (property === 'standard_headers' || property === 'columns') {
                            config[section][property] = value.split(',').map(item => item.trim());
                        } else {
                            config[section][property] = value;
                        }
                    }
                } else {
                    // Handle top-level properties
                    if (value === 'on') {
                        config[key] = true;
                    } else if (!isNaN(Number(value)) && value !== '') {
                        config[key] = Number(value);
                    } else {
                        config[key] = value;
                    }
                }
            }
            
            // Store the config
            appState.cleaningConfig = config;
            
            // Generate preview for the first file
            previewCleaningResults();
        });
        
        // File list click handler for selecting files
        fileList.addEventListener('click', (e) => {
            const fileItem = e.target.closest('.file-item');
            if (fileItem) {
                const fileIndex = parseInt(fileItem.getAttribute('data-index'));
                if (!isNaN(fileIndex)) {
                    selectFile(fileIndex);
                }
            }
        });
    }

    /**
     * Navigate to a specific step in the workflow
     * @param {string} step - The step to navigate to
     */
    function navigateToStep(step) {
        // Update active step in sidebar
        workflowSteps.forEach(el => {
            if (el.getAttribute('data-step') === step) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });
        
        // Show the selected section
        sections.forEach(section => {
            if (section.id === `${step}-section`) {
                section.classList.add('active');
            } else {
                section.classList.remove('active');
            }
        });
        
        // Update current step in state
        appState.currentStep = step;
        
        // Additional actions based on step
        if (step === 'analyze' && appState.fileAnalysis.length === 0 && appState.uploadedFiles.length > 0) {
            analyzeFiles();
        } else if (step === 'analyze' && appState.fileAnalysis.length > 0) {
            updateAnalysisSummary();
        }
    }

    /**
     * Get the index of a step in the workflow
     * @param {string} step - The step name
     * @returns {number} - The index of the step
     */
    function getStepIndex(step) {
        const steps = ['upload', 'analyze', 'configure', 'preview', 'process', 'visualize'];
        return steps.indexOf(step);
    }

    /**
     * Upload files to the server for analysis
     * @param {FileList} files - The files to upload
     */
    function uploadFiles(files) {
        // Clear previous upload state
        appState.uploadedFiles = [];
        appState.fileAnalysis = [];
        appState.cleaningResults = [];
        
        // Create form data
        const formData = new FormData();
        for (let i = 0; i < files.length; i++) {
            formData.append('files[]', files[i]);
            appState.uploadedFiles.push(files[i]);
        }
        
        // Display upload status
        showAlert(`Uploading ${files.length} file(s)...`, 'info');
        
        // Update file list UI
        updateFileList();
        
        // Navigate to analysis step
        navigateToStep('analyze');
        
        // Trigger file analysis
        analyzeFiles();
    }

    /**
     * Analyze uploaded files on the server
     */
    function analyzeFiles() {
        if (appState.uploadedFiles.length === 0) {
            showAlert('No files to analyze', 'warning');
            return;
        }

        // Show loading indicator - Now handled by upload_progress.js
        analysisLoader.classList.remove('d-none');
        
        // File upload and analysis is now handled by upload_progress.js
        // We're using custom events to handle the completion
        
        // Set up event listeners for the upload complete event
        const handleUploadComplete = function(e) {
            // This will be triggered by upload_progress.js when the upload is complete
            if (e.detail && e.detail.files) {
                // Hide loading indicator
                analysisLoader.classList.add('d-none');
                
                // Store analysis results
                appState.fileAnalysis = e.detail.files;
                
                // Update UI with analysis results
                updateAnalysisSummary();
                updateFileList();
                
                // Show success message
                showAlert(`Successfully analyzed ${e.detail.files.length} file(s)`, 'success');
                
                // Remove this event listener after handling
                document.removeEventListener('upload-complete', handleUploadComplete);
            }
        };
        
        // Set up event listeners for the upload error event
        const handleUploadError = function(e) {
            // Hide loading indicator
            analysisLoader.classList.add('d-none');
            
            // Show error
            console.error('Error analyzing files:', e.detail.message);
            showAlert(`Error analyzing files: ${e.detail.message}`, 'danger');
            
            // Remove this event listener after handling
            document.removeEventListener('upload-error', handleUploadError);
        };
        
        document.addEventListener('upload-complete', handleUploadComplete);
        document.addEventListener('upload-error', handleUploadError);
        
        // The upload progress tracker (upload_progress.js) handles the actual file upload
        // It will automatically submit the form and show progress
        
        // If uploadTracker exists (initialized in upload_progress.js)
        if (window.uploadTracker) {
            // The upload starts by submitting the form
            const form = document.querySelector('#upload-form');
            if (form) {
                // This will be intercepted by upload_progress.js
                form.dispatchEvent(new Event('submit'));
            }
        } else {
            // Fallback if the upload tracker is not available
            // Create form data with files
            const formData = new FormData();
            appState.uploadedFiles.forEach(file => {
                formData.append('files[]', file);
            });
            
            // Send to server
            fetch('/analyze_csv', {
                method: 'POST',
                body: formData
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                }
                return response.json();
            })
            .then(data => {
                // Hide loading indicator
                analysisLoader.classList.add('d-none');
                
                // Store analysis results
                appState.fileAnalysis = data.files;
                
                // Update UI with analysis results
                updateAnalysisSummary();
                updateFileList();
                
                // Show success message
                showAlert(`Successfully analyzed ${data.files.length} file(s)`, 'success');
            })
            .catch(error => {
                // Hide loading indicator
                analysisLoader.classList.add('d-none');
                
                // Show error
                console.error('Error analyzing files:', error);
                showAlert(`Error analyzing files: ${error.message}`, 'danger');
            });
        }
    }

    /**
     * Update the analysis summary UI with file analysis results
     */
    function updateAnalysisSummary() {
        if (appState.fileAnalysis.length === 0) {
            return;
        }
        
        // Update summary statistics
        const summaryStats = document.getElementById('summary-stats');
        const dataIssues = document.getElementById('data-issues');
        
        // Calculate aggregate statistics
        const totalFiles = appState.fileAnalysis.length;
        const validFiles = appState.fileAnalysis.filter(file => !file.error).length;
        const totalRows = appState.fileAnalysis.reduce((sum, file) => sum + (file.row_count || 0), 0);
        const avgRowsPerFile = validFiles > 0 ? Math.round(totalRows / validFiles) : 0;
        const totalFileSize = appState.fileAnalysis.reduce((sum, file) => sum + (file.file_size_mb || 0), 0);
        
        // Get trajectory metrics if available
        const validTrajectories = appState.fileAnalysis.filter(file => 
            file.trajectory_metrics && !file.trajectory_metrics.error
        );
        
        let totalDistance = 0;
        let avgSpeed = 0;
        let avgAltChange = 0;
        let staticSamplesPercent = 0;
        
        if (validTrajectories.length > 0) {
            totalDistance = validTrajectories.reduce((sum, file) => 
                sum + (file.trajectory_metrics.total_distance || 0), 0);
            
            avgSpeed = validTrajectories.reduce((sum, file) => 
                sum + (file.trajectory_metrics.avg_speed || 0), 0) / validTrajectories.length;
            
            avgAltChange = validTrajectories.reduce((sum, file) => 
                sum + (file.trajectory_metrics.altitude_change || 0), 0) / validTrajectories.length;
            
            staticSamplesPercent = validTrajectories.reduce((sum, file) => 
                sum + (file.trajectory_metrics.static_percentage || 0), 0) / validTrajectories.length;
        }
        
        // Update summary stats HTML
        summaryStats.innerHTML = `
            <div class="row g-3">
                <div class="col-md-6 col-lg-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-file-alt me-2 text-primary" style="font-size: 20px;"></i>
                        <div>
                            <h6 class="mb-0">Files</h6>
                            <p class="mb-0 text-muted">${validFiles} of ${totalFiles} valid</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-table me-2 text-primary" style="font-size: 20px;"></i>
                        <div>
                            <h6 class="mb-0">Total Rows</h6>
                            <p class="mb-0 text-muted">${totalRows.toLocaleString()} (avg: ${avgRowsPerFile.toLocaleString()}/file)</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-hdd me-2 text-primary" style="font-size: 20px;"></i>
                        <div>
                            <h6 class="mb-0">Total Size</h6>
                            <p class="mb-0 text-muted">${totalFileSize.toFixed(2)} MB</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-route me-2 text-primary" style="font-size: 20px;"></i>
                        <div>
                            <h6 class="mb-0">Total Distance</h6>
                            <p class="mb-0 text-muted">${totalDistance.toFixed(2)} meters</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-tachometer-alt me-2 text-primary" style="font-size: 20px;"></i>
                        <div>
                            <h6 class="mb-0">Avg Speed</h6>
                            <p class="mb-0 text-muted">${avgSpeed.toFixed(2)} m/s</p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="d-flex align-items-center">
                        <i class="fas fa-arrow-up me-2 text-primary" style="font-size: 20px;"></i>
                        <div>
                            <h6 class="mb-0">Avg Altitude Change</h6>
                            <p class="mb-0 text-muted">${avgAltChange.toFixed(2)} meters</p>
                        </div>
                    </div>
                </div>
            </div>
        `;
        
        // Identify potential issues
        const issues = [];
        
        // Files with errors
        const filesWithErrors = appState.fileAnalysis.filter(file => file.error);
        if (filesWithErrors.length > 0) {
            issues.push({
                type: 'danger',
                icon: 'exclamation-circle',
                title: 'Files with Errors',
                description: `${filesWithErrors.length} file(s) could not be properly analyzed`
            });
        }
        
        // Static flights
        const staticFlights = validTrajectories.filter(file => 
            file.trajectory_metrics.total_distance < 10
        );
        if (staticFlights.length > 0) {
            issues.push({
                type: 'warning',
                icon: 'pause-circle',
                title: 'Static Flights Detected',
                description: `${staticFlights.length} file(s) appear to be static (total distance < 10m)`
            });
        }
        
        // Files with high static percentage
        const highStaticFiles = validTrajectories.filter(file => 
            file.trajectory_metrics.static_percentage > 50
        );
        if (highStaticFiles.length > 0) {
            issues.push({
                type: 'warning',
                icon: 'hand-paper',
                title: 'High Static Percentage',
                description: `${highStaticFiles.length} file(s) have >50% static samples`
            });
        }
        
        // Missing headers
        const missingHeaders = appState.fileAnalysis.filter(file => 
            !file.error && 
            (!file.columns.includes('position_n') || 
             !file.columns.includes('position_e') || 
             !file.columns.includes('position_d'))
        );
        if (missingHeaders.length > 0) {
            issues.push({
                type: 'danger',
                icon: 'columns',
                title: 'Missing Position Columns',
                description: `${missingHeaders.length} file(s) missing required position columns`
            });
        }
        
        // Update issues HTML
        if (issues.length > 0) {
            dataIssues.innerHTML = `
                <div class="list-group list-group-flush">
                    ${issues.map(issue => `
                        <div class="list-group-item bg-${issue.type} bg-opacity-10 border-${issue.type}">
                            <div class="d-flex">
                                <i class="fas fa-${issue.icon} text-${issue.type} me-3" style="font-size: 24px;"></i>
                                <div>
                                    <h6 class="mb-1">${issue.title}</h6>
                                    <p class="mb-0">${issue.description}</p>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>
            `;
        } else {
            dataIssues.innerHTML = `
                <div class="text-center py-3">
                    <i class="fas fa-check-circle text-success mb-2 d-block" style="font-size: 24px;"></i>
                    <p class="mb-0">No significant issues detected</p>
                </div>
            `;
        }
        
        // Update distribution charts
        updateDistributionCharts();
    }

    /**
     * Update distribution charts with file analysis data
     */
    function updateDistributionCharts() {
        // Get chart containers
        const distanceChartContainer = document.getElementById('distance-chart');
        const altitudeChartContainer = document.getElementById('altitude-chart');
        
        // Get valid trajectories
        const validTrajectories = appState.fileAnalysis.filter(file => 
            file.trajectory_metrics && !file.trajectory_metrics.error
        );
        
        if (validTrajectories.length === 0) {
            distanceChartContainer.innerHTML = '<div class="text-center text-muted py-5">No trajectory data available</div>';
            altitudeChartContainer.innerHTML = '<div class="text-center text-muted py-5">No altitude data available</div>';
            return;
        }
        
        // Prepare data for distance chart
        const distanceValues = validTrajectories.map(file => file.trajectory_metrics.total_distance);
        
        // Prepare data for altitude chart
        const altitudeValues = validTrajectories.map(file => file.trajectory_metrics.altitude_change);
        
        // Create distance chart
        Plotly.react(distanceChartContainer, [{
            x: distanceValues,
            type: 'histogram',
            marker: {
                color: 'rgba(13, 110, 253, 0.7)',
                line: {
                    color: 'rgba(13, 110, 253, 1)',
                    width: 1
                }
            },
            nbinsx: 10
        }], {
            title: 'Total Distance Distribution',
            xaxis: { title: 'Distance (m)' },
            yaxis: { title: 'Count' },
            margin: { t: 30, l: 40, r: 10, b: 40 },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#fff' }
        }, { responsive: true });
        
        // Create altitude chart
        Plotly.react(altitudeChartContainer, [{
            x: altitudeValues,
            type: 'histogram',
            marker: {
                color: 'rgba(25, 135, 84, 0.7)',
                line: {
                    color: 'rgba(25, 135, 84, 1)',
                    width: 1
                }
            },
            nbinsx: 10
        }], {
            title: 'Altitude Change Distribution',
            xaxis: { title: 'Altitude Change (m)' },
            yaxis: { title: 'Count' },
            margin: { t: 30, l: 40, r: 10, b: 40 },
            plot_bgcolor: 'rgba(0,0,0,0)',
            paper_bgcolor: 'rgba(0,0,0,0)',
            font: { color: '#fff' }
        }, { responsive: true });
    }

    /**
     * Update the file list UI
     */
    function updateFileList() {
        if (appState.uploadedFiles.length === 0) {
            fileList.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-upload mb-2 d-block" style="font-size: 24px;"></i>
                    No files uploaded yet
                </div>
            `;
            return;
        }
        
        // Create list items for each file
        const listItems = appState.uploadedFiles.map((file, index) => {
            // Get file analysis if available
            const analysis = appState.fileAnalysis[index];
            
            // Determine if file has error or warning
            let statusClass = '';
            let statusIcon = '';
            
            if (analysis) {
                if (analysis.error) {
                    statusClass = 'text-danger';
                    statusIcon = '<i class="fas fa-exclamation-circle text-danger"></i>';
                } else if (analysis.trajectory_metrics && analysis.trajectory_metrics.error) {
                    statusClass = 'text-warning';
                    statusIcon = '<i class="fas fa-exclamation-triangle text-warning"></i>';
                } else if (analysis.trajectory_metrics && analysis.trajectory_metrics.total_distance < 10) {
                    statusClass = 'text-warning';
                    statusIcon = '<i class="fas fa-pause-circle text-warning"></i>';
                }
            }
            
            // Format file size
            const fileSize = file.size / (1024 * 1024); // MB
            const sizeStr = fileSize < 1 ? 
                `${(fileSize * 1024).toFixed(1)} KB` : 
                `${fileSize.toFixed(2)} MB`;
            
            // Create item HTML
            return `
                <a href="#" class="list-group-item list-group-item-action file-item ${index === appState.selectedFileIndex ? 'active' : ''}" data-index="${index}">
                    <div class="d-flex justify-content-between align-items-center">
                        <div class="text-truncate">
                            ${statusIcon} ${file.name}
                        </div>
                        <span class="badge bg-secondary">${sizeStr}</span>
                    </div>
                    ${analysis ? `
                        <div class="small mt-1">
                            <span class="text-muted">${analysis.row_count?.toLocaleString() || 'N/A'} rows</span>
                            ${analysis.trajectory_metrics ? `
                                <span class="text-muted ms-2">
                                    ${analysis.trajectory_metrics.total_distance?.toFixed(1) || 'N/A'} m
                                </span>
                            ` : ''}
                        </div>
                    ` : ''}
                </a>
            `;
        });
        
        // Update file list
        fileList.innerHTML = listItems.join('');
    }

    /**
     * Select a file in the list
     * @param {number} index - The index of the file to select
     */
    function selectFile(index) {
        if (index >= 0 && index < appState.uploadedFiles.length) {
            appState.selectedFileIndex = index;
            
            // Update file list UI
            const fileItems = document.querySelectorAll('.file-item');
            fileItems.forEach((item, i) => {
                if (i === index) {
                    item.classList.add('active');
                } else {
                    item.classList.remove('active');
                }
            });
            
            // If in preview step, update preview for selected file
            if (appState.currentStep === 'preview' && appState.cleaningResults.length > 0) {
                updatePreviewUI(appState.cleaningResults[index]);
            }
        }
    }

    /**
     * Preview cleaning results for the selected file
     */
    function previewCleaningResults() {
        if (appState.uploadedFiles.length === 0 || appState.fileAnalysis.length === 0) {
            showAlert('No files to preview', 'warning');
            return;
        }
        
        // Show loading indicator
        previewLoader.classList.remove('d-none');
        document.getElementById('preview-results').style.display = 'none';
        
        // Use selected file index, or first file if none selected
        const fileIndex = appState.selectedFileIndex;
        const fileAnalysis = appState.fileAnalysis[fileIndex];
        
        // Add file content to analysis for the server
        const fileAnalysisWithContent = {
            ...fileAnalysis,
            content: appState.uploadedFiles[fileIndex].text ? 
                appState.uploadedFiles[fileIndex].text : 
                'File content not available'
        };
        
        // Request preview from server
        fetch('/clean_data', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(appState.cleaningConfig)
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Server returned ${response.status}: ${response.statusText}`);
            }
            return response.json();
        })
        .then(data => {
            // Hide loading indicator
            previewLoader.classList.add('d-none');
            document.getElementById('preview-results').style.display = 'block';
            
            // Store cleaning results
            appState.cleaningResults = data.results;
            
            // Update preview UI
            updatePreviewUI(data.results[fileIndex]);
            
            // Navigate to preview step
            navigateToStep('preview');
            
            // Show success message
            showAlert('Preview generated successfully', 'success');
        })
        .catch(error => {
            // Hide loading indicator
            previewLoader.classList.add('d-none');
            document.getElementById('preview-results').style.display = 'block';
            
            // Show error
            console.error('Error generating preview:', error);
            showAlert(`Error generating preview: ${error.message}`, 'danger');
        });
    }

    /**
     * Update the preview UI with cleaning results
     * @param {Object} result - The cleaning result for a file
     */
    function updatePreviewUI(result) {
        if (!result) {
            return;
        }
        
        // Update filename
        document.getElementById('preview-filename').textContent = result.filename;
        
        // Update operations count
        document.getElementById('preview-operations-count').textContent = 
            `${result.operations_applied.length} operation${result.operations_applied.length !== 1 ? 's' : ''}`;
        
        // Update before/after previews
        const beforePreview = document.getElementById('before-preview');
        const afterPreview = document.getElementById('after-preview');
        
        // Convert raw data to HTML table
        if (result.raw_preview && result.raw_preview.length > 0) {
            beforePreview.innerHTML = createDataTable(result.raw_preview);
        } else {
            beforePreview.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-file-csv mb-2 d-block" style="font-size: 24px;"></i>
                    No preview available
                </div>
            `;
        }
        
        if (result.cleaned_preview && result.cleaned_preview.length > 0) {
            afterPreview.innerHTML = createDataTable(result.cleaned_preview);
        } else {
            afterPreview.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-file-csv mb-2 d-block" style="font-size: 24px;"></i>
                    ${result.operations_applied.includes('static_flight_detection') ? 
                        'File removed (static flight detected)' : 'No preview available'}
                </div>
            `;
        }
        
        // Update operations summary
        const operationsSummary = document.getElementById('operations-summary');
        
        if (result.operations_applied.length > 0) {
            const operationsDetails = result.operations_applied.map(op => {
                const resultDetails = result.cleaning_results[op];
                let detailsHtml = '';
                
                switch (op) {
                    case 'file_size_filtering':
                        detailsHtml = `
                            <span class="badge bg-${resultDetails.action === 'skipped' ? 'warning' : 'success'}">
                                ${resultDetails.action}
                            </span>
                            <p class="mb-0 mt-1">${resultDetails.reason}</p>
                        `;
                        break;
                    case 'header_management':
                        detailsHtml = `
                            <p class="mb-1">Headers before: ${resultDetails.headers_before.length}</p>
                            <p class="mb-1">Headers after: ${resultDetails.headers_after.length}</p>
                            <p class="mb-0">Added: ${resultDetails.missing_headers_added.length} columns</p>
                        `;
                        break;
                    case 'static_flight_detection':
                        detailsHtml = `
                            <span class="badge bg-${resultDetails.action === 'removed' ? 'danger' : 'success'}">
                                ${resultDetails.action}
                            </span>
                            <p class="mb-0 mt-1">${resultDetails.reason || 'Flight is not static'}</p>
                        `;
                        break;
                    case 'trim_static_start':
                        detailsHtml = `
                            <p class="mb-1">Rows removed: ${resultDetails.rows_removed}</p>
                            <p class="mb-0">
                                ${resultDetails.percentage_removed.toFixed(1)}% of data removed from start
                            </p>
                        `;
                        break;
                    case 'remove_static_samples':
                        detailsHtml = `
                            <p class="mb-1">Static samples removed: ${resultDetails.rows_removed}</p>
                            <p class="mb-0">
                                ${resultDetails.percentage_removed.toFixed(1)}% of data points were static
                            </p>
                        `;
                        break;
                    case 'remove_quaternion_columns':
                        detailsHtml = `
                            <p class="mb-0">Removed ${resultDetails.columns_removed.length} columns:
                            ${resultDetails.columns_removed.join(', ')}</p>
                        `;
                        break;
                    case 'anomaly_detection':
                        if (resultDetails.anomalies && resultDetails.anomalies.length > 0) {
                            detailsHtml = `
                                <span class="badge bg-${resultDetails.action === 'removed' ? 'danger' : 'warning'}">
                                    ${resultDetails.action}
                                </span>
                                <div class="mt-1">
                                    ${resultDetails.anomalies.map(anomaly => `
                                        <p class="mb-1">
                                            <i class="fas fa-exclamation-triangle text-warning me-1"></i>
                                            ${anomaly.metric}: ${anomaly.value.toFixed(2)} (threshold: ${anomaly.threshold})
                                        </p>
                                    `).join('')}
                                </div>
                            `;
                        } else {
                            detailsHtml = `
                                <p class="mb-0">No anomalies detected</p>
                            `;
                        }
                        break;
                    case 'file_resequencing':
                        detailsHtml = `
                            <p class="mb-0">Original: ${resultDetails.original_filename}</p>
                            <p class="mb-0">${resultDetails.note}</p>
                        `;
                        break;
                    default:
                        detailsHtml = `<p class="mb-0">No details available</p>`;
                }
                
                return `
                    <div class="card bg-dark mb-3">
                        <div class="card-header bg-opacity-10 py-2">
                            <div class="d-flex justify-content-between align-items-center">
                                <h6 class="mb-0">${formatOperationName(op)}</h6>
                                <i class="fas fa-check-circle text-success"></i>
                            </div>
                        </div>
                        <div class="card-body py-2">
                            ${detailsHtml}
                        </div>
                    </div>
                `;
            }).join('');
            
            operationsSummary.innerHTML = operationsDetails;
        } else {
            operationsSummary.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-tasks mb-2 d-block" style="font-size: 24px;"></i>
                    No operations configured or applied
                </div>
            `;
        }
        
        // Update data reduction metrics
        updateReductionMetrics(result);
    }

    /**
     * Update data reduction metrics in the preview UI
     * @param {Object} result - The cleaning result for a file
     */
    function updateReductionMetrics(result) {
        // Get original and final stats
        const originalStats = result.original_stats;
        const finalStats = result.final_stats;
        
        // Update row count display
        document.getElementById('rows-before').textContent = originalStats.row_count.toLocaleString();
        document.getElementById('rows-after').textContent = finalStats.row_count.toLocaleString();
        document.getElementById('rows-reduction').textContent = `${finalStats.percentage_reduction.toFixed(1)}%`;
        
        // Update size display
        document.getElementById('size-before').textContent = `${originalStats.file_size_mb.toFixed(2)} MB`;
        document.getElementById('size-after').textContent = `${finalStats.file_size_mb.toFixed(2)} MB`;
        document.getElementById('size-reduction').textContent = `${finalStats.size_reduction.toFixed(1)}%`;
        
        // Update progress bars
        const rowsProgress = document.getElementById('rows-progress');
        const sizeProgress = document.getElementById('size-progress');
        
        const rowsWidth = Math.max(1, 100 - finalStats.percentage_reduction);
        const sizeWidth = Math.max(1, 100 - finalStats.size_reduction);
        
        rowsProgress.style.width = `${rowsWidth}%`;
        rowsProgress.textContent = `${rowsWidth.toFixed(0)}%`;
        
        sizeProgress.style.width = `${sizeWidth}%`;
        sizeProgress.textContent = `${sizeWidth.toFixed(0)}%`;
    }

    /**
     * Process all files with configured cleaning operations
     */
    function processAllFiles() {
        if (appState.uploadedFiles.length === 0 || appState.fileAnalysis.length === 0) {
            showAlert('No files to process', 'warning');
            return;
        }
        
        // Show processing UI, hide results
        processLoader.classList.remove('d-none');
        processResults.classList.add('d-none');
        
        // Update progress bar and status
        const progressBar = document.getElementById('process-progress-bar');
        const processingStatus = document.getElementById('processing-status');
        
        progressBar.style.width = '0%';
        progressBar.textContent = '0%';
        processingStatus.textContent = 'Initializing...';
        
        // In a real implementation, we would process each file individually
        // or send a batch request to the server
        // For this demo, we'll simulate processing with a delay
        
        const totalFiles = appState.uploadedFiles.length;
        let processedFiles = 0;
        
        // Simulate file processing with delays
        const processNextFile = () => {
            if (processedFiles >= totalFiles) {
                // All files processed, show results
                showProcessingResults();
                return;
            }
            
            // Update progress
            processedFiles++;
            const progress = Math.round((processedFiles / totalFiles) * 100);
            
            progressBar.style.width = `${progress}%`;
            progressBar.textContent = `${progress}%`;
            processingStatus.textContent = `Processing file ${processedFiles} of ${totalFiles}...`;
            
            // Continue with next file after a delay
            setTimeout(processNextFile, 500 + Math.random() * 1000);
        };
        
        // Start processing
        setTimeout(processNextFile, 1000);
    }

    /**
     * Show processing results UI after all files are processed
     */
    function showProcessingResults() {
        // Hide loader, show results
        processLoader.classList.add('d-none');
        processResults.classList.remove('d-none');
        
        // Get results summary elements
        const totalFilesProcessed = document.getElementById('total-files-processed');
        const totalRowsRemoved = document.getElementById('total-rows-removed');
        const avgSizeReduction = document.getElementById('avg-size-reduction');
        const processedFilesList = document.getElementById('processed-files-list');
        
        // Calculate summary statistics from cleaning results
        const validResults = appState.cleaningResults.filter(r => !r.error);
        const totalFiles = validResults.length;
        
        let totalRowsBefore = 0;
        let totalRowsAfter = 0;
        let totalSizeReduction = 0;
        
        validResults.forEach(result => {
            if (result.original_stats && result.final_stats) {
                totalRowsBefore += result.original_stats.row_count || 0;
                totalRowsAfter += result.final_stats.row_count || 0;
                totalSizeReduction += result.final_stats.size_reduction || 0;
            }
        });
        
        const rowsRemoved = totalRowsBefore - totalRowsAfter;
        const avgReduction = totalFiles > 0 ? totalSizeReduction / totalFiles : 0;
        
        // Update summary stats
        totalFilesProcessed.textContent = totalFiles;
        totalRowsRemoved.textContent = rowsRemoved.toLocaleString();
        avgSizeReduction.textContent = `${avgReduction.toFixed(1)}%`;
        
        // Create processed files list
        const fileListHtml = validResults.map(result => {
            // Format statistics and operation counts
            const operationsCount = result.operations_applied ? result.operations_applied.length : 0;
            const rowReduction = result.final_stats ? result.final_stats.percentage_reduction.toFixed(1) : 0;
            const sizeReduction = result.final_stats ? result.final_stats.size_reduction.toFixed(1) : 0;
            
            // Determine status icon/class
            let statusClass = 'success';
            let statusIcon = 'check-circle';
            let statusText = 'Processed';
            
            if (result.error) {
                statusClass = 'danger';
                statusIcon = 'times-circle';
                statusText = 'Error';
            } else if (operationsCount === 0) {
                statusClass = 'warning';
                statusIcon = 'exclamation-circle';
                statusText = 'No changes';
            } else if (result.operations_applied.includes('static_flight_detection') && 
                       result.cleaning_results.static_flight_detection.action === 'removed') {
                statusClass = 'info';
                statusIcon = 'filter';
                statusText = 'Filtered';
            } else if (result.operations_applied.includes('anomaly_detection') &&
                       result.cleaning_results.anomaly_detection.action === 'removed') {
                statusClass = 'info';
                statusIcon = 'filter';
                statusText = 'Anomaly removed';
            }
            
            return `
                <div class="d-flex align-items-center border-bottom py-2">
                    <div class="me-auto">
                        <div class="d-flex align-items-center">
                            <i class="fas fa-file-alt me-2 text-primary"></i>
                            <span>${result.filename}</span>
                        </div>
                        <div class="small text-muted mt-1">
                            ${operationsCount} operation${operationsCount !== 1 ? 's' : ''} applied, 
                            ${rowReduction}% rows removed, ${sizeReduction}% size reduction
                        </div>
                    </div>
                    <span class="badge bg-${statusClass} d-flex align-items-center">
                        <i class="fas fa-${statusIcon} me-1"></i> ${statusText}
                    </span>
                </div>
            `;
        }).join('');
        
        // Update files list
        if (fileListHtml) {
            processedFilesList.innerHTML = fileListHtml;
        } else {
            processedFilesList.innerHTML = `
                <div class="text-center text-muted py-3">
                    <i class="fas fa-file-alt mb-2 d-block" style="font-size: 24px;"></i>
                    No files processed
                </div>
            `;
        }
        
        // Show success message
        showAlert(`Successfully processed ${totalFiles} file(s)`, 'success');
    }

    /**
     * Helper function to format operation names for display
     * @param {string} operation - The operation name from the backend
     * @returns {string} - Formatted operation name
     */
    function formatOperationName(operation) {
        const operationNames = {
            'file_size_filtering': 'File Size Filtering',
            'header_management': 'Header Management',
            'static_flight_detection': 'Static Flight Detection',
            'trim_static_start': 'Trim Static Start',
            'remove_static_samples': 'Remove Static Samples',
            'remove_quaternion_columns': 'Remove Quaternion Columns',
            'anomaly_detection': 'Anomaly Detection',
            'file_resequencing': 'File Resequencing'
        };
        
        return operationNames[operation] || operation;
    }

    /**
     * Create an HTML table from data records
     * @param {Array} data - Array of data records
     * @returns {string} - HTML table
     */
    function createDataTable(data) {
        if (!data || data.length === 0) {
            return '<p class="text-muted">No data available</p>';
        }
        
        // Get column headers from first record
        const columns = Object.keys(data[0]);
        
        // Create table HTML
        const tableHtml = `
            <div class="table-responsive">
                <table class="table table-sm table-bordered">
                    <thead>
                        <tr>
                            ${columns.map(col => `<th scope="col">${col}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>
                        ${data.map(row => `
                            <tr>
                                ${columns.map(col => `<td>${row[col] !== null && row[col] !== undefined ? row[col] : ''}</td>`).join('')}
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        `;
        
        return tableHtml;
    }

    /**
     * Show an alert message
     * @param {string} message - The message to display
     * @param {string} type - Alert type (success, info, warning, danger)
     */
    function showAlert(message, type = 'info') {
        // Create alert element
        const alertEl = document.createElement('div');
        alertEl.className = `alert alert-${type} alert-dismissible fade show position-fixed top-0 start-50 translate-middle-x mt-3`;
        alertEl.style.zIndex = 9999;
        alertEl.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        `;
        
        // Add to document
        document.body.appendChild(alertEl);
        
        // Auto-remove after 5 seconds
        setTimeout(() => {
            alertEl.classList.remove('show');
            setTimeout(() => alertEl.remove(), 150);
        }, 5000);
    }
});