/**
 * Server Data Browser - Fix Module
 * This is a direct implementation to solve the modal display issue
 */
document.addEventListener('DOMContentLoaded', function() {
  console.log('Server browser fix module loaded');
  
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
  
  // Setup direct click handler
  browseButton.addEventListener('click', function(e) {
    e.preventDefault();
    console.log('Browse Server Data button clicked');
    
    try {
      // Create and show the modal directly
      const modal = new bootstrap.Modal(modalElement);
      modal.show();
      console.log('Modal shown successfully');
      
      // Initialize the data browser if needed
      if (typeof fetchServerData === 'function') {
        fetchServerData('/browse_data')
          .then(data => {
            console.log('Data fetched successfully:', data);
            if (typeof processServerData === 'function') {
              processServerData(data);
            } else {
              console.error('processServerData function not found');
            }
          })
          .catch(error => {
            console.error('Error fetching server data:', error);
            document.getElementById('server-data-error').textContent = error.message;
            document.getElementById('server-data-error-container').classList.remove('d-none');
          });
      } else {
        console.error('fetchServerData function not found');
      }
    } catch (error) {
      console.error('Error showing modal:', error);
    }
  });
  
  console.log('Server browser fix setup complete');
});