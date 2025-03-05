/**
 * Server Data Browser - Fix Module
 * Enhanced with proper accessibility support for modal dialog interactions
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Server browser standalone module loaded');
  
  // Get the button and modal elements
  const browseButton = document.getElementById('browse-server-data-btn');
  const modalElement = document.getElementById('serverDataModal');
  const modalCloseBtn = document.getElementById('server-modal-close-btn');
  const searchInput = document.getElementById('server-data-search');
  
  // Store the element that had focus before opening the modal
  let previousActiveElement = null;
  
  // Check if elements exist
  if (!browseButton) {
    console.error('Browse Server Data button not found!');
    return;
  }
  
  if (!modalElement) {
    console.error('Server Data Modal element not found!');
    return;
  }
  
  console.log('Elements found, setting up event listener');
  
  // Set up proper focus management for the modal
  modalElement.addEventListener('shown.bs.modal', function() {
    // Store the element that had focus before opening the modal
    previousActiveElement = document.activeElement;
    
    // Focus on the search input when modal opens for better keyboard navigation
    if (searchInput) {
      searchInput.focus();
    }
  });
  
  // Return focus to the previous element when modal closes
  modalElement.addEventListener('hidden.bs.modal', function() {
    // Return focus to the element that had focus before the modal was opened
    if (previousActiveElement) {
      previousActiveElement.focus();
    }
  });
  
  // Handle keyboard navigation within the modal
  modalElement.addEventListener('keydown', function(event) {
    // Close modal on Escape key
    if (event.key === 'Escape') {
      const bsModal = bootstrap.Modal.getInstance(modalElement);
      if (bsModal) {
        bsModal.hide();
      }
    }
  });
  
  // Initialize state
  const serverBrowserState = {
    currentFolder: 'sample_data',
    files: [],
    folders: [],
    selectedFiles: [], // Array of {path, name, size} objects for multi-selection
    viewMode: 'list', // 'list' or 'grid'
    sortBy: 'modified', // 'name', 'modified', 'size'
    sortDirection: 'desc', // 'asc' or 'desc'
    folderHistory: [],
    filter: '',
    multiSelectMode: true, // Enable multi-select by default
    currentPage: 1,
    pageSize: 50,
    totalPages: 1,
    totalFiles: 0,
    searchQuery: ''
  };
  
  // Add functions for multi-select operations
  function toggleFileSelection(filePath, fileName, fileSize) {
    const fileIndex = serverBrowserState.selectedFiles.findIndex(f => f.path === filePath);
    
    if (fileIndex === -1) {
      // Add file to selection
      serverBrowserState.selectedFiles.push({ 
        path: filePath, 
        name: fileName,
        size: fileSize
      });
    } else {
      // Remove file from selection
      serverBrowserState.selectedFiles.splice(fileIndex, 1);
    }
    
    return serverBrowserState.selectedFiles.some(f => f.path === filePath);
  }
  
  function isFileSelected(filePath) {
    return serverBrowserState.selectedFiles.some(f => f.path === filePath);
  }
  
  // Helper function to ensure the modal backdrop is removed
  function removeModalBackdrop() {
    // Get all elements with the modal-backdrop class
    const backdrops = document.querySelectorAll('.modal-backdrop');
    backdrops.forEach(backdrop => {
      backdrop.remove();
    });
    
    // Remove modal-open class from body to ensure scrolling works properly
    document.body.classList.remove('modal-open');
    document.body.style.removeProperty('overflow');
    document.body.style.removeProperty('padding-right');
  }
  
  function processSelectedFiles() {
    if (serverBrowserState.selectedFiles.length === 0) {
      alert('No files selected');
      return;
    }
    
    // Close modal with proper focus management
    const modalInstance = bootstrap.Modal.getInstance(modalElement);
    if (modalInstance) {
      // Save reference to the button that should receive focus after closing
      const focusAfterClose = document.getElementById('browse-server-data-btn');
      
      // Set event handler for hidden.bs.modal event
      modalElement.addEventListener('hidden.bs.modal', function onModalHidden() {
        // Remove the event listener to avoid multiple registrations
        modalElement.removeEventListener('hidden.bs.modal', onModalHidden);
        
        // Manually remove any remaining modal backdrops
        removeModalBackdrop();
        
        // Set focus back to the original button to fix accessibility issues
        if (focusAfterClose) {
          setTimeout(() => {
            focusAfterClose.focus();
          }, 10);
        }
      }, { once: true });
      
      // Hide the modal
      modalInstance.hide();
      
      // Also manually remove backdrop after a short delay as a fallback
      setTimeout(removeModalBackdrop, 300);
    }
    
    // Show success message
    if (typeof showMessage === 'function') {
      showMessage(`Processing ${serverBrowserState.selectedFiles.length} selected file(s)...`, 'info');
    }
    
    // Process files one by one
    processNextFile(0);
  }
  
  function processNextFile(index) {
    if (index >= serverBrowserState.selectedFiles.length) {
      // All files processed
      if (typeof showMessage === 'function') {
        showMessage(`All ${serverBrowserState.selectedFiles.length} file(s) processed successfully`, 'success');
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
        // Process the file
        if (typeof processData === 'function' && typeof addTrajectory === 'function') {
          // First process the data to normalize it
          const processedData = processData(data.data);
          
          // Generate a random color for the trajectory
          const randomColor = Math.random() * 0xffffff;
          
          // Add the trajectory to the visualization
          addTrajectory(processedData, file.name, randomColor);
          
          // Update UI elements
          if (typeof updateTrajectoryList === 'function') {
            updateTrajectoryList();
          }
          
          if (typeof updateTimeSlider === 'function') {
            updateTimeSlider();
          }
          
          // Process next file
          processNextFile(index + 1);
        } else {
          console.error('Required visualization functions not found');
          processNextFile(index + 1);
        }
      })
      .catch(error => {
        console.error(`Error processing file ${file.name}:`, error);
        
        // Show error message
        if (typeof showMessage === 'function') {
          showMessage(`Error processing file ${file.name}: ${error.message}`, 'danger');
        }
        
        // Continue with next file
        processNextFile(index + 1);
      });
  }
  
  // Setup direct click handler
  browseButton.addEventListener('click', function(e) {
    e.preventDefault();
    console.log('Browse Server Data button clicked');
    
    try {
      // Create and show the modal directly with proper accessibility handling
      const modal = new bootstrap.Modal(modalElement, {
        backdrop: true,
        keyboard: true,
        focus: true
      });
      
      // Add event listener for when modal is shown
      modalElement.addEventListener('shown.bs.modal', function() {
        // Set focus to the search input for better accessibility
        const searchInput = document.getElementById('server-data-search');
        if (searchInput) {
          searchInput.focus();
        }
        console.log('Modal shown and focus set to search input');
      });
      
      modal.show();
      console.log('Modal shown successfully');
      
      // Get modal elements
      const loadingIndicator = document.getElementById('server-data-loading');
      const errorContainer = document.getElementById('server-data-error-container');
      const errorText = document.getElementById('server-data-error');
      const contentContainer = document.getElementById('server-data-content');
      
      // Reset UI
      if (loadingIndicator) loadingIndicator.classList.remove('d-none');
      if (errorContainer) errorContainer.classList.add('d-none');
      if (contentContainer) contentContainer.classList.add('d-none');
      
      // Fetch data from server with pagination parameters
      fetch(`/browse_data?page=${serverBrowserState.currentPage}&page_size=${serverBrowserState.pageSize}&search=${encodeURIComponent(serverBrowserState.searchQuery)}`)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Server error: ${response.status} ${response.statusText}`);
          }
          return response.json();
        })
        .then(data => {
          console.log('Server data received:', data);
          
          // Update state
          serverBrowserState.currentFolder = data.current_folder || 'sample_data';
          serverBrowserState.files = data.files || [];
          serverBrowserState.folders = data.folders || [];
          
          // Generate UI content
          let folderContent = '';
          
          // Generate breadcrumb with refresh button
          folderContent += `<div class="d-flex justify-content-between align-items-center mb-3">
            <nav aria-label="breadcrumb" class="mb-0">
              <ol class="breadcrumb mb-0">
                <li class="breadcrumb-item"><a href="#" data-folder="sample_data" aria-label="Navigate to root folder">Root</a></li>
                <li class="breadcrumb-item active" aria-current="page">${serverBrowserState.currentFolder}</li>
              </ol>
            </nav>
            <button id="refresh-folder" class="btn btn-outline-secondary btn-sm" aria-label="Refresh folder">
              <i class="fas fa-sync-alt" aria-hidden="true"></i> Refresh
            </button>
          </div>`;
          
          // Generate folder buttons
          if (serverBrowserState.folders && serverBrowserState.folders.length > 0) {
            folderContent += '<div class="mb-3"><h6>Folders</h6><div class="d-flex flex-wrap gap-2">';
            for (const folder of serverBrowserState.folders) {
              folderContent += `
                <button class="btn btn-outline-secondary btn-sm" data-folder="${folder}" aria-label="Open folder ${folder}">
                  <i class="fas fa-folder me-1" aria-hidden="true"></i>${folder}
                </button>`;
            }
            folderContent += '</div></div>';
          }
          
          // Add multi-select controls
          folderContent += `
          <div class="d-flex justify-content-between align-items-center mb-2">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="toggle-multi-select"
                aria-describedby="toggle-multi-select-description">
              <label class="form-check-label" for="toggle-multi-select">
                Multi-select mode ${serverBrowserState.multiSelectMode ? '(on)' : '(off)'}
              </label>
              <div id="toggle-multi-select-description" class="form-text visually-hidden">
                Enable to select multiple files at once
              </div>
            </div>
            <button id="process-selected-files" class="btn btn-success btn-sm" 
              ${serverBrowserState.selectedFiles.length === 0 ? 'disabled' : ''} 
              aria-label="Process ${serverBrowserState.selectedFiles.length} selected files">
              <i class="fas fa-chart-line me-1" aria-hidden="true"></i>
              Process ${serverBrowserState.selectedFiles.length} Selected File(s)
            </button>
          </div>`;
          
          // Generate file listing
          folderContent += '<div><h6>Files</h6>';
          
          if (serverBrowserState.files && serverBrowserState.files.length > 0) {
            folderContent += '<table class="table table-sm table-hover">';
            folderContent += '<thead><tr>';
            
            // Add selection column if multi-select is enabled
            if (serverBrowserState.multiSelectMode) {
              folderContent += '<th><div class="form-check"><input type="checkbox" id="select-all-files" class="form-check-input" aria-label="Select all files"><label class="visually-hidden" for="select-all-files">Select all files</label></div></th>';
            }
            
            folderContent += '<th>Name</th><th>Size</th><th>Actions</th></tr></thead><tbody>';
            
            for (const file of serverBrowserState.files) {
              // Check if file is already selected
              const isSelected = isFileSelected(file.path);
              
              folderContent += `
                <tr ${isSelected ? 'class="table-primary"' : ''}>`;
                
              // Add checkbox if multi-select is enabled
              if (serverBrowserState.multiSelectMode) {
                folderContent += `
                  <td>
                    <div class="form-check">
                      <input type="checkbox" id="file-checkbox-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}" 
                        class="form-check-input file-select-checkbox" 
                        data-file-path="${file.path}" 
                        data-file-name="${file.name}"
                        data-file-size="${file.size}"
                        ${isSelected ? 'checked' : ''} 
                        aria-label="Select ${file.name}">
                      <label class="visually-hidden" for="file-checkbox-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}">
                        Select ${file.name}
                      </label>
                    </div>
                  </td>`;
              }
              
              folderContent += `
                  <td>${file.name}</td>
                  <td>${file.size_formatted || formatBytes(file.size)}</td>
                  <td>
                    <button class="btn btn-primary btn-sm" data-file-path="${file.path}" aria-label="Load file ${file.name}">
                      <i class="fas fa-upload me-1" aria-hidden="true"></i>Load
                    </button>
                  </td>
                </tr>`;
            }
            
            folderContent += '</tbody></table>';
          } else {
            folderContent += '<p class="text-muted">No files found in this location.</p>';
          }
          
          // Display currently selected files
          if (serverBrowserState.selectedFiles.length > 0) {
            folderContent += '<div class="mt-3 p-2 bg-light rounded">';
            folderContent += '<h6>Selected Files:</h6>';
            folderContent += '<ul class="list-group list-group-flush">';
            
            for (const file of serverBrowserState.selectedFiles) {
              folderContent += `
                <li class="list-group-item d-flex justify-content-between align-items-center py-1">
                  ${file.name}
                  <button class="btn btn-sm btn-outline-danger remove-selection" 
                    data-file-path="${file.path}"
                    aria-label="Remove ${file.name} from selection">
                    <i class="fas fa-times" aria-hidden="true"></i> Remove
                  </button>
                </li>`;
            }
            
            folderContent += '</ul></div>';
          }
          
          folderContent += '</div>';
          
          // Update the UI
          if (contentContainer) {
            contentContainer.innerHTML = folderContent;
            contentContainer.classList.remove('d-none');
            
            // Add event listeners to file load buttons
            const loadButtons = contentContainer.querySelectorAll('button[data-file-path]');
            loadButtons.forEach(button => {
              button.addEventListener('click', function() {
                const filePath = this.getAttribute('data-file-path');
                loadServerFile(filePath);
              });
            });
            
            // Add event listeners to folder buttons
            const folderButtons = contentContainer.querySelectorAll('button[data-folder]');
            folderButtons.forEach(button => {
              button.addEventListener('click', function() {
                const folderName = this.getAttribute('data-folder');
                navigateToFolder(folderName);
              });
            });
            
            // Add event listener to refresh button
            const refreshButton = contentContainer.querySelector('#refresh-folder');
            if (refreshButton) {
              refreshButton.addEventListener('click', function() {
                // Add spinning animation to the icon
                const icon = this.querySelector('i');
                if (icon) {
                  icon.classList.add('fa-spin');
                  // Remove the spinning animation after 1.5 seconds
                  setTimeout(() => {
                    icon.classList.remove('fa-spin');
                  }, 1500);
                }
                
                // Show a refreshing message
                if (typeof showMessage === 'function') {
                  showMessage('Refreshing folder contents...', 'info');
                }
                
                // Refresh the current folder
                navigateToFolder(serverBrowserState.currentFolder);
              });
            };
            
            // Add event listeners for multi-select functionality
            
            // Toggle multi-select mode
            const toggleMultiSelect = contentContainer.querySelector('#toggle-multi-select');
            if (toggleMultiSelect) {
              toggleMultiSelect.checked = serverBrowserState.multiSelectMode;
              toggleMultiSelect.addEventListener('change', function() {
                serverBrowserState.multiSelectMode = this.checked;
                // Re-render the UI
                navigateToFolder(serverBrowserState.currentFolder);
              });
            }
            
            // Process selected files button
            const processButton = contentContainer.querySelector('#process-selected-files');
            if (processButton) {
              processButton.addEventListener('click', function() {
                processSelectedFiles();
              });
            }
            
            // Select all files checkbox
            const selectAllFiles = contentContainer.querySelector('#select-all-files');
            if (selectAllFiles) {
              selectAllFiles.addEventListener('change', function() {
                const isChecked = this.checked;
                const fileCheckboxes = contentContainer.querySelectorAll('.file-select-checkbox');
                
                fileCheckboxes.forEach(checkbox => {
                  const filePath = checkbox.getAttribute('data-file-path');
                  const fileName = checkbox.getAttribute('data-file-name');
                  const fileSize = checkbox.getAttribute('data-file-size');
                  
                  checkbox.checked = isChecked;
                  
                  if (isChecked && !isFileSelected(filePath)) {
                    toggleFileSelection(filePath, fileName, fileSize);
                  } else if (!isChecked && isFileSelected(filePath)) {
                    toggleFileSelection(filePath, fileName, fileSize);
                  }
                });
                
                // Update UI by reloading the folder
                navigateToFolder(serverBrowserState.currentFolder);
              });
            }
            
            // Individual file checkboxes
            const fileCheckboxes = contentContainer.querySelectorAll('.file-select-checkbox');
            fileCheckboxes.forEach(checkbox => {
              checkbox.addEventListener('change', function() {
                const filePath = this.getAttribute('data-file-path');
                const fileName = this.getAttribute('data-file-name');
                const fileSize = this.getAttribute('data-file-size');
                
                toggleFileSelection(filePath, fileName, fileSize);
                
                // Update UI (highlight row)
                const row = this.closest('tr');
                if (row) {
                  if (this.checked) {
                    row.classList.add('table-primary');
                  } else {
                    row.classList.remove('table-primary');
                  }
                }
                
                // Update process button state
                if (processButton) {
                  processButton.disabled = serverBrowserState.selectedFiles.length === 0;
                  processButton.textContent = `Process ${serverBrowserState.selectedFiles.length} Selected File(s)`;
                }
              });
            });
            
            // Remove selection buttons
            const removeSelectionButtons = contentContainer.querySelectorAll('.remove-selection');
            removeSelectionButtons.forEach(button => {
              button.addEventListener('click', function() {
                const filePath = this.getAttribute('data-file-path');
                
                // Remove from selection
                toggleFileSelection(filePath);
                
                // Update UI by reloading the folder
                navigateToFolder(serverBrowserState.currentFolder);
              });
            });
          }
          
          // Hide loading indicator
          if (loadingIndicator) loadingIndicator.classList.add('d-none');
        })
        .catch(error => {
          console.error('Error fetching server data:', error);
          
          // Show error message
          if (errorText) errorText.textContent = `Error loading files: ${error.message}`;
          if (errorContainer) errorContainer.classList.remove('d-none');
          if (loadingIndicator) loadingIndicator.classList.add('d-none');
        });
    } catch (error) {
      console.error('Error showing modal:', error);
    }
  });
  
  // Helper function to navigate to a folder
  function navigateToFolder(folderName) {
    console.log(`Navigating to folder: ${folderName}`);
    
    const loadingIndicator = document.getElementById('server-data-loading');
    const errorContainer = document.getElementById('server-data-error-container');
    const contentContainer = document.getElementById('server-data-content');
    
    // Show loading indicator
    if (loadingIndicator) loadingIndicator.classList.remove('d-none');
    if (contentContainer) contentContainer.classList.add('d-none');
    if (errorContainer) errorContainer.classList.add('d-none');
    
    // Reset to page 1 when navigating to a new folder
    serverBrowserState.currentPage = 1;
    
    // Update URL with folder parameter and pagination
    const url = `/browse_data?folder=${encodeURIComponent(folderName)}&page=${serverBrowserState.currentPage}&page_size=${serverBrowserState.pageSize}&search=${encodeURIComponent(serverBrowserState.searchQuery)}`;
    
    // Fetch data from server
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('Folder data received:', data);
        
        // Update state
        serverBrowserState.currentFolder = data.current_folder || folderName;
        serverBrowserState.files = data.files || [];
        serverBrowserState.folders = data.folders || [];
        
        // Update pagination state if available
        if (data.pagination) {
          serverBrowserState.currentPage = data.pagination.page || 1;
          serverBrowserState.pageSize = data.pagination.page_size || 50;
          serverBrowserState.totalPages = data.pagination.total_pages || 1;
          serverBrowserState.totalFiles = data.pagination.total_files || serverBrowserState.files.length;
        }
        
        // Update UI (reusing the same structure as above)
        let folderContent = '';
        
        // Generate breadcrumb with refresh button
        folderContent += `<div class="d-flex justify-content-between align-items-center mb-3">
          <nav aria-label="breadcrumb" class="mb-0">
            <ol class="breadcrumb mb-0">
              <li class="breadcrumb-item"><a href="#" data-folder="sample_data" aria-label="Navigate to root folder">Root</a></li>
              <li class="breadcrumb-item active" aria-current="page">${serverBrowserState.currentFolder}</li>
            </ol>
          </nav>
          <button id="refresh-folder" class="btn btn-outline-secondary btn-sm" aria-label="Refresh folder">
            <i class="fas fa-sync-alt" aria-hidden="true"></i> Refresh
          </button>
        </div>`;
        
        // Add search input
        folderContent += `
        <div class="mb-3">
          <div class="input-group">
            <input type="text" id="server-data-search" class="form-control" placeholder="Search files..." aria-label="Search files" 
              value="${serverBrowserState.searchQuery}">
            <button class="btn btn-outline-secondary" type="button" id="search-button" aria-label="Search">
              <i class="fas fa-search" aria-hidden="true"></i>
            </button>
          </div>
          <div class="form-text" id="search-results-count">
            ${serverBrowserState.totalFiles > 0 ? 
              `Showing ${serverBrowserState.files.length} of ${serverBrowserState.totalFiles} files` : 
              'No files found'}
          </div>
        </div>`;
        
        // Generate folder buttons
        if (serverBrowserState.folders && serverBrowserState.folders.length > 0) {
          folderContent += '<div class="mb-3"><h6>Folders</h6><div class="d-flex flex-wrap gap-2">';
          for (const folder of serverBrowserState.folders) {
            folderContent += `
              <button class="btn btn-outline-secondary btn-sm" data-folder="${folder}" aria-label="Open folder ${folder}">
                <i class="fas fa-folder me-1" aria-hidden="true"></i>${folder}
              </button>`;
          }
          folderContent += '</div></div>';
        }
        
        // Add multi-select and view mode controls
        folderContent += `
        <div class="d-flex justify-content-between align-items-center mb-2">
          <div class="d-flex gap-3">
            <div class="form-check">
              <input class="form-check-input" type="checkbox" id="toggle-multi-select"
                aria-describedby="toggle-multi-select-description">
              <label class="form-check-label" for="toggle-multi-select">
                Multi-select mode ${serverBrowserState.multiSelectMode ? '(on)' : '(off)'}
              </label>
              <div id="toggle-multi-select-description" class="form-text visually-hidden">
                Enable to select multiple files at once
              </div>
            </div>
            <div class="btn-group" role="group" aria-label="View mode">
              <button type="button" class="btn btn-sm btn-outline-secondary ${serverBrowserState.viewMode === 'list' ? 'active' : ''}" 
                id="list-view-btn" aria-label="List view">
                <i class="fas fa-list" aria-hidden="true"></i>
              </button>
              <button type="button" class="btn btn-sm btn-outline-secondary ${serverBrowserState.viewMode === 'grid' ? 'active' : ''}" 
                id="grid-view-btn" aria-label="Grid view">
                <i class="fas fa-th" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <button id="process-selected-files" class="btn btn-success btn-sm" 
            ${serverBrowserState.selectedFiles.length === 0 ? 'disabled' : ''} 
            aria-label="Process ${serverBrowserState.selectedFiles.length} selected files">
            <i class="fas fa-chart-line me-1" aria-hidden="true"></i>
            Process ${serverBrowserState.selectedFiles.length} Selected File(s)
          </button>
        </div>`;
        
        // Generate file listing
        folderContent += '<div><h6>Files</h6>';
        
        if (serverBrowserState.files && serverBrowserState.files.length > 0) {
          if (serverBrowserState.viewMode === 'grid') {
            // Grid view
            folderContent += '<div class="row row-cols-1 row-cols-sm-2 row-cols-md-3 row-cols-lg-4 g-3">';
            
            for (const file of serverBrowserState.files) {
              // Check if file is already selected
              const isSelected = isFileSelected(file.path);
              
              folderContent += `
                <div class="col">
                  <div class="card h-100 ${isSelected ? 'border-primary' : ''}">
                    <div class="card-body">
                      <div class="d-flex justify-content-between align-items-start">
                        <h6 class="card-title text-truncate" title="${file.name}">${file.name}</h6>
                        ${serverBrowserState.multiSelectMode ? `
                          <div class="form-check">
                            <input type="checkbox" id="grid-file-checkbox-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}" 
                              class="form-check-input file-select-checkbox" 
                              data-file-path="${file.path}" 
                              data-file-name="${file.name}"
                              data-file-size="${file.size}"
                              ${isSelected ? 'checked' : ''} 
                              aria-label="Select ${file.name}">
                            <label class="visually-hidden" for="grid-file-checkbox-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}">
                              Select ${file.name}
                            </label>
                          </div>
                        ` : ''}
                      </div>
                      <p class="card-text mb-1">
                        <small class="text-muted">${file.size_formatted || formatBytes(file.size)}</small>
                      </p>
                    </div>
                    <div class="card-footer bg-transparent border-top-0">
                      <button class="btn btn-primary btn-sm w-100" data-file-path="${file.path}" aria-label="Load file ${file.name}">
                        <i class="fas fa-upload me-1" aria-hidden="true"></i>Load
                      </button>
                    </div>
                  </div>
                </div>`;
            }
            
            folderContent += '</div>';
          } else {
            // List view (default)
            folderContent += '<table class="table table-sm table-hover">';
            folderContent += '<thead><tr>';
            
            // Add selection column if multi-select is enabled
            if (serverBrowserState.multiSelectMode) {
              folderContent += '<th><div class="form-check"><input type="checkbox" id="select-all-files" class="form-check-input" aria-label="Select all files"><label class="visually-hidden" for="select-all-files">Select all files</label></div></th>';
            }
            
            folderContent += '<th>Name</th><th>Size</th><th>Actions</th></tr></thead><tbody>';
            
            for (const file of serverBrowserState.files) {
              // Check if file is already selected
              const isSelected = isFileSelected(file.path);
              
              folderContent += `
                <tr ${isSelected ? 'class="table-primary"' : ''}>`;
                
              // Add checkbox if multi-select is enabled
              if (serverBrowserState.multiSelectMode) {
                folderContent += `
                  <td>
                    <div class="form-check">
                      <input type="checkbox" id="file-checkbox-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}" 
                        class="form-check-input file-select-checkbox" 
                        data-file-path="${file.path}" 
                        data-file-name="${file.name}"
                        data-file-size="${file.size}"
                        ${isSelected ? 'checked' : ''} 
                        aria-label="Select ${file.name}">
                      <label class="visually-hidden" for="file-checkbox-${file.name.replace(/[^a-zA-Z0-9]/g, '-')}">
                        Select ${file.name}
                      </label>
                    </div>
                  </td>`;
              }
              
              folderContent += `
                  <td>${file.name}</td>
                  <td>${file.size_formatted || formatBytes(file.size)}</td>
                  <td>
                    <button class="btn btn-primary btn-sm" data-file-path="${file.path}" aria-label="Load file ${file.name}">
                        <i class="fas fa-upload me-1" aria-hidden="true"></i>Load
                    </button>
                  </td>
                </tr>`;
            }
            
            folderContent += '</tbody></table>';
          }
        } else {
          folderContent += '<p class="text-muted">No files found in this location.</p>';
        }
        
        // Add pagination controls
        if (serverBrowserState.totalPages > 1) {
          folderContent += `
          <nav aria-label="File pagination" class="mt-3">
            <ul class="pagination justify-content-center pagination-sm">
              <li class="page-item ${serverBrowserState.currentPage <= 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" aria-label="First page" data-page="1">
                  <span aria-hidden="true">&laquo;&laquo;</span>
                </a>
              </li>
              <li class="page-item ${serverBrowserState.currentPage <= 1 ? 'disabled' : ''}">
                <a class="page-link" href="#" aria-label="Previous page" data-page="${serverBrowserState.currentPage - 1}">
                  <span aria-hidden="true">&laquo;</span>
                </a>
              </li>`;
              
          // Generate page numbers
          const startPage = Math.max(1, serverBrowserState.currentPage - 2);
          const endPage = Math.min(serverBrowserState.totalPages, startPage + 4);
          
          for (let page = startPage; page <= endPage; page++) {
            folderContent += `
              <li class="page-item ${page === serverBrowserState.currentPage ? 'active' : ''}">
                <a class="page-link" href="#" data-page="${page}">${page}</a>
              </li>`;
          }
          
          folderContent += `
              <li class="page-item ${serverBrowserState.currentPage >= serverBrowserState.totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" aria-label="Next page" data-page="${serverBrowserState.currentPage + 1}">
                  <span aria-hidden="true">&raquo;</span>
                </a>
              </li>
              <li class="page-item ${serverBrowserState.currentPage >= serverBrowserState.totalPages ? 'disabled' : ''}">
                <a class="page-link" href="#" aria-label="Last page" data-page="${serverBrowserState.totalPages}">
                  <span aria-hidden="true">&raquo;&raquo;</span>
                </a>
              </li>
            </ul>
          </nav>`;
        }
        
        // Display currently selected files
        if (serverBrowserState.selectedFiles.length > 0) {
          folderContent += '<div class="mt-3 p-2 bg-light rounded">';
          folderContent += '<h6>Selected Files:</h6>';
          folderContent += '<ul class="list-group list-group-flush">';
          
          for (const file of serverBrowserState.selectedFiles) {
            folderContent += `
              <li class="list-group-item d-flex justify-content-between align-items-center py-1">
                ${file.name}
                <button class="btn btn-sm btn-outline-danger remove-selection" 
                  data-file-path="${file.path}" 
                  aria-label="Remove ${file.name} from selection">
                  <i class="fas fa-times" aria-hidden="true"></i> Remove
                </button>
              </li>`;
          }
          
          folderContent += '</ul></div>';
        }
        
        folderContent += '</div>';
        
        // Update the UI
        if (contentContainer) {
          contentContainer.innerHTML = folderContent;
          contentContainer.classList.remove('d-none');
          
          // Add event listeners to file load buttons
          const loadButtons = contentContainer.querySelectorAll('button[data-file-path]');
          loadButtons.forEach(button => {
            button.addEventListener('click', function() {
              const filePath = this.getAttribute('data-file-path');
              loadServerFile(filePath);
            });
          });
          
          // Add event listeners to folder buttons
          const folderButtons = contentContainer.querySelectorAll('button[data-folder]');
          folderButtons.forEach(button => {
            button.addEventListener('click', function() {
              const folderName = this.getAttribute('data-folder');
              navigateToFolder(folderName);
            });
          });
          
          // Add event listeners to breadcrumb links
          const breadcrumbLinks = contentContainer.querySelectorAll('.breadcrumb-item a');
          breadcrumbLinks.forEach(link => {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              const folderName = this.getAttribute('data-folder');
              navigateToFolder(folderName);
            });
          });
          
          // Add event listeners to pagination controls
          const pageLinks = contentContainer.querySelectorAll('.pagination .page-link');
          pageLinks.forEach(link => {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              const page = parseInt(this.getAttribute('data-page'), 10);
              if (!isNaN(page)) {
                // Update state and reload with new page
                serverBrowserState.currentPage = page;
                navigateToFolder(serverBrowserState.currentFolder);
              }
            });
          });
          
          // Add event listener to search input and button
          const searchInput = contentContainer.querySelector('#server-data-search');
          const searchButton = contentContainer.querySelector('#search-button');
          
          if (searchInput && searchButton) {
            // Set up search button click handler
            searchButton.addEventListener('click', function() {
              serverBrowserState.searchQuery = searchInput.value.trim();
              serverBrowserState.currentPage = 1; // Reset to first page on new search
              navigateToFolder(serverBrowserState.currentFolder);
            });
            
            // Set up search input enter key handler
            searchInput.addEventListener('keyup', function(e) {
              if (e.key === 'Enter') {
                serverBrowserState.searchQuery = this.value.trim();
                serverBrowserState.currentPage = 1; // Reset to first page on new search
                navigateToFolder(serverBrowserState.currentFolder);
              }
            });
          }
          
          // Add event listener to refresh button
          const refreshButton = contentContainer.querySelector('#refresh-folder');
          if (refreshButton) {
            refreshButton.addEventListener('click', function() {
              // Add spinning animation to the icon
              const icon = this.querySelector('i');
              if (icon) {
                icon.classList.add('fa-spin');
                // Remove the spinning animation after 1.5 seconds
                setTimeout(() => {
                  icon.classList.remove('fa-spin');
                }, 1500);
              }
              
              // Show a refreshing message
              if (typeof showMessage === 'function') {
                showMessage('Refreshing folder contents...', 'info');
              }
              
              // Refresh the current folder
              navigateToFolder(serverBrowserState.currentFolder);
            });
          }
          
          // Add event listeners to view mode toggle buttons
          const listViewBtn = contentContainer.querySelector('#list-view-btn');
          const gridViewBtn = contentContainer.querySelector('#grid-view-btn');
          
          if (listViewBtn && gridViewBtn) {
            // List view button
            listViewBtn.addEventListener('click', function() {
              if (serverBrowserState.viewMode !== 'list') {
                serverBrowserState.viewMode = 'list';
                navigateToFolder(serverBrowserState.currentFolder);
              }
            });
            
            // Grid view button
            gridViewBtn.addEventListener('click', function() {
              if (serverBrowserState.viewMode !== 'grid') {
                serverBrowserState.viewMode = 'grid';
                navigateToFolder(serverBrowserState.currentFolder);
              }
            });
          }
          
          // Add event listeners for multi-select functionality
          
          // Toggle multi-select mode
          const toggleMultiSelect = contentContainer.querySelector('#toggle-multi-select');
          if (toggleMultiSelect) {
            toggleMultiSelect.checked = serverBrowserState.multiSelectMode;
            toggleMultiSelect.addEventListener('change', function() {
              serverBrowserState.multiSelectMode = this.checked;
              // Re-render to show/hide checkboxes
              navigateToFolder(serverBrowserState.currentFolder);
            });
          }
          
          // Process selected files button
          const processButton = contentContainer.querySelector('#process-selected-files');
          if (processButton) {
            processButton.addEventListener('click', function() {
              processSelectedFiles();
            });
          }
          
          // Select all files checkbox
          const selectAllFiles = contentContainer.querySelector('#select-all-files');
          if (selectAllFiles) {
            selectAllFiles.addEventListener('change', function() {
              const isChecked = this.checked;
              const fileCheckboxes = contentContainer.querySelectorAll('.file-select-checkbox');
              
              fileCheckboxes.forEach(checkbox => {
                const filePath = checkbox.getAttribute('data-file-path');
                const fileName = checkbox.getAttribute('data-file-name');
                const fileSize = checkbox.getAttribute('data-file-size');
                
                checkbox.checked = isChecked;
                
                if (isChecked && !isFileSelected(filePath)) {
                  toggleFileSelection(filePath, fileName, fileSize);
                } else if (!isChecked && isFileSelected(filePath)) {
                  toggleFileSelection(filePath, fileName, fileSize);
                }
              });
              
              // Update UI by reloading the folder
              navigateToFolder(serverBrowserState.currentFolder);
            });
          }
          
          // Individual file checkboxes
          const fileCheckboxes = contentContainer.querySelectorAll('.file-select-checkbox');
          fileCheckboxes.forEach(checkbox => {
            checkbox.addEventListener('change', function() {
              const filePath = this.getAttribute('data-file-path');
              const fileName = this.getAttribute('data-file-name');
              const fileSize = this.getAttribute('data-file-size');
              
              toggleFileSelection(filePath, fileName, fileSize);
              
              // Update UI (highlight row)
              const row = this.closest('tr');
              if (row) {
                if (this.checked) {
                  row.classList.add('table-primary');
                } else {
                  row.classList.remove('table-primary');
                }
              }
              
              // Update process button state
              if (processButton) {
                processButton.disabled = serverBrowserState.selectedFiles.length === 0;
                processButton.textContent = `Process ${serverBrowserState.selectedFiles.length} Selected File(s)`;
              }
            });
          });
          
          // Remove selection buttons
          const removeSelectionButtons = contentContainer.querySelectorAll('.remove-selection');
          removeSelectionButtons.forEach(button => {
            button.addEventListener('click', function() {
              const filePath = this.getAttribute('data-file-path');
              
              // Remove from selection
              toggleFileSelection(filePath);
              
              // Update UI by reloading the folder
              navigateToFolder(serverBrowserState.currentFolder);
            });
          });
        }
        
        // Hide loading indicator
        if (loadingIndicator) loadingIndicator.classList.add('d-none');
      })
      .catch(error => {
        console.error('Error fetching folder data:', error);
        
        // Show error message
        const errorText = document.getElementById('server-data-error');
        if (errorText) errorText.textContent = `Error loading folder: ${error.message}`;
        if (errorContainer) errorContainer.classList.remove('d-none');
        if (loadingIndicator) loadingIndicator.classList.add('d-none');
      });
  }
  
  // Helper function to load a server file
  function loadServerFile(filePath) {
    console.log(`Loading server file: ${filePath}`);
    
    const loadingIndicator = document.getElementById('server-data-loading');
    const errorContainer = document.getElementById('server-data-error-container');
    
    // Show loading indicator
    if (loadingIndicator) {
      loadingIndicator.classList.remove('d-none');
      // Update loading message for screen readers
      const loadingMessage = document.getElementById('loading-message');
      if (loadingMessage) {
        loadingMessage.textContent = 'Loading data from server. Please wait...';
      }
    }
    if (errorContainer) errorContainer.classList.add('d-none');
    
    // Update URL with file parameter
    const url = `/get_server_file?path=${encodeURIComponent(filePath)}`;
    
    // Fetch data from server
    fetch(url)
      .then(response => {
        if (!response.ok) {
          throw new Error(`Server error: ${response.status} ${response.statusText}`);
        }
        return response.json();
      })
      .then(data => {
        console.log('File loaded successfully:', data);
        
        // Close modal with proper focus management
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) {
          // Save reference to the button that should receive focus after closing
          const focusAfterClose = document.getElementById('browse-server-data-btn');
          
          // Set event handler for hidden.bs.modal event
          modalElement.addEventListener('hidden.bs.modal', function onModalHidden() {
            // Remove the event listener to avoid multiple registrations
            modalElement.removeEventListener('hidden.bs.modal', onModalHidden);
            
            // Manually remove any remaining modal backdrops
            removeModalBackdrop();
            
            // Set focus back to the original button to fix accessibility issues
            if (focusAfterClose) {
              setTimeout(() => {
                focusAfterClose.focus();
              }, 10);
            }
          }, { once: true });
          
          // Hide the modal
          modalInstance.hide();
          
          // Also manually remove backdrop after a short delay as a fallback
          setTimeout(removeModalBackdrop, 300);
        }
        
        // Show success message using the global showMessage function if available
        if (typeof showMessage === 'function') {
          showMessage(`File loaded successfully: ${filePath.split('/').pop()}`, 'success');
        } else {
          alert(`File loaded successfully: ${filePath.split('/').pop()}`);
        }
        
        // Process data for visualization if the global functions exist
        if (typeof processData === 'function' && typeof addTrajectory === 'function') {
          // First process the data to normalize it
          const processedData = processData(data.data);
          
          // Generate a random color for the trajectory
          const randomColor = Math.random() * 0xffffff;
          
          // Extract file name from the path
          const fileName = filePath.split('/').pop();
          
          // Add the trajectory to the visualization
          addTrajectory(processedData, fileName, randomColor);
          
          // Update UI elements if needed
          if (typeof updateTrajectoryList === 'function') {
            updateTrajectoryList();
          }
          
          // Update slider range if needed
          if (typeof updateTimeSlider === 'function') {
            updateTimeSlider();
          }
        } else {
          console.error('Required visualization functions not found - cannot visualize the data');
        }
      })
      .catch(error => {
        console.error('Error loading file:', error);
        
        // Show error message
        const errorText = document.getElementById('server-data-error');
        if (errorText) errorText.textContent = `Error loading file: ${error.message}`;
        if (errorContainer) errorContainer.classList.remove('d-none');
        if (loadingIndicator) loadingIndicator.classList.add('d-none');
      });
  }
  
  // Helper function to format bytes
  function formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
  
  console.log('Server browser standalone setup complete');
});