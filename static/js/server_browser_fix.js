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
    selectedFiles: [],
    viewMode: 'list', // 'list' or 'grid'
    sortBy: 'modified', // 'name', 'modified', 'size'
    sortDirection: 'desc', // 'asc' or 'desc'
    folderHistory: [],
    filter: ''
  };
  
  // Setup direct click handler
  browseButton.addEventListener('click', function(e) {
    e.preventDefault();
    console.log('Browse Server Data button clicked');
    
    try {
      // Create and show the modal directly
      const modal = new bootstrap.Modal(modalElement);
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
                <button class="btn btn-outline-secondary btn-sm" data-folder="${folder}">
                  <i class="fas fa-folder me-1"></i>${folder}
                </button>`;
            }
            folderContent += '</div></div>';
          }
          
          // Generate file listing
          folderContent += '<div><h6>Files</h6>';
          
          if (serverBrowserState.files && serverBrowserState.files.length > 0) {
            folderContent += '<table class="table table-sm table-hover">';
            folderContent += '<thead><tr><th>Name</th><th>Size</th><th>Actions</th></tr></thead><tbody>';
            
            for (const file of serverBrowserState.files) {
              folderContent += `
                <tr>
                  <td>${file.name}</td>
                  <td>${file.size_formatted || formatBytes(file.size)}</td>
                  <td>
                    <button class="btn btn-primary btn-sm" data-file-path="${file.path}">Load</button>
                  </td>
                </tr>`;
            }
            
            folderContent += '</tbody></table>';
          } else {
            folderContent += '<p class="text-muted">No files found in this location.</p>';
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
        
        // Generate file listing
        folderContent += '<div><h6>Files</h6>';
        
        if (serverBrowserState.files && serverBrowserState.files.length > 0) {
          folderContent += '<table class="table table-sm table-hover">';
          folderContent += '<thead><tr><th>Name</th><th>Size</th><th>Actions</th></tr></thead><tbody>';
          
          for (const file of serverBrowserState.files) {
            folderContent += `
              <tr>
                <td>${file.name}</td>
                <td>${file.size_formatted || formatBytes(file.size)}</td>
                <td>
                  <button class="btn btn-primary btn-sm" data-file-path="${file.path}">Load</button>
                </td>
              </tr>`;
          }
          
          folderContent += '</tbody></table>';
        } else {
          folderContent += '<p class="text-muted">No files found in this location.</p>';
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
        
        // Close modal
        const modalInstance = bootstrap.Modal.getInstance(modalElement);
        if (modalInstance) modalInstance.hide();
        
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