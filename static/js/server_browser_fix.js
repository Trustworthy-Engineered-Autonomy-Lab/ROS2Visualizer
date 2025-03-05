/**
 * Server Data Browser - Fix Module
 * This is a complete standalone implementation to solve the modal display issue
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Server browser standalone module loaded');
  
  // Get the button and modal elements
  const browseButton = document.getElementById('browse-server-data-btn');
  const modalElement = document.getElementById('serverDataModal');
  
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
    multiSelectMode: true // Enable multi-select by default
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
        
        // Set focus back to the original button to fix accessibility issues
        if (focusAfterClose) {
          setTimeout(() => {
            focusAfterClose.focus();
          }, 10);
        }
      }, { once: true });
      
      // Hide the modal
      modalInstance.hide();
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
      
      // Fetch data from server
      fetch('/browse_data')
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
              <input class="form-check-input" type="checkbox" id="toggle-multi-select">
              <label class="form-check-label" for="toggle-multi-select">
                Multi-select mode ${serverBrowserState.multiSelectMode ? '(on)' : '(off)'}
              </label>
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
              folderContent += '<th><input type="checkbox" id="select-all-files" class="form-check-input"></th>';
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
    
    // Update URL with folder parameter
    const url = `/browse_data?folder=${encodeURIComponent(folderName)}`;
    
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
        
        // Update UI (reusing the same structure as above)
        let folderContent = '';
        
        // Generate breadcrumb
        folderContent += `<nav aria-label="breadcrumb" class="mb-3">
          <ol class="breadcrumb">
            <li class="breadcrumb-item"><a href="#" data-folder="sample_data">Root</a></li>
            <li class="breadcrumb-item active">${serverBrowserState.currentFolder}</li>
          </ol>
        </nav>`;
        
        // Generate folder buttons
        if (serverBrowserState.folders && serverBrowserState.folders.length > 0) {
          folderContent += '<div class="mb-3"><h6>Folders</h6><div class="d-flex flex-wrap gap-2">';
          for (const folder of serverBrowserState.folders) {
            folderContent += `
              <button class="btn btn-outline-secondary btn-sm" data-folder="${folder}">
                <i class="fas fa-folder me-1"></i>${folder}
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
            folderContent += '<th><input type="checkbox" id="select-all-files" class="form-check-input"></th>';
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
          
          // Add event listeners to breadcrumb links
          const breadcrumbLinks = contentContainer.querySelectorAll('.breadcrumb-item a');
          breadcrumbLinks.forEach(link => {
            link.addEventListener('click', function(e) {
              e.preventDefault();
              const folderName = this.getAttribute('data-folder');
              navigateToFolder(folderName);
            });
          });
          
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
    if (loadingIndicator) loadingIndicator.classList.remove('d-none');
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
            
            // Set focus back to the original button to fix accessibility issues
            if (focusAfterClose) {
              setTimeout(() => {
                focusAfterClose.focus();
              }, 10);
            }
          }, { once: true });
          
          // Hide the modal
          modalInstance.hide();
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