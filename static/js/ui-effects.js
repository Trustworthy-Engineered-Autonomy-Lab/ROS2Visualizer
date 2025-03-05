/**
 * UI Effects for Flight Trajectory Visualizer
 * This script adds interactive elements and animations to enhance the user experience
 */

document.addEventListener('DOMContentLoaded', function() {
  // Add ripple effect to all buttons
  document.querySelectorAll('.btn').forEach(button => {
    button.addEventListener('click', function(e) {
      // Create ripple element
      const ripple = document.createElement('span');
      ripple.classList.add('ripple-effect');
      
      // Get button dimensions and position
      const rect = button.getBoundingClientRect();
      
      // Calculate ripple size (twice the button's larger dimension)
      const size = Math.max(rect.width, rect.height) * 2;
      ripple.style.width = ripple.style.height = `${size}px`;
      
      // Position ripple where clicked
      ripple.style.left = `${e.clientX - rect.left - (size/2)}px`;
      ripple.style.top = `${e.clientY - rect.top - (size/2)}px`;
      
      // Add ripple to button
      button.appendChild(ripple);
      
      // Remove ripple after animation completes
      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });
  
  // Add animation to view mode change
  const viewModeSelect = document.getElementById('view-mode');
  const viewModeIcon = document.querySelector('.view-mode-icon i');
  
  if (viewModeSelect && viewModeIcon) {
    viewModeSelect.addEventListener('change', function() {
      // Update the icon based on view mode
      viewModeIcon.className = ''; // Clear existing classes
      
      // Add appropriate icon class based on selection
      switch(this.value) {
        case 'free':
          viewModeIcon.className = 'fas fa-cube';
          break;
        case 'top-down':
          viewModeIcon.className = 'fas fa-map';
          break;
        case 'side':
          viewModeIcon.className = 'fas fa-mountain';
          break;
        case 'trailing':
          viewModeIcon.className = 'fas fa-plane';
          break;
        default:
          viewModeIcon.className = 'fas fa-cube';
      }
      
      // Add animation
      viewModeIcon.classList.add('fade-in');
      setTimeout(() => {
        viewModeIcon.classList.remove('fade-in');
      }, 500);
    });
  }
  
  // Highlight house panel when toggled
  const houseToggle = document.getElementById('house-toggle');
  const housePanel = document.querySelector('.control-panel:has(#house-toggle)');
  
  if (houseToggle && housePanel) {
    houseToggle.addEventListener('change', function() {
      if (this.checked) {
        housePanel.classList.add('highlight-item');
        setTimeout(() => {
          housePanel.classList.remove('highlight-item');
        }, 2000);
      }
    });
  }
  
  // Dynamic positioning information in visualization
  const visualizationContainer = document.getElementById('visualization-container');
  const stats = document.querySelector('.visualization-info .stats');
  
  if (visualizationContainer && stats) {
    visualizationContainer.addEventListener('mousemove', function(e) {
      // Get container dimensions
      const rect = visualizationContainer.getBoundingClientRect();
      
      // Calculate normalized position (0-1)
      const x = (e.clientX - rect.left) / rect.width;
      const y = (e.clientY - rect.top) / rect.height;
      
      // Display position in stats
      if (!stats.dataset.original) {
        stats.dataset.original = stats.innerHTML;
      }
      
      stats.innerHTML = `Position: ${(x * 100).toFixed(1)}%, ${(y * 100).toFixed(1)}%`;
      
      // Restore original content when not hovering
      visualizationContainer.addEventListener('mouseleave', function() {
        if (stats.dataset.original) {
          stats.innerHTML = stats.dataset.original;
        }
      });
    });
  }
  
  // Add shadow to the active panel
  const controlPanels = document.querySelectorAll('.control-panel');
  controlPanels.forEach(panel => {
    panel.addEventListener('mouseenter', function() {
      controlPanels.forEach(p => p.classList.remove('active-panel'));
      this.classList.add('active-panel');
    });
  });
  
  // Pulsing effect for play button
  const playBtn = document.getElementById('play-btn');
  if (playBtn) {
    // Add pulsing effect every 3 seconds if no trajectories are loaded
    const trajectoryList = document.getElementById('trajectory-list');
    if (trajectoryList && trajectoryList.querySelectorAll('.trajectory-item').length === 0) {
      setInterval(() => {
        if (!document.querySelector('.trajectory-item')) {
          playBtn.classList.add('highlight-item');
          setTimeout(() => {
            playBtn.classList.remove('highlight-item');
          }, 1000);
        }
      }, 5000);
    }
  }
  
  // Add visual feedback for house position updates
  const updateHouseBtn = document.getElementById('update-house-btn');
  const housePositionFields = document.querySelectorAll('#house-x, #house-y, #house-z');
  
  if (updateHouseBtn && housePositionFields.length) {
    housePositionFields.forEach(field => {
      field.addEventListener('change', function() {
        updateHouseBtn.classList.add('highlight-item');
        setTimeout(() => {
          updateHouseBtn.classList.remove('highlight-item');
        }, 2000);
      });
    });
  }
});