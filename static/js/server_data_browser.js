/**
 * Server Data Browser JavaScript Module
 * Handles the enhanced data browsing interface functionality
 */

// Initialize shared variables
let serverDataModal = null;
let serverDataBrowser = {
  currentFolder: 'sample_data',
  folders: [],
  files: [],
  selectedFiles: [],
  viewMode: 'list',
  sortOption: 'date-desc',
  searchQuery: '',
  currentFilePreview: null
};

// Direct DOM access function to open the modal
function directOpenModal() {
  console.log('Directly opening server data modal');
  const modalElement = document.getElementById('serverDataModal');
  
  // Try jQuery first if available (most compatible)
  if (typeof $ !== 'undefined') {
    try {
      console.log('Trying to open modal with jQuery');
      $(modalElement).modal('show');
      return true;
    } catch (error) {
      console.warn('jQuery modal failed:', error);
    }
  }
  
  // Then try Bootstrap 5 approach
  if (typeof bootstrap !== 'undefined') {
    try {
      console.log('Trying to open modal with Bootstrap 5');
      const bsModal = new bootstrap.Modal(modalElement);
      bsModal.show();
      return true;
    } catch (error) {
      console.warn('Bootstrap 5 modal failed:', error);
    }
  }
  
  // Finally, try direct style manipulation as last resort
  try {
    console.log('Trying direct style manipulation');
    modalElement.style.display = 'block';
    modalElement.classList.add('show');
    document.body.classList.add('modal-open');
    
    Add backdrop
    const backdrop = document.createElement('div');
    backdrop.className = 'modal-backdrop fade show';
    document.body.appendChild(backdrop);
    return true;
  } catch (error) {
    console.error('All modal opening methods failed:', error);
    return false;
  }
}

// Our own implementation of openServerDataBrowser
function openServerDataBrowser() {
  console.log('Opening server data browser...');
  
  // Try to get the modal element
  const modalElement = document.getElementById('serverDataModal');
  if (!modalElement) {
    console.error('Modal element not found!');
    alert('Server data browser modal not found. Please refresh the page and try again.');
    return;
  }
  
  // Try to show the modal using various methods
  const modalOpened = directOpenModal();
  
  if (!modalOpened) {
    console.error('Failed to open modal with all methods');
    alert('Could not open server data browser. Please check console for errors.');
    return;
  }
  
  // If we have a fetchServerData function, use it
  if (typeof fetchServerData === 'function') {
    console.log('Fetching server data...');
    fetchServerData('/browse_data')
      .then(data => {
        console.log('Server data received:', data);
        processServerData(data);
      })
      .catch(error => {
        console.error('Error fetching server data:', error);
        const errorDisplay = document.getElementById('server-data-error');
        if (errorDisplay) {
          errorDisplay.classList.remove('d-none');
          errorDisplay.textContent = 'Error loading server data: ' + error.message;
        }
      });
  } else {
    console.error('fetchServerData function not found');
  }
}

// Process server data
function processServerData(data) {
  // Update server data browser state
  serverDataBrowser.currentFolder = data.current_folder || 'sample_data';
  serverDataBrowser.folders = data.folders || [];
  serverDataBrowser.files = data.files || [];
  
  // Update UI components
  const breadcrumb = document.getElementById('current-folder-breadcrumb');
  const fileCountDisplay = document.getElementById('file-count-display');
  const loadingIndicator = document.getElementById('server-data-loading');
  
  // Update breadcrumb
  if (breadcrumb) {
    breadcrumb.textContent = serverDataBrowser.currentFolder.replace('_', ' ');
  }
  
  // Update file count
  if (fileCountDisplay) {
    const fileCount = serverDataBrowser.files.length;
    fileCountDisplay.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''} available`;
  }
  
  // Hide loading indicator
  if (loadingIndicator) {
    loadingIndicator.classList.add('d-none');
  }
  
  // Render UI
  if (typeof renderFolderTabs === 'function') {
    renderFolderTabs();
  }
  
  if (typeof renderFileList === 'function') {
    renderFileList();
  }
}

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Server Data Browser module loaded');
  
  // Add event listener to the browse server data button
  const browseButton = document.getElementById('browse-server-data-btn');
  if (browseButton) {
    console.log('Found browse server data button, adding click listener');
    browseButton.addEventListener('click', function(e) {
      console.log('Browse Server Data button clicked');
      e.preventDefault();
      openServerDataBrowser();
    });
  } else {
    console.error('Browse server data button not found!');
  }
  
  // Add event listener to the load selected files button
  const loadSelectedButton = document.getElementById('load-selected-server-files');
  if (loadSelectedButton) {
    loadSelectedButton.addEventListener('click', function() {
      console.log('Load Selected Files button clicked');
      if (typeof loadSelectedServerFiles === 'function') {
        loadSelectedServerFiles();
      } else {
        console.error('loadSelectedServerFiles function not defined');
      }
    });
  }
});