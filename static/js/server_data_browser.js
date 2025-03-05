/**
 * Server Data Browser JavaScript Module
 * Handles the enhanced data browsing interface functionality
 */

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
  console.log('Server Data Browser module loaded');
  
  // Add event listener to the browse server data button
  const browseButton = document.getElementById('browse-server-data-btn');
  if (browseButton) {
    console.log('Found browse server data button, adding click listener');
    browseButton.addEventListener('click', function() {
      console.log('Browse Server Data button clicked');
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

// The openServerDataBrowser function should be defined in the main script
// This is just a fallback in case it's not
if (typeof openServerDataBrowser !== 'function') {
  console.log('Defining openServerDataBrowser fallback function');
  
  // Define serverDataBrowser object if it doesn't exist
  if (typeof serverDataBrowser === 'undefined') {
    window.serverDataBrowser = {
      currentFolder: 'sample_data',
      folders: [],
      files: [],
      selectedFiles: [],
      viewMode: 'list',
      sortOption: 'date-desc',
      searchQuery: '',
      currentFilePreview: null
    };
  }
  
  // Define serverDataModal if it doesn't exist
  if (typeof serverDataModal === 'undefined') {
    window.serverDataModal = null;
    // Try to initialize it if bootstrap is available
    if (typeof bootstrap !== 'undefined') {
      const modalElement = document.getElementById('serverDataModal');
      if (modalElement) {
        window.serverDataModal = new bootstrap.Modal(modalElement);
      }
    }
  }
  
  // Simple fallback implementation
  window.openServerDataBrowser = function() {
    console.log('Opening server data browser (fallback function)');
    
    // Try to show the modal
    if (window.serverDataModal) {
      window.serverDataModal.show();
    } else {
      console.error('Server data modal not initialized');
      
      // Try to initialize and show the modal directly
      const modalElement = document.getElementById('serverDataModal');
      if (modalElement && typeof bootstrap !== 'undefined') {
        window.serverDataModal = new bootstrap.Modal(modalElement);
        window.serverDataModal.show();
      } else {
        alert('Server data browser cannot be opened. Please check the console for errors.');
      }
    }
  };
}