/**
 * Enhanced Server Data Browser
 * 
 * Features:
 * - Improved UI with modern styling
 * - Select All functionality for multiple file selection
 * - Batch processing support for visualizing >100 simulations at once
 * - Improved accessibility and user experience
 * 
 * @author TEA Labs (Trustworthy Engineered Autonomy)
 */

document.addEventListener('DOMContentLoaded', function() {
  console.log('Enhanced server browser module loaded');
  
  // State management for server data browser
  const serverBrowserState = {
    currentFolder: 'sample_data',
    files: [],
    folders: [],
    selectedFiles: [],
    viewMode: 'list', // 'list' or 'grid'
    sortOption: 'date-desc',
    searchQuery: '',
    batchProcessing: true, // Default to batch processing
    selectAllActive: false,
    pageSize: 'all', // Set to 'all' to remove the 50-file limit
    currentPage: 1
  };
  
  // DOM element references
  const serverDataModal = document.getElementById('serverDataModal');
  const selectAllCheckbox = document.getElementById('select-all-files');
  const clearSelectionsBtn = document.getElementById('clear-selections');
  const batchProcessToggle = document.getElementById('batch-process-toggle');
  const loadSelectedBtn = document.getElementById('load-selected-server-files');
  const selectedFilesCount = document.getElementById('selected-files-count');
  const selectedFilesList = document.getElementById('selected-files-list');
  const availableFilesCount = document.getElementById('available-files-count');
  const fileListContainer = document.getElementById('file-list-container');
  const fileGridContainer = document.getElementById('file-grid-container');
  
  // Initialize event listeners if elements exist
  function initializeEventListeners() {
    // Select All functionality
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', function(e) {
        serverBrowserState.selectAllActive = this.checked;
        toggleSelectAll(this.checked);
      });
    }
    
    // Clear selections button
    if (clearSelectionsBtn) {
      clearSelectionsBtn.addEventListener('click', function() {
        clearAllSelections();
      });
    }
    
    // Batch processing toggle
    if (batchProcessToggle) {
      batchProcessToggle.addEventListener('change', function() {
        serverBrowserState.batchProcessing = this.checked;
        updateLoadButtonStatus();
      });
    }
    
    // Handle modal shown event to update UI state
    if (serverDataModal) {
      serverDataModal.addEventListener('shown.bs.modal', function() {
        updateFileCountDisplay();
        updateSelectedFilesDisplay();
        bindFileCheckboxEvents();
      });
    }
    
    // Load selected files button
    if (loadSelectedBtn) {
      loadSelectedBtn.addEventListener('click', loadSelectedFiles);
    }
  }
  
  // Select or deselect all files
  function toggleSelectAll(selectAll) {
    // Get all file checkboxes
    const fileCheckboxes = document.querySelectorAll('.file-select-checkbox');
    
    if (selectAll) {
      // Select all files
      serverBrowserState.selectedFiles = [];
      fileCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
        
        // Add to selected files if not already included
        const filePath = checkbox.dataset.filePath;
        const fileName = checkbox.dataset.fileName;
        const fileSize = checkbox.dataset.fileSize;
        
        if (!isFileSelected(filePath)) {
          serverBrowserState.selectedFiles.push({
            path: filePath,
            name: fileName,
            size: fileSize
          });
        }
        
        // Highlight the row or card
        const fileRow = checkbox.closest('tr');
        if (fileRow) {
          fileRow.classList.add('table-primary');
        }
      });
    } else {
      // Deselect all files
      fileCheckboxes.forEach(checkbox => {
        checkbox.checked = false;
        
        // Remove highlight from row or card
        const fileRow = checkbox.closest('tr');
        if (fileRow) {
          fileRow.classList.remove('table-primary');
        }
      });
      
      // Clear selected files array
      serverBrowserState.selectedFiles = [];
    }
    
    // Update UI
    updateSelectedFilesDisplay();
    updateLoadButtonStatus();
  }
  
  // Clear all selections
  function clearAllSelections() {
    if (selectAllCheckbox) {
      selectAllCheckbox.checked = false;
    }
    toggleSelectAll(false);
  }
  
  // Check if a file is selected
  function isFileSelected(filePath) {
    return serverBrowserState.selectedFiles.some(file => file.path === filePath);
  }
  
  // Toggle selection of a single file
  function toggleFileSelection(checkbox) {
    const filePath = checkbox.dataset.filePath;
    const fileName = checkbox.dataset.fileName;
    const fileSize = checkbox.dataset.fileSize;
    
    if (checkbox.checked) {
      // Add file to selection if not already included
      if (!isFileSelected(filePath)) {
        serverBrowserState.selectedFiles.push({
          path: filePath,
          name: fileName,
          size: fileSize
        });
      }
      
      // Highlight the row or card
      const fileRow = checkbox.closest('tr');
      if (fileRow) {
        fileRow.classList.add('table-primary');
      }
    } else {
      // Remove file from selection
      serverBrowserState.selectedFiles = serverBrowserState.selectedFiles.filter(
        file => file.path !== filePath
      );
      
      // Remove highlight from row or card
      const fileRow = checkbox.closest('tr');
      if (fileRow) {
        fileRow.classList.remove('table-primary');
      }
      
      // Update select all checkbox
      if (selectAllCheckbox && serverBrowserState.selectAllActive) {
        selectAllCheckbox.checked = false;
        serverBrowserState.selectAllActive = false;
      }
    }
    
    // Update UI
    updateSelectedFilesDisplay();
    updateLoadButtonStatus();
  }
  
  // Bind events to file checkboxes
  function bindFileCheckboxEvents() {
    const fileCheckboxes = document.querySelectorAll('.file-select-checkbox');
    fileCheckboxes.forEach(checkbox => {
      // Remove existing event listeners to prevent duplicates
      checkbox.removeEventListener('change', checkboxChangeHandler);
      
      // Add event listener
      checkbox.addEventListener('change', checkboxChangeHandler);
    });
  }
  
  // Event handler for checkbox changes
  function checkboxChangeHandler(e) {
    toggleFileSelection(this);
  }
  
  // Update the display of selected files
  function updateSelectedFilesDisplay() {
    // Update count badge
    if (selectedFilesCount) {
      selectedFilesCount.textContent = `Selected: ${serverBrowserState.selectedFiles.length} files`;
    }
    
    // Update list of selected files
    if (selectedFilesList) {
      if (serverBrowserState.selectedFiles.length === 0) {
        selectedFilesList.innerHTML = `<p class="text-muted text-center mb-0">No files selected. Select files from the list below.</p>`;
      } else {
        let listHTML = '<div class="list-group list-group-flush">';
        serverBrowserState.selectedFiles.forEach(file => {
          listHTML += `
            <div class="list-group-item list-group-item-action py-2 d-flex justify-content-between align-items-center">
              <div class="text-truncate" title="${file.name}">${file.name}</div>
              <button type="button" class="btn btn-sm btn-outline-danger remove-file" 
                data-file-path="${file.path}" aria-label="Remove ${file.name}">
                <i class="fas fa-times"></i>
              </button>
            </div>
          `;
        });
        listHTML += '</div>';
        selectedFilesList.innerHTML = listHTML;
        
        // Add event listeners to remove buttons
        document.querySelectorAll('.remove-file').forEach(button => {
          button.addEventListener('click', function() {
            const filePath = this.dataset.filePath;
            removeFileFromSelection(filePath);
          });
        });
      }
    }
  }
  
  // Update the display of total available files
  function updateFileCountDisplay() {
    if (availableFilesCount) {
      const count = serverBrowserState.files.length;
      availableFilesCount.textContent = `${count} files`;
    }
  }
  
  // Remove a file from the selection
  function removeFileFromSelection(filePath) {
    // Remove from state
    serverBrowserState.selectedFiles = serverBrowserState.selectedFiles.filter(
      file => file.path !== filePath
    );
    
    // Uncheck corresponding checkbox
    const checkbox = document.querySelector(`.file-select-checkbox[data-file-path="${filePath}"]`);
    if (checkbox) {
      checkbox.checked = false;
      
      // Remove highlight from row
      const fileRow = checkbox.closest('tr');
      if (fileRow) {
        fileRow.classList.remove('table-primary');
      }
    }
    
    // Update select all checkbox
    if (selectAllCheckbox && serverBrowserState.selectAllActive) {
      selectAllCheckbox.checked = false;
      serverBrowserState.selectAllActive = false;
    }
    
    // Update UI
    updateSelectedFilesDisplay();
    updateLoadButtonStatus();
  }
  
  // Update the load button status based on selections
  function updateLoadButtonStatus() {
    if (loadSelectedBtn) {
      loadSelectedBtn.disabled = serverBrowserState.selectedFiles.length === 0;
      
      // Update button text based on selection count
      if (serverBrowserState.selectedFiles.length > 0) {
        loadSelectedBtn.innerHTML = `<i class="fas fa-chart-line me-1"></i>Visualize ${serverBrowserState.selectedFiles.length} Selected File${serverBrowserState.selectedFiles.length > 1 ? 's' : ''}`;
      } else {
        loadSelectedBtn.innerHTML = `<i class="fas fa-chart-line me-1"></i>Visualize Selected Files`;
      }
    }
  }
  
  // Load and process selected files
  function loadSelectedFiles() {
    if (serverBrowserState.selectedFiles.length === 0) {
      return;
    }
    
    // Hide the modal
    const modal = bootstrap.Modal.getInstance(serverDataModal);
    if (modal) {
      modal.hide();
    }
    
    // Show loading message
    if (typeof showMessage === 'function') {
      showMessage(`Processing ${serverBrowserState.selectedFiles.length} selected files...`, 'info');
    }
    
    if (serverBrowserState.batchProcessing) {
      // Process all files simultaneously
      processFilesInBatch();
    } else {
      // Process files sequentially
      processFilesSequentially(0);
    }
  }
  
  // Process all files in batch mode
  function processFilesInBatch() {
    const totalFiles = serverBrowserState.selectedFiles.length;
    let filesProcessed = 0;
    let filesSucceeded = 0;
    let filesFailed = 0;
    
    // Function to update status after each file is processed
    function updateStatus() {
      filesProcessed++;
      if (typeof showMessage === 'function') {
        showMessage(`Processed ${filesProcessed}/${totalFiles} files (${filesSucceeded} succeeded, ${filesFailed} failed)`, 'info');
      }
      
      // If all files processed, show summary message
      if (filesProcessed === totalFiles) {
        if (filesFailed === 0) {
          if (typeof showMessage === 'function') {
            showMessage(`Successfully processed all ${totalFiles} files`, 'success');
          }
        } else {
          if (typeof showMessage === 'function') {
            showMessage(`Processed ${totalFiles} files with ${filesFailed} errors`, 'warning');
          }
        }
        
        // Update UI
        if (typeof updateTrajectoryList === 'function') {
          updateTrajectoryList();
        }
        
        if (typeof updateTimeSlider === 'function') {
          updateTimeSlider();
        }
      }
    }
    
    // Process each file with async fetch
    serverBrowserState.selectedFiles.forEach(file => {
      fetch(`/get_server_file?path=${encodeURIComponent(file.path)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          // Process the file if needed functions exist
          if (typeof processData === 'function' && typeof addTrajectory === 'function') {
            const processedData = processData(data.data);
            
            // Generate a random color for the trajectory
            const randomColor = Math.random() * 0xffffff;
            
            // Add the trajectory
            addTrajectory(processedData, file.name, randomColor);
            
            filesSucceeded++;
          } else {
            console.error('Required visualization functions not found');
            filesFailed++;
          }
        })
        .catch(error => {
          console.error(`Error processing file ${file.name}:`, error);
          filesFailed++;
        })
        .finally(() => {
          updateStatus();
        });
    });
  }
  
  // Process files sequentially one at a time
  function processFilesSequentially(index) {
    if (index >= serverBrowserState.selectedFiles.length) {
      // All files processed
      if (typeof showMessage === 'function') {
        showMessage(`All ${serverBrowserState.selectedFiles.length} file(s) processed successfully`, 'success');
      }
      
      // Update UI
      if (typeof updateTrajectoryList === 'function') {
        updateTrajectoryList();
      }
      
      if (typeof updateTimeSlider === 'function') {
        updateTimeSlider();
      }
      
      return;
    }
    
    const file = serverBrowserState.selectedFiles[index];
    
    // Show loading message
    if (typeof showMessage === 'function') {
      showMessage(`Processing file ${index + 1}/${serverBrowserState.selectedFiles.length}: ${file.name}...`, 'info');
    }
    
    // Fetch file data from server
    fetch(`/get_server_file?path=${encodeURIComponent(file.path)}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        // Process the file if needed functions exist
        if (typeof processData === 'function' && typeof addTrajectory === 'function') {
          const processedData = processData(data.data);
          
          // Generate a random color for the trajectory
          const randomColor = Math.random() * 0xffffff;
          
          // Add the trajectory
          addTrajectory(processedData, file.name, randomColor);
          
          // Process next file
          processFilesSequentially(index + 1);
        } else {
          console.error('Required visualization functions not found');
          processFilesSequentially(index + 1);
        }
      })
      .catch(error => {
        console.error(`Error processing file ${file.name}:`, error);
        
        // Show error message
        if (typeof showMessage === 'function') {
          showMessage(`Error processing file ${file.name}: ${error.message}`, 'danger');
        }
        
        // Continue with next file
        processFilesSequentially(index + 1);
      });
  }
  
  // Enhanced rendering for file listing with checkboxes
  function renderFileList(files, container, viewMode = 'list') {
    if (!container) return;
    
    if (files.length === 0) {
      container.innerHTML = `
        <div class="alert alert-info m-3">
          <i class="fas fa-info-circle me-2"></i> No files found in this folder.
        </div>
      `;
      return;
    }
    
    if (viewMode === 'list') {
      // List view (table)
      let tableHTML = `
        <table class="table table-hover table-striped mb-0">
          <thead class="table-dark">
            <tr>
              <th style="width: 40px;"></th>
              <th>Name</th>
              <th style="width: 120px;">Size</th>
              <th style="width: 200px;">Modified</th>
              <th style="width: 100px;">Actions</th>
            </tr>
          </thead>
          <tbody>
      `;
      
      files.forEach(file => {
        const isSelected = isFileSelected(file.path);
        const safeId = file.name.replace(/[^a-zA-Z0-9]/g, '-');
        const modifiedDate = new Date(file.modified * 1000).toLocaleString();
        
        tableHTML += `
          <tr class="${isSelected ? 'table-primary' : ''}">
            <td class="text-center">
              <div class="form-check">
                <input type="checkbox" class="form-check-input file-select-checkbox" 
                  id="file-${safeId}" 
                  data-file-path="${file.path}" 
                  data-file-name="${file.name}" 
                  data-file-size="${file.size}" 
                  ${isSelected ? 'checked' : ''}>
                <label class="form-check-label visually-hidden" for="file-${safeId}">Select ${file.name}</label>
              </div>
            </td>
            <td class="text-truncate" style="max-width: 300px;" title="${file.name}">${file.name}</td>
            <td>${file.size_formatted}</td>
            <td>${modifiedDate}</td>
            <td>
              <div class="btn-group btn-group-sm">
                <button type="button" class="btn btn-outline-primary preview-file" title="Preview" data-file-path="${file.path}">
                  <i class="fas fa-eye"></i>
                </button>
                <button type="button" class="btn btn-primary load-file" title="Load" data-file-path="${file.path}">
                  <i class="fas fa-upload"></i>
                </button>
              </div>
            </td>
          </tr>
        `;
      });
      
      tableHTML += `
          </tbody>
        </table>
      `;
      
      container.innerHTML = tableHTML;
    } else {
      // Grid view (cards)
      let gridHTML = '<div class="row g-3">';
      
      files.forEach(file => {
        const isSelected = isFileSelected(file.path);
        const safeId = file.name.replace(/[^a-zA-Z0-9]/g, '-');
        const modifiedDate = new Date(file.modified * 1000).toLocaleString();
        
        gridHTML += `
          <div class="col-sm-6 col-md-4 col-lg-3">
            <div class="card h-100 ${isSelected ? 'border-primary' : 'border-dark'}">
              <div class="card-header bg-dark text-white d-flex justify-content-between align-items-center">
                <div class="form-check">
                  <input type="checkbox" class="form-check-input file-select-checkbox" 
                    id="file-grid-${safeId}" 
                    data-file-path="${file.path}" 
                    data-file-name="${file.name}" 
                    data-file-size="${file.size}" 
                    ${isSelected ? 'checked' : ''}>
                  <label class="form-check-label" for="file-grid-${safeId}">Select</label>
                </div>
                <span class="badge bg-light text-dark">${file.size_formatted}</span>
              </div>
              <div class="card-body">
                <h6 class="card-title text-truncate" title="${file.name}">${file.name}</h6>
                <p class="card-text small">Modified: ${modifiedDate}</p>
              </div>
              <div class="card-footer">
                <div class="btn-group btn-group-sm w-100">
                  <button type="button" class="btn btn-outline-primary preview-file" title="Preview" data-file-path="${file.path}">
                    <i class="fas fa-eye me-1"></i> Preview
                  </button>
                  <button type="button" class="btn btn-primary load-file" title="Load" data-file-path="${file.path}">
                    <i class="fas fa-upload me-1"></i> Load
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      
      gridHTML += '</div>';
      container.innerHTML = gridHTML;
    }
    
    // Bind events to buttons
    bindFileActionButtons();
  }
  
  // Bind events to preview and load buttons
  function bindFileActionButtons() {
    // Preview buttons
    document.querySelectorAll('.preview-file').forEach(button => {
      button.addEventListener('click', function() {
        const filePath = this.dataset.filePath;
        previewFile(filePath);
      });
    });
    
    // Load buttons
    document.querySelectorAll('.load-file').forEach(button => {
      button.addEventListener('click', function() {
        const filePath = this.dataset.filePath;
        const fileName = serverBrowserState.files.find(f => f.path === filePath)?.name || 'file';
        const fileSize = serverBrowserState.files.find(f => f.path === filePath)?.size || 0;
        
        // Add to selected files if not already there
        if (!isFileSelected(filePath)) {
          serverBrowserState.selectedFiles.push({
            path: filePath,
            name: fileName,
            size: fileSize
          });
          
          // Update UI
          updateSelectedFilesDisplay();
        }
        
        // Load just this single file
        const singleFile = {
          path: filePath,
          name: fileName,
          size: fileSize
        };
        
        // Hide the modal
        const modal = bootstrap.Modal.getInstance(serverDataModal);
        if (modal) {
          modal.hide();
        }
        
        // Show loading message
        if (typeof showMessage === 'function') {
          showMessage(`Processing file: ${fileName}...`, 'info');
        }
        
        // Load and process the single file
        loadSingleFile(singleFile);
      });
    });
  }
  
  // Preview a file
  function previewFile(filePath) {
    console.log('Preview file:', filePath);
    // Implement file preview functionality here
  }
  
  // Load and process a single file
  function loadSingleFile(file) {
    fetch(`/get_server_file?path=${encodeURIComponent(file.path)}`)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        // Process the file if needed functions exist
        if (typeof processData === 'function' && typeof addTrajectory === 'function') {
          const processedData = processData(data.data);
          
          // Generate a random color for the trajectory
          const randomColor = Math.random() * 0xffffff;
          
          // Add the trajectory
          addTrajectory(processedData, file.name, randomColor);
          
          // Update UI
          if (typeof updateTrajectoryList === 'function') {
            updateTrajectoryList();
          }
          
          if (typeof updateTimeSlider === 'function') {
            updateTimeSlider();
          }
          
          // Show success message
          if (typeof showMessage === 'function') {
            showMessage(`Successfully loaded: ${file.name}`, 'success');
          }
        } else {
          console.error('Required visualization functions not found');
          
          // Show error message
          if (typeof showMessage === 'function') {
            showMessage(`Error: Could not process file ${file.name}`, 'danger');
          }
        }
      })
      .catch(error => {
        console.error(`Error processing file ${file.name}:`, error);
        
        // Show error message
        if (typeof showMessage === 'function') {
          showMessage(`Error processing file ${file.name}: ${error.message}`, 'danger');
        }
      });
  }
  
  // Set up all event listeners when DOM is ready
  initializeEventListeners();
  
  // Export functions and state for external use
  window.enhancedServerBrowser = {
    state: serverBrowserState,
    renderFileList: renderFileList,
    toggleSelectAll: toggleSelectAll,
    clearAllSelections: clearAllSelections,
    updateSelectedFilesDisplay: updateSelectedFilesDisplay,
    updateFileCountDisplay: updateFileCountDisplay,
    loadSelectedFiles: loadSelectedFiles
  };
});