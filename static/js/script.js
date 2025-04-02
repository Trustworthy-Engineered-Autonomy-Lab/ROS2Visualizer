// Cross-browser compatibility polyfills
(function() {
  // Array.from polyfill for IE support
  if (!Array.from) {
    Array.from = function(object) {
      return [].slice.call(object);
    };
  }
  
  // Object.assign polyfill for IE support
  if (typeof Object.assign !== 'function') {
    Object.assign = function(target) {
      if (target === null || target === undefined) {
        throw new TypeError('Cannot convert undefined or null to object');
      }
      var to = Object(target);
      for (var index = 1; index < arguments.length; index++) {
        var nextSource = arguments[index];
        if (nextSource !== null && nextSource !== undefined) {
          for (var nextKey in nextSource) {
            if (Object.prototype.hasOwnProperty.call(nextSource, nextKey)) {
              to[nextKey] = nextSource[nextKey];
            }
          }
        }
      }
      return to;
    };
  }
  
  // requestAnimationFrame polyfill
  var lastTime = 0;
  var vendors = ['webkit', 'moz', 'ms', 'o'];
  for (var x = 0; x < vendors.length && !window.requestAnimationFrame; ++x) {
    window.requestAnimationFrame = window[vendors[x] + 'RequestAnimationFrame'];
    window.cancelAnimationFrame = window[vendors[x] + 'CancelAnimationFrame'] || 
                                  window[vendors[x] + 'CancelRequestAnimationFrame'];
  }
  if (!window.requestAnimationFrame) {
    window.requestAnimationFrame = function(callback) {
      var currTime = new Date().getTime();
      var timeToCall = Math.max(0, 16 - (currTime - lastTime));
      var id = window.setTimeout(function() { 
        callback(currTime + timeToCall); 
      }, timeToCall);
      lastTime = currTime + timeToCall;
      return id;
    };
  }
  if (!window.cancelAnimationFrame) {
    window.cancelAnimationFrame = function(id) {
      clearTimeout(id);
    };
  }
})();

// Feature detection
const browserSupport = {
  webGL: (function() {
    try {
      var canvas = document.createElement('canvas');
      return !!(window.WebGLRenderingContext && 
        (canvas.getContext('webgl') || canvas.getContext('experimental-webgl')));
    } catch(e) {
      return false;
    }
  })(),
  fileAPI: !!(window.File && window.FileReader && window.FileList && window.Blob),
  fetch: !!window.fetch
};

// Global variables
let scene, camera, renderer, controls;
let trajectories = [];
let animationState = {
  playing: false,
  currentTimeIndex: 0,
  playbackSpeed: 1,
  animationFrameId: null
};
let uploadModal;
let serverDataModal;
let houseModel = null;
let attackVisualizer; // Attack visualization controller
let houseConfig = {
  visible: true,
  position: {
    x: -1010.0,
    y: 0,
    z: 10.0
  }
};
let serverData = {
  currentFolder: 'sample_data',
  folders: [],
  files: [],
  selectedFiles: []
};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  // Initialize 3D scene
  initScene();
  
  // Initialize empty charts
  initCharts();
  
  // Initialize attack visualizer
  attackVisualizer = new AttackVisualizer().init();
  
  // Add event listeners
  document.getElementById('load-files-btn').addEventListener('click', handleFileUpload);
  document.getElementById('view-mode').addEventListener('change', handleViewModeChange);
  document.getElementById('play-btn').addEventListener('click', playAnimation);
  document.getElementById('pause-btn').addEventListener('click', pauseAnimation);
  document.getElementById('time-slider').addEventListener('input', handleTimeSliderChange);
  document.getElementById('playback-speed').addEventListener('change', handlePlaybackSpeedChange);
  document.getElementById('reset-view-btn').addEventListener('click', resetView);
  document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
  
  // House controls
  document.getElementById('house-toggle').addEventListener('change', toggleHouseVisibility);
  document.getElementById('update-house-btn').addEventListener('click', updateHousePosition);
  
  // Attack visualization controls - these are now handled by the AttackVisualizer class
  
  // Server data browser
  document.getElementById('browse-server-data-btn').addEventListener('click', openServerDataBrowser);
  
  // Initialize modals
  // Initialize modals with proper focus management and accessibility settings
  const uploadModalElement = document.getElementById('uploadModal');
  const serverDataModalElement = document.getElementById('serverDataModal');
  
  // Ensure these elements exist before initializing
  if (uploadModalElement) {
    // Set up event handlers for proper focus management
    uploadModalElement.addEventListener('hidden.bs.modal', function() {
      // Reset focus to the trigger button when modal is closed
      const uploadButton = document.getElementById('file-upload');
      if (uploadButton) uploadButton.focus();
    });
    
    uploadModal = new bootstrap.Modal(uploadModalElement, {
      backdrop: true,
      keyboard: true,
      focus: true
    });
  }
  
  if (serverDataModalElement) {
    // Set up event handlers for proper focus management
    serverDataModalElement.addEventListener('hidden.bs.modal', function() {
      // Reset focus to the trigger button when modal is closed
      const browseButton = document.getElementById('browse-server-data-btn');
      if (browseButton) browseButton.focus();
    });
    
    // Focus the search input when the modal is shown
    serverDataModalElement.addEventListener('shown.bs.modal', function() {
      const searchInput = document.getElementById('server-data-search');
      if (searchInput) searchInput.focus();
    });
    
    serverDataModal = new bootstrap.Modal(serverDataModalElement, {
      backdrop: true,
      keyboard: true,
      focus: true
    });
  }
  
  // Additional event listener
  document.getElementById('load-selected-server-files').addEventListener('click', loadSelectedServerFiles);
  
  // Handle window resize
  window.addEventListener('resize', onWindowResize);
  
  // Display initial message
  showMessage("Upload flight data to begin visualization");
});

// Initialize the Three.js scene
function initScene() {
  // Create scene
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x212529); // Bootstrap dark theme background
  
  // Create camera
  const container = document.getElementById('visualization-container');
  const aspect = container.clientWidth / container.clientHeight;
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 10000);
  camera.position.set(200, 200, 200);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  
  // Add orbit controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  // Add grid helper - super large grid to accommodate flight data
  const gridHelper = new THREE.GridHelper(5000, 100, 0x555555, 0x333333);
  scene.add(gridHelper);
  
  // Add axes helper (red = x, green = y, blue = z) - super large
  const axesHelper = new THREE.AxesHelper(200);
  scene.add(axesHelper);
  
  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);
  
  // Add 3D house model at the specified coordinates from config
  try {
    console.log("Creating house at:", houseConfig.position);
    // Check if THREE is available
    if (typeof THREE === 'undefined') {
      console.error("THREE.js is not loaded. House model will not be created.");
      showMessage("Warning: 3D library not available. Some features may be limited.", "warning");
    } else {
      // Add a timeout to make sure everything is initialized
      setTimeout(function() {
        try {
          houseModel = addHouseModel(
            houseConfig.position.x, 
            houseConfig.position.y, 
            houseConfig.position.z
          );
          console.log("House model created:", houseModel);
        } catch (innerError) {
          console.error("Error creating house model in delayed initialization:", innerError);
          showMessage("House model could not be displayed. Try refreshing the page.", "warning");
        }
      }, 500);
    }
  } catch (error) {
    console.error("Error creating house model:", error);
    showMessage("House model could not be displayed due to a browser compatibility issue.", "warning");
  }
  
  // Add text labels for axes
  addAxisLabels();
  
  // Start render loop
  animate();
}

// Add text labels for axes
function addAxisLabels() {
  // This is a placeholder - in a real application, you would add
  // 3D text labels using THREE.TextGeometry or HTML overlays
  // Since THREE.TextGeometry requires loading a font file, we'll skip it for simplicity
}

// Add 3D house model at specified coordinates
function addHouseModel(x, y, z) {
  // Create a group to hold all house parts
  const house = new THREE.Group();
  
  // House colors
  const roofColor = 0x8B4513;  // Brown
  const wallColor = 0xF5F5DC;  // Beige
  const windowColor = 0x87CEEB; // Sky blue
  const doorColor = 0x8B4513;  // Brown
  
  // Materials
  const roofMaterial = new THREE.MeshPhongMaterial({ color: roofColor });
  const wallMaterial = new THREE.MeshPhongMaterial({ color: wallColor });
  const windowMaterial = new THREE.MeshPhongMaterial({ 
    color: windowColor,
    transparent: true,
    opacity: 0.7,
    shininess: 100
  });
  const doorMaterial = new THREE.MeshPhongMaterial({ color: doorColor });
  
  // Main house body
  const houseWidth = 50;
  const houseHeight = 40;
  const houseDepth = 60;
  
  const bodyGeometry = new THREE.BoxGeometry(houseWidth, houseHeight, houseDepth);
  const body = new THREE.Mesh(bodyGeometry, wallMaterial);
  body.position.set(0, houseHeight/2, 0); // Position bottom at ground level
  house.add(body);
  
  // Roof (pyramid)
  const roofHeight = 25;
  
  // Create a pyramid geometry for the roof
  const roofGeometry = new THREE.ConeGeometry(Math.sqrt(houseWidth*houseWidth + houseDepth*houseDepth)/2, roofHeight, 4);
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.set(0, houseHeight + roofHeight/2, 0);
  roof.rotation.y = Math.PI/4; // Rotate to align with house
  house.add(roof);
  
  // Front door
  const doorWidth = 15;
  const doorHeight = 25;
  const doorGeometry = new THREE.BoxGeometry(doorWidth, doorHeight, 1);
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, doorHeight/2, houseDepth/2 + 0.5);
  house.add(door);
  
  // Windows
  const windowSize = 10;
  const windowGeometry = new THREE.BoxGeometry(windowSize, windowSize, 1);
  
  // Front windows
  const frontWindow1 = new THREE.Mesh(windowGeometry, windowMaterial);
  frontWindow1.position.set(-15, houseHeight - windowSize, houseDepth/2 + 0.5);
  house.add(frontWindow1);
  
  const frontWindow2 = new THREE.Mesh(windowGeometry, windowMaterial);
  frontWindow2.position.set(15, houseHeight - windowSize, houseDepth/2 + 0.5);
  house.add(frontWindow2);
  
  // Side windows
  const sideWindow1 = new THREE.Mesh(windowGeometry, windowMaterial);
  sideWindow1.position.set(houseWidth/2 + 0.5, houseHeight - windowSize, 15);
  sideWindow1.rotation.y = Math.PI/2;
  house.add(sideWindow1);
  
  const sideWindow2 = new THREE.Mesh(windowGeometry, windowMaterial);
  sideWindow2.position.set(houseWidth/2 + 0.5, houseHeight - windowSize, -15);
  sideWindow2.rotation.y = Math.PI/2;
  house.add(sideWindow2);
  
  // Back windows
  const backWindow1 = new THREE.Mesh(windowGeometry, windowMaterial);
  backWindow1.position.set(-15, houseHeight - windowSize, -houseDepth/2 - 0.5);
  house.add(backWindow1);
  
  const backWindow2 = new THREE.Mesh(windowGeometry, windowMaterial);
  backWindow2.position.set(15, houseHeight - windowSize, -houseDepth/2 - 0.5);
  house.add(backWindow2);
  
  // Other side windows
  const otherSideWindow1 = new THREE.Mesh(windowGeometry, windowMaterial);
  otherSideWindow1.position.set(-houseWidth/2 - 0.5, houseHeight - windowSize, 15);
  otherSideWindow1.rotation.y = Math.PI/2;
  house.add(otherSideWindow1);
  
  const otherSideWindow2 = new THREE.Mesh(windowGeometry, windowMaterial);
  otherSideWindow2.position.set(-houseWidth/2 - 0.5, houseHeight - windowSize, -15);
  otherSideWindow2.rotation.y = Math.PI/2;
  house.add(otherSideWindow2);
  
  // Add chimney
  const chimneyWidth = 8;
  const chimneyHeight = 20;
  const chimneyGeometry = new THREE.BoxGeometry(chimneyWidth, chimneyHeight, chimneyWidth);
  const chimney = new THREE.Mesh(chimneyGeometry, roofMaterial);
  chimney.position.set(houseWidth/4, houseHeight + roofHeight/2 + chimneyHeight/2, houseDepth/4);
  house.add(chimney);
  
  // Add a yard with fence
  const yardSize = 130;
  const yardHeight = 0.5;
  const yardGeometry = new THREE.BoxGeometry(yardSize, yardHeight, yardSize);
  const yardMaterial = new THREE.MeshPhongMaterial({ color: 0x7CFC00 }); // Light green
  const yard = new THREE.Mesh(yardGeometry, yardMaterial);
  yard.position.set(0, -yardHeight/2, 0);
  house.add(yard);
  
  // Add fence posts
  const fenceHeight = 10;
  const fencePostSize = 2;
  const fencePostGeometry = new THREE.BoxGeometry(fencePostSize, fenceHeight, fencePostSize);
  const fencePostMaterial = new THREE.MeshPhongMaterial({ color: 0x8B4513 }); // Brown
  
  // Create fence posts around the yard
  const fenceOffset = yardSize/2 - fencePostSize/2;
  for (let i = -yardSize/2; i <= yardSize/2; i += 15) {
    // Front fence
    const frontPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
    frontPost.position.set(i, fenceHeight/2, fenceOffset);
    house.add(frontPost);
    
    // Back fence
    const backPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
    backPost.position.set(i, fenceHeight/2, -fenceOffset);
    house.add(backPost);
    
    // Left fence
    const leftPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
    leftPost.position.set(-fenceOffset, fenceHeight/2, i);
    house.add(leftPost);
    
    // Right fence
    const rightPost = new THREE.Mesh(fencePostGeometry, fencePostMaterial);
    rightPost.position.set(fenceOffset, fenceHeight/2, i);
    house.add(rightPost);
  }
  
  // Set the house position to the specified coordinates
  // In Three.js, Y is up, whereas in our flight data, Z is up and Y is North
  // So we need to swap Y and Z coordinates
  console.log(`Positioning house at coordinates: X=${x}, Y=${y}, Z=${z}`);
  house.position.set(x, z, y);
  
  // Add the house to the scene
  scene.add(house);
  
  return house;
}

// Animation loop
function animate() {
  animationState.animationFrameId = requestAnimationFrame(animate);
  
  // Update controls
  controls.update();
  
  // If animation is playing, update aircraft positions
  if (animationState.playing && trajectories.length > 0) {
    updateAnimation();
  }
  
  // Render scene
  renderer.render(scene, camera);
}

// Initialize empty charts
function initCharts() {
  // Position chart
  Plotly.newPlot('position-chart', [{
    x: [],
    y: [],
    mode: 'lines',
    name: 'Altitude'
  }], {
    title: 'Altitude Profile',
    margin: { t: 30, l: 50, r: 20, b: 40 },
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Altitude (m)' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#fff' }
  }, {responsive: true});
  
  // Velocity chart
  Plotly.newPlot('velocity-chart', [{
    x: [],
    y: [],
    mode: 'lines',
    name: 'Velocity'
  }], {
    title: 'Velocity Profile',
    margin: { t: 30, l: 50, r: 20, b: 40 },
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Velocity (m/s)' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#fff' }
  }, {responsive: true});
}

// Handle file upload with cross-browser compatibility
function handleFileUpload() {
  // Check for File API support
  if (!browserSupport.fileAPI) {
    showMessage("Your browser doesn't support the File API. Please upgrade to a modern browser.", "danger");
    return;
  }

  const fileInput = document.getElementById('file-input');
  let files;
  
  try {
    // Modern browsers
    files = fileInput.files;
    
    if (!files || files.length === 0) {
      showMessage("Please select at least one file to upload", "warning");
      return;
    }
  } catch (error) {
    console.error("Error accessing files:", error);
    showMessage("Error accessing files. Please try again or use a different browser.", "danger");
    return;
  }
  
  // Show upload modal
  try {
    uploadModal.show();
  } catch (error) {
    console.error("Error showing modal:", error);
    // Fallback if modal can't be shown
    showMessage("Processing files, please wait...", "info");
  }
  
  const progressBar = document.getElementById('upload-progress');
  const statusText = document.getElementById('upload-status');
  
  if (progressBar) progressBar.style.width = '0%';
  if (statusText) statusText.textContent = 'Preparing to process files...';
  
  // Reset any existing trajectories
  clearTrajectories();
  
  // Process each file
  let processedCount = 0;
  const totalFiles = files.length;
  const colors = [0x0088ff, 0xff8800, 0x88ff00, 0xff0088, 0x00ff88, 0x8800ff];
  
  // Safe Array conversion for older browsers
  const fileArray = [];
  for (let i = 0; i < files.length; i++) {
    fileArray.push(files[i]);
  }
  
  // Process files sequentially to avoid overwhelming the server
  function processNextFile(index) {
    if (index >= fileArray.length) {
      // All files processed
      if (statusText) statusText.textContent = `Completed processing ${processedCount} files`;
      setTimeout(() => {
        try {
          uploadModal.hide();
        } catch (e) {
          console.error("Error hiding modal:", e);
        }
        updateTrajectoryList();
        updateTimeSlider();
        showMessage(`Successfully loaded ${processedCount} trajectories`, "success");
      }, 500);
      return;
    }
    
    const file = fileArray[index];
    if (statusText) statusText.textContent = `Processing file: ${file.name} (${index + 1}/${totalFiles})`;
    if (progressBar) progressBar.style.width = `${(index / totalFiles) * 100}%`;
    
    // Create form data for file upload
    let formData;
    try {
      formData = new FormData();
      formData.append('file', file);
    } catch (error) {
      console.error("Error creating FormData:", error);
      processNextFile(index + 1);
      return;
    }
    
    // Use a robust fetch with fallback
    sendFileToServer(formData, file.name, index)
      .then(data => {
        processedCount++;
        if (progressBar) progressBar.style.width = `${(processedCount / totalFiles) * 100}%`;
        
        // Check if we have data points
        if (!data.data || data.data.length === 0) {
          throw new Error('No valid data points found in file');
        }
        
        // Log metadata
        console.log(`File ${file.name} metadata:`, data.metadata);
        
        // Add trajectory to scene
        addTrajectory(data.data, file.name, colors[index % colors.length]);
        
        // Update status
        if (statusText) {
          statusText.textContent = `Processed ${processedCount} of ${totalFiles} files`;
          if (data.metadata && data.metadata.points_count) {
            statusText.textContent += ` (${data.metadata.points_count} points from ${data.metadata.original_count || 'unknown'} total)`;
          }
        }
        
        // Process next file
        processNextFile(index + 1);
      })
      .catch(error => {
        console.error("Error processing file:", error);
        if (statusText) statusText.textContent = `Error processing ${file.name}: ${error.message || 'Unknown error'}`;
        processedCount++;
        
        // Update progress even if there's an error
        if (progressBar) progressBar.style.width = `${(processedCount / totalFiles) * 100}%`;
        
        // Continue with next file
        setTimeout(() => processNextFile(index + 1), 1000);
      });
  }
  
  // Start processing the first file
  processNextFile(0);
}

// Send file to server with fallbacks for older browsers
function sendFileToServer(formData, fileName, index) {
  return new Promise((resolve, reject) => {
    if (browserSupport.fetch) {
      // Modern fetch API
      fetch('/process_csv', {
        method: 'POST',
        body: formData
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => { 
            throw new Error(err.error || `Server error (${response.status})`);
          }).catch(err => {
            // If JSON parsing fails
            throw new Error(`Server error (${response.status}): ${response.statusText}`);
          });
        }
        return response.json();
      })
      .then(data => resolve(data))
      .catch(error => reject(error));
    } else {
      // Fallback to XHR for older browsers
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/process_csv', true);
      
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (error) {
            reject(new Error(`Error parsing server response: ${error.message}`));
          }
        } else {
          let errorMessage = `Server error (${xhr.status})`;
          try {
            const response = JSON.parse(xhr.responseText);
            if (response && response.error) {
              errorMessage = response.error;
            }
          } catch (e) {
            // If JSON parsing fails, use status text
            errorMessage = `Server error (${xhr.status}): ${xhr.statusText}`;
          }
          reject(new Error(errorMessage));
        }
      };
      
      xhr.onerror = function() {
        reject(new Error('Network error occurred'));
      };
      
      xhr.ontimeout = function() {
        reject(new Error('Request timed out'));
      };
      
      // Add error handling for all possible XHR events
      xhr.onabort = function() {
        reject(new Error('Request was aborted'));
      };
      
      // Set timeout to handle slow connections
      xhr.timeout = 60000; // 60 seconds
      
      // Try to send the data
      try {
        xhr.send(formData);
      } catch (error) {
        reject(new Error(`Error sending file: ${error.message}`));
      }
    }
  });
}

// Process parsed CSV data
function processData(rawData) {
  // Convert header names to lowercase for consistent access
  const processedData = rawData.map(row => {
    const processedRow = {};
    
    // Normalize data by checking for common column names
    Object.keys(row).forEach(key => {
      const lowerKey = key.toLowerCase();
      
      // Position data
      if (['position_n', 'north', 'n'].includes(lowerKey)) {
        processedRow.position_n = parseFloat(row[key]);
      } else if (['position_e', 'east', 'e'].includes(lowerKey)) {
        processedRow.position_e = parseFloat(row[key]);
      } else if (['position_d', 'down', 'd', 'altitude', 'alt'].includes(lowerKey)) {
        processedRow.position_d = parseFloat(row[key]);
      }
      // Orientation data
      else if (['phi', 'roll'].includes(lowerKey)) {
        processedRow.phi = parseFloat(row[key]);
      } else if (['theta', 'pitch'].includes(lowerKey)) {
        processedRow.theta = parseFloat(row[key]);
      } else if (['psi', 'yaw', 'heading'].includes(lowerKey)) {
        processedRow.psi = parseFloat(row[key]);
      }
      // Time data
      else if (['sec', 'seconds', 'time'].includes(lowerKey)) {
        processedRow.sec = parseFloat(row[key]);
      } else if (['nanosec', 'nanoseconds'].includes(lowerKey)) {
        processedRow.nanosec = parseFloat(row[key]);
      }
      // Velocity data
      else if (['velocity', 'vel', 'speed'].includes(lowerKey)) {
        processedRow.velocity = parseFloat(row[key]);
      }
      // Copy other numeric data as is
      else if (!isNaN(parseFloat(row[key]))) {
        processedRow[lowerKey] = parseFloat(row[key]);
      }
    });
    
    // Calculate time if possible
    if (processedRow.sec !== undefined && processedRow.nanosec !== undefined) {
      processedRow.time = processedRow.sec + (processedRow.nanosec / 1e9);
    } else if (processedRow.sec !== undefined) {
      processedRow.time = processedRow.sec;
    } else {
      // If no time data, use index as time
      processedRow.time = 0; // Will be updated after array is created
    }
    
    return processedRow;
  });
  
  // If time is missing, use index as time
  if (!processedData[0].time) {
    processedData.forEach((row, index) => {
      row.time = index * 0.1; // Assume 10Hz data rate
    });
  }
  
  // Sort by time
  processedData.sort((a, b) => a.time - b.time);
  
  return processedData;
}

// Add trajectory to scene
function addTrajectory(data, name, color) {
  // Enhanced altitude scaling to make flights appear at proper depths
  const altitudeScaleFactor = 1.8; // Amplify vertical movements
  
  // Extract position points for trajectory line with enhanced altitude
  const points = data.map(point => new THREE.Vector3(
    point.position_e || 0,                     // X axis (East)
    (-point.position_d || 0) * altitudeScaleFactor,  // Y axis (Up) with enhanced scaling
    point.position_n || 0                      // Z axis (North)
  ));
  
  // Create line geometry
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  
  // Create line material
  const material = new THREE.LineBasicMaterial({ 
    color: color,
    linewidth: 2
  });
  
  // Create the line
  const trajectory = new THREE.Line(geometry, material);
  scene.add(trajectory);
  
  // Create aircraft model
  const aircraft = createAircraftModel(color);
  scene.add(aircraft);
  
  // Calculate velocity if not provided
  if (!data[0].velocity) {
    for (let i = 1; i < data.length; i++) {
      const p1 = points[i-1];
      const p2 = points[i];
      const dt = data[i].time - data[i-1].time;
      
      if (dt > 0) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const dz = p2.z - p1.z;
        
        data[i].velocity = Math.sqrt(dx*dx + dy*dy + dz*dz) / dt;
      } else {
        data[i].velocity = 0;
      }
    }
    data[0].velocity = data[1]?.velocity || 0;
  }
  
  // Check for attack data
  const hasAttackData = data.some(point => point.is_attacked || point.attack_type);
  
  // Create trajectory object
  const trajectoryObject = {
    name: name,
    data: data,
    points: points,
    visible: true,
    color: color,
    objects: {
      trajectory: trajectory,
      aircraft: aircraft,
      attackMarkers: [] // Will store attack visualization markers
    },
    hasAttackData: hasAttackData, // Flag to indicate if trajectory has attack data
    attackSegments: [] // Will store information about attack segments
  };
  
  // Process attack segments if the trajectory has attack data
  if (hasAttackData && attackVisualizer) {
    // Initialize attack markers array if not exists
    trajectoryObject.objects.attackMarkers = [];
    
    // Let the attack visualizer process the trajectory
    attackVisualizer.processTrajectory(trajectoryObject, trajectories.length);
    
    // Add attack visualization to the trajectory line if visualization is enabled
    if (attackVisualizer.settings.enabled) {
      // Pass trajectory object to attack visualizer for visualization
      attackVisualizer.visualizeAttacksOnTrajectory(trajectory, trajectoryObject, trajectories.length);
      
      // Add attack markers if marker visualization is enabled
      if (attackVisualizer.settings.showAttackMarkers) {
        const markers = attackVisualizer.addAttackMarkers(scene, trajectoryObject, trajectories.length);
        trajectoryObject.objects.attackMarkers = markers || [];
      }
    }
  }
  
  // Store the trajectory data
  trajectories.push(trajectoryObject);
  
  // Update charts with this trajectory's data
  updateCharts();
}

// Create aircraft model
function createAircraftModel(color) {
  // High-detail missile/UAV representation with sleek design
  const group = new THREE.Group();
  
  // Create a more vibrant color with metallic appearance
  const mainColor = new THREE.Color(color);
  const accentColor = new THREE.Color(color).offsetHSL(0, 0, 0.2); // Slightly lighter for accents
  
  // Materials
  const bodyMaterial = new THREE.MeshPhongMaterial({ 
    color: mainColor,
    shininess: 100, // More metallic look
    specular: 0x333333 // Add specular highlights
  });
  
  const accentMaterial = new THREE.MeshPhongMaterial({ 
    color: accentColor,
    shininess: 120,
    specular: 0x666666
  });
  
  // Main body - tapered cylindrical shape for aerodynamic look
  const bodyGeometry = new THREE.CylinderGeometry(5, 7, 50, 16);
  bodyGeometry.rotateX(Math.PI / 2);
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  group.add(body);
  
  // Nose cone - properly oriented and more streamlined
  const noseGeometry = new THREE.ConeGeometry(5, 20, 16);
  noseGeometry.rotateX(Math.PI / 2); // Ensure correct orientation
  const nose = new THREE.Mesh(noseGeometry, accentMaterial);
  nose.position.set(0, 0, 35); // Position at front of body
  group.add(nose);
  
  // Tail section - slightly wider for stability
  const tailGeometry = new THREE.CylinderGeometry(7, 8, 10, 16);
  tailGeometry.rotateX(Math.PI / 2);
  const tail = new THREE.Mesh(tailGeometry, accentMaterial);
  tail.position.set(0, 0, -25); // Position at rear
  group.add(tail);
  
  // Add swept-back fins for better aerodynamics (4 of them around the back)
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(15, -7); // Swept back design
  finShape.lineTo(15, 3);
  finShape.lineTo(7, 10);
  finShape.lineTo(0, 10);
  finShape.lineTo(0, 0);
  
  const finExtrudeSettings = {
    steps: 1,
    depth: 0.8,
    bevelEnabled: true,
    bevelThickness: 0.3,
    bevelSize: 0.3,
    bevelSegments: 3
  };
  
  const finGeometry = new THREE.ExtrudeGeometry(finShape, finExtrudeSettings);
  const finMaterial = new THREE.MeshPhongMaterial({ 
    color: accentColor,
    shininess: 80,
    specular: 0x444444
  });
  
  // Add 4 aerodynamic fins
  for (let i = 0; i < 4; i++) {
    const fin = new THREE.Mesh(finGeometry, finMaterial);
    fin.position.set(0, 0, -25); // Position near back
    fin.rotation.z = (Math.PI / 2) * i; // Rotate around body
    
    // Position fins outward based on their rotation
    if (i === 0) {
      fin.position.y = 7; // Top fin
    } else if (i === 1) {
      fin.position.x = 7; // Right fin
    } else if (i === 2) {
      fin.position.y = -7; // Bottom fin
    } else {
      fin.position.x = -7; // Left fin
    }
    
    group.add(fin);
  }
  
  // Add guidance rings for detail
  for (let i = 0; i < 3; i++) {
    const ringGeometry = new THREE.TorusGeometry(7.5, 0.5, 8, 24);
    const ring = new THREE.Mesh(ringGeometry, accentMaterial);
    ring.position.z = -15 + (i * 10); // Space them along the body
    ring.rotation.y = Math.PI / 2; // Orient correctly
    group.add(ring);
  }
  
  // Scale the entire model - reduced size per user request
  group.scale.set(0.8, 0.8, 0.8);
  
  return group;
}

// Update trajectory list in UI
function updateTrajectoryList() {
  const listElement = document.getElementById('trajectory-list');
  listElement.innerHTML = '';
  
  if (trajectories.length === 0) {
    listElement.innerHTML = `
      <div class="text-center text-muted py-3">
        <i class="fas fa-info-circle mb-2 d-block" style="font-size: 24px;"></i>
        Upload files to see trajectories
      </div>
    `;
    return;
  }
  
  trajectories.forEach((traj, index) => {
    const colorHex = '#' + traj.color.toString(16).padStart(6, '0');
    
    const item = document.createElement('div');
    item.className = 'list-group-item d-flex align-items-center';
    
    const checkbox = document.createElement('input');
    checkbox.className = 'form-check-input me-2';
    checkbox.type = 'checkbox';
    checkbox.checked = traj.visible;
    checkbox.dataset.index = index;
    checkbox.addEventListener('change', toggleTrajectoryVisibility);
    
    const colorBox = document.createElement('span');
    colorBox.className = 'color-box';
    colorBox.style.backgroundColor = colorHex;
    
    const name = document.createElement('span');
    name.className = 'ms-2';
    name.textContent = traj.name;
    
    item.appendChild(checkbox);
    item.appendChild(colorBox);
    item.appendChild(name);
    listElement.appendChild(item);
  });
}

// Toggle trajectory visibility
function toggleTrajectoryVisibility(event) {
  const index = parseInt(event.target.dataset.index);
  const visible = event.target.checked;
  
  if (index >= 0 && index < trajectories.length) {
    trajectories[index].visible = visible;
    trajectories[index].objects.trajectory.visible = visible;
    trajectories[index].objects.aircraft.visible = visible;
    
    // Update charts
    updateCharts();
  }
}

// Update time slider range
function updateTimeSlider() {
  if (trajectories.length === 0) return;
  
  // Find max time across all trajectories
  const maxTimeIndex = trajectories.reduce((max, traj) => {
    return Math.max(max, traj.data.length - 1);
  }, 0);
  
  const slider = document.getElementById('time-slider');
  slider.max = maxTimeIndex;
  slider.value = 0;
  
  // Reset animation state
  animationState.currentTimeIndex = 0;
  animationState.playing = false;
  
  // Update UI with initial position
  updateDataDisplay();
}

// Handle time slider change
function handleTimeSliderChange() {
  const slider = document.getElementById('time-slider');
  animationState.currentTimeIndex = parseInt(slider.value);
  
  // Update aircraft positions
  trajectories.forEach(traj => {
    if (traj.visible && animationState.currentTimeIndex < traj.points.length) {
      updateAircraftPosition(traj, animationState.currentTimeIndex);
    }
  });
  
  // Update data display
  updateDataDisplay();
}

// Update aircraft position and orientation
function updateAircraftPosition(trajectory, timeIndex) {
  if (timeIndex >= trajectory.points.length) return;
  
  const point = trajectory.points[timeIndex];
  const data = trajectory.data[timeIndex];
  
  // Update position - use point coordinates which already have the altitude scaling applied
  trajectory.objects.aircraft.position.copy(point);
  
  // Update orientation if available
  if (data.phi !== undefined && data.theta !== undefined && data.psi !== undefined) {
    // Convert from aircraft euler angles to three.js rotation
    trajectory.objects.aircraft.rotation.set(
      data.theta || 0,  // Pitch (rotation around X axis)
      data.psi || 0,    // Yaw (rotation around Y axis)
      data.phi || 0     // Roll (rotation around Z axis)
    );
  } else {
    // If no orientation data, try to calculate from trajectory
    if (timeIndex < trajectory.points.length - 1) {
      const nextPoint = trajectory.points[timeIndex + 1];
      const direction = new THREE.Vector3().subVectors(nextPoint, point).normalize();
      
      // Create a rotation that points in the direction of travel
      trajectory.objects.aircraft.lookAt(nextPoint);
    }
  }
}

// Update animation frame
function updateAnimation() {
  const slider = document.getElementById('time-slider');
  const maxTimeIndex = parseInt(slider.max);
  
  // Increment time index based on playback speed
  animationState.currentTimeIndex += animationState.playbackSpeed;
  
  // Loop back to start if we reach the end
  if (animationState.currentTimeIndex >= maxTimeIndex) {
    animationState.currentTimeIndex = 0;
  }
  
  // Update slider position
  slider.value = Math.floor(animationState.currentTimeIndex);
  
  // Update aircraft positions
  trajectories.forEach(traj => {
    if (traj.visible) {
      const timeIndex = Math.min(Math.floor(animationState.currentTimeIndex), traj.points.length - 1);
      updateAircraftPosition(traj, timeIndex);
    }
  });
  
  // Update data display
  updateDataDisplay();
}

// Update data display table
function updateDataDisplay() {
  // Get the first visible trajectory
  const activeTraj = trajectories.find(t => t.visible);
  
  if (!activeTraj || animationState.currentTimeIndex >= activeTraj.data.length) {
    // Clear display if no active trajectory or out of range
    document.getElementById('data-n').textContent = '--';
    document.getElementById('data-e').textContent = '--';
    document.getElementById('data-alt').textContent = '--';
    document.getElementById('data-vel').textContent = '--';
    document.getElementById('data-hdg').textContent = '--';
    document.getElementById('time-display').textContent = '00:00.000';
    return;
  }
  
  const data = activeTraj.data[Math.floor(animationState.currentTimeIndex)];
  
  // Update data fields
  document.getElementById('data-n').textContent = formatValue(data.position_n, 'm');
  document.getElementById('data-e').textContent = formatValue(data.position_e, 'm');
  // Note: we're showing the true altitude in the data display (not scaled)
  document.getElementById('data-alt').textContent = formatValue(-data.position_d, 'm');
  document.getElementById('data-vel').textContent = formatValue(data.velocity, 'm/s');
  document.getElementById('data-hdg').textContent = formatValue(data.psi * (180/Math.PI), '°');
  
  // Update time display
  updateTimeDisplay(data.time);
}

// Format numeric value with unit
function formatValue(value, unit) {
  if (value === undefined || value === null) return '--';
  return value.toFixed(2) + ' ' + unit;
}

// Update time display
function updateTimeDisplay(time) {
  if (time === undefined || time === null) {
    document.getElementById('time-display').textContent = '00:00.000';
    return;
  }
  
  const minutes = Math.floor(time / 60);
  const seconds = Math.floor(time % 60);
  const milliseconds = Math.floor((time - Math.floor(time)) * 1000);
    
  const timeStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  document.getElementById('time-display').textContent = timeStr;
}

// Update charts with trajectory data
function updateCharts() {
  if (trajectories.length === 0) return;
  
  // We'll now show the real altitude values in the chart
  // Note: 3D view still uses scaling for better visualization
  
  // Prepare data for altitude chart with REAL altitude values (not scaled)
  const altitudeTraces = trajectories.filter(t => t.visible).map(traj => {
    const times = traj.data.map(d => d.time);
    // Use true altitude values without scaling
    const altitudes = traj.data.map(d => -d.position_d); // Convert from position_d (down) to altitude (up)
    
    return {
      x: times,
      y: altitudes,
      mode: 'lines',
      name: traj.name,
      line: {
        color: '#' + traj.color.toString(16).padStart(6, '0')
      }
    };
  });
  
  // Prepare data for velocity chart
  const velocityTraces = trajectories.filter(t => t.visible).map(traj => {
    const times = traj.data.map(d => d.time);
    const velocities = traj.data.map(d => d.velocity || 0);
    
    return {
      x: times,
      y: velocities,
      mode: 'lines',
      name: traj.name,
      line: {
        color: '#' + traj.color.toString(16).padStart(6, '0')
      }
    };
  });
  
  // Enhance charts with attack visualization if available
  if (attackVisualizer) {
    // Add attack visualization to altitude chart
    const enhancedAltitudeTraces = attackVisualizer.enhanceChartWithAttackVisualization(
      altitudeTraces, 
      'altitude'
    );
    
    // Add attack visualization to velocity chart
    const enhancedVelocityTraces = attackVisualizer.enhanceChartWithAttackVisualization(
      velocityTraces, 
      'velocity'
    );
    
    // Use enhanced traces if attack visualization is enabled
    if (attackVisualizer.settings.enabled) {
      if (attackVisualizer.settings.highlightAttackAltitude) {
        altitudeTraces = enhancedAltitudeTraces;
      }
      
      if (attackVisualizer.settings.highlightAttackVelocity) {
        velocityTraces = enhancedVelocityTraces;
      }
    }
  }
  
  // Update charts
  Plotly.react('position-chart', altitudeTraces, {
    title: 'Altitude Profile (Real Values)',
    margin: { t: 30, l: 50, r: 20, b: 40 },
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Altitude (m)' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#fff' }
  }, {responsive: true});
  
  Plotly.react('velocity-chart', velocityTraces, {
    title: 'Velocity Profile',
    margin: { t: 30, l: 50, r: 20, b: 40 },
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Velocity (m/s)' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#fff' }
  }, {responsive: true});
  
  // If attack visualizer exists, update its visualization
  if (attackVisualizer) {
    attackVisualizer.updateVisualization();
  }
}

// Play animation
function playAnimation() {
  animationState.playing = true;
  document.getElementById('play-btn').classList.add('btn-success');
  document.getElementById('play-btn').classList.remove('btn-secondary');
  document.getElementById('pause-btn').classList.add('btn-secondary');
  document.getElementById('pause-btn').classList.remove('btn-danger');
}

// Pause animation
function pauseAnimation() {
  animationState.playing = false;
  document.getElementById('play-btn').classList.remove('btn-success');
  document.getElementById('play-btn').classList.add('btn-secondary');
  document.getElementById('pause-btn').classList.remove('btn-secondary');
  document.getElementById('pause-btn').classList.add('btn-danger');
}

// Handle playback speed change
function handlePlaybackSpeedChange() {
  const speedSelect = document.getElementById('playback-speed');
  animationState.playbackSpeed = parseFloat(speedSelect.value);
}

// Handle view mode change
function handleViewModeChange() {
  const viewMode = document.getElementById('view-mode').value;
  
  switch(viewMode) {
    case 'top-down':
      // North-East view (looking down)
      camera.position.set(0, 1000, 0);
      camera.lookAt(0, 0, 0);
      break;
    case 'side':
      // East-Altitude view
      camera.position.set(1000, 0, 0);
      camera.lookAt(0, 0, 0);
      break;
    case 'trailing':
      // View from behind aircraft (will be updated during animation)
      if (trajectories.length > 0 && trajectories[0].visible) {
        const timeIndex = Math.floor(animationState.currentTimeIndex);
        if (timeIndex < trajectories[0].points.length) {
          const point = trajectories[0].points[timeIndex];
          const offset = new THREE.Vector3(0, 40, -120); // Behind and above, much larger offset for bigger grid
          camera.position.copy(point).add(offset);
          camera.lookAt(point);
        }
      }
      break;
    case 'free':
    default:
      // Free orbit view (leave as is)
      break;
  }
  
  controls.update();
}

// Clear all trajectories
function clearTrajectories() {
  // Remove trajectory objects from scene
  trajectories.forEach(traj => {
    scene.remove(traj.objects.trajectory);
    scene.remove(traj.objects.aircraft);
  });
  
  // Clear array
  trajectories = [];
  
  // Update UI
  updateTrajectoryList();
  
  // Reset time slider
  document.getElementById('time-slider').value = 0;
  document.getElementById('time-slider').max = 100;
  
  // Reset animation state
  animationState.currentTimeIndex = 0;
  animationState.playing = false;
  
  // Clear data display
  document.getElementById('data-n').textContent = '--';
  document.getElementById('data-e').textContent = '--';
  document.getElementById('data-alt').textContent = '--';
  document.getElementById('data-vel').textContent = '--';
  document.getElementById('data-hdg').textContent = '--';
  document.getElementById('time-display').textContent = '00:00.000';
  
  // Clear charts
  Plotly.react('position-chart', [], {
    title: 'Altitude Profile (Real Values)',
    margin: { t: 30, l: 50, r: 20, b: 40 },
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Altitude (m)' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#fff' }
  });
  
  Plotly.react('velocity-chart', [], {
    title: 'Velocity Profile',
    margin: { t: 30, l: 50, r: 20, b: 40 },
    xaxis: { title: 'Time (s)' },
    yaxis: { title: 'Velocity (m/s)' },
    paper_bgcolor: 'rgba(0,0,0,0)',
    plot_bgcolor: 'rgba(0,0,0,0)',
    font: { color: '#fff' }
  });
}

// Reset camera view
function resetView() {
  camera.position.set(200, 200, 200);
  camera.lookAt(0, 0, 0);
  controls.update();
}

// Toggle fullscreen mode
function toggleFullscreen() {
  const container = document.getElementById('visualization-container');
  
  if (!document.fullscreenElement) {
    container.requestFullscreen().catch(err => {
      showMessage(`Error attempting to enable fullscreen mode: ${err.message}`, "error");
    });
  } else {
    document.exitFullscreen();
  }
}

// Handle window resize
function onWindowResize() {
  const container = document.getElementById('visualization-container');
  camera.aspect = container.clientWidth / container.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(container.clientWidth, container.clientHeight);
}

// Function to toggle house visibility
function toggleHouseVisibility(event) {
  try {
    // First save the checkbox state regardless of house model availability
    houseConfig.visible = event.target.checked;
    
    // Safely toggle house model if it exists
    if (!houseModel) {
      console.warn("House model not found! Will apply visibility when house becomes available.");
      showMessage("House model is still initializing. Your preference will be applied when ready.", "warning");
      
      // Try to create the house model if it doesn't exist yet
      if (typeof THREE !== 'undefined' && scene) {
        setTimeout(function() {
          try {
            if (!houseModel) {
              console.log("Attempting to create house model on toggle...");
              houseModel = addHouseModel(
                houseConfig.position.x,
                houseConfig.position.y,
                houseConfig.position.z
              );
              
              if (houseModel) {
                houseModel.visible = houseConfig.visible;
                console.log(`House created and visibility set to: ${houseConfig.visible}`);
                showMessage(`House ${houseConfig.visible ? 'shown' : 'hidden'}`, "success");
              }
            }
          } catch (e) {
            console.error("Error creating house on toggle:", e);
          }
        }, 500);
      }
      return;
    }
    
    // Apply visibility to existing house model
    houseModel.visible = houseConfig.visible;
    console.log(`House visibility set to: ${houseConfig.visible}`);
    showMessage(`House ${houseConfig.visible ? 'shown' : 'hidden'}`, "info");
  } catch (error) {
    console.error("Error toggling house visibility:", error);
    showMessage("Could not change house visibility due to a browser compatibility issue.", "warning");
  }
}

// Function to update house position
function updateHousePosition() {
  try {
    // Get values from input fields
    const x = parseFloat(document.getElementById('house-x').value);
    const y = parseFloat(document.getElementById('house-y').value);
    const z = parseFloat(document.getElementById('house-z').value);
    
    // Validate input values
    if (isNaN(x) || isNaN(y) || isNaN(z)) {
      showMessage("Please enter valid numeric coordinates", "warning");
      return;
    }
    
    // Save position in config
    houseConfig.position = { x, y, z };
    
    // If house model doesn't exist yet, try to create it
    if (!houseModel) {
      console.warn("House model not found! Attempting to create it now.");
      
      if (typeof THREE !== 'undefined' && scene) {
        try {
          console.log("Creating house model on position update...");
          houseModel = addHouseModel(x, y, z);
          
          if (houseModel) {
            // Apply saved visibility setting
            houseModel.visible = houseConfig.visible;
            console.log("House model created at specified position:", houseModel.position);
            showMessage(`House created at position (${x}, ${y}, ${z})`, "success");
          } else {
            showMessage("Could not create house model. Try refreshing the page.", "warning");
          }
        } catch (e) {
          console.error("Error creating house on position update:", e);
          showMessage("Error creating house model. Browser may not support 3D rendering.", "danger");
        }
      } else {
        console.error("THREE.js not available for house creation");
        showMessage("3D library not available. Try refreshing the page.", "warning");
      }
      return;
    }
    
    // Update existing house position - remember in THREE.js Y is up, so we swap Y and Z
    console.log(`Updating house position to: X=${x}, Y=${y}, Z=${z}`);
    
    // In Three.js, we need to set (x, z, y) to match our coordinate system
    houseModel.position.set(x, z, y); 
    
    // Log confirmation
    console.log("New house position set:", houseModel.position);
    showMessage(`House position updated to (${x}, ${y}, ${z})`, "success");
  } catch (error) {
    console.error("Error updating house position:", error);
    showMessage("Could not update house position due to a browser compatibility issue.", "warning");
  }
}

// Show message to user
function showMessage(message, type = "info") {
  // Create a temporary message at the top of visualization container with accessibility support
  const msgElement = document.createElement('div');
  
  // Apply proper styling and ARIA attributes
  msgElement.className = `alert alert-${type} position-absolute top-0 start-50 translate-middle-x mt-3`;
  msgElement.style.zIndex = 1000;
  msgElement.setAttribute('role', 'alert');
  msgElement.setAttribute('aria-live', type === 'danger' ? 'assertive' : 'polite');
  
  // Add appropriate icon based on message type for visual users
  let iconClass = '';
  switch(type) {
    case 'success': iconClass = 'fas fa-check-circle'; break;
    case 'danger': iconClass = 'fas fa-exclamation-circle'; break;
    case 'warning': iconClass = 'fas fa-exclamation-triangle'; break;
    default: iconClass = 'fas fa-info-circle';
  }
  
  // Create icon span that will be hidden from screen readers
  const iconSpan = document.createElement('span');
  iconSpan.className = `${iconClass} me-2`;
  iconSpan.setAttribute('aria-hidden', 'true');
  
  // Add content
  msgElement.appendChild(iconSpan);
  msgElement.appendChild(document.createTextNode(message));
  
  // Add to container
  const container = document.getElementById('visualization-container');
  if (container) {
    container.appendChild(msgElement);
    
    // Remove after 5 seconds with fade effect for non-critical messages
    // Keep error messages longer (7 seconds)
    const timeout = type === 'danger' ? 7000 : 5000;
    
    // Start fade out effect before removal
    setTimeout(() => {
      msgElement.style.transition = 'opacity 0.5s';
      msgElement.style.opacity = '0';
    }, timeout - 500);
    
    setTimeout(() => {
      msgElement.remove();
    }, timeout);
  }
}

/**
 * Refresh trajectories with data from cloud storage
 * @param {Object} processedData - Data processed from cloud files
 */
function refreshTrajectories(processedData) {
  if (!processedData || !Array.isArray(processedData)) {
    showMessage("No valid trajectory data found", "warning");
    return;
  }
  
  // Clear existing trajectories
  clearTrajectories();
  
  // Add each trajectory from processed data
  processedData.forEach((data, index) => {
    if (data && data.points && data.points.length > 0) {
      // Generate a random color for this trajectory
      const colors = [
        0x1e88e5, // blue
        0x43a047, // green
        0xfb8c00, // orange
        0xe53935, // red
        0x8e24aa, // purple
        0x3949ab, // indigo
        0x00acc1, // cyan
        0xffb300  // amber
      ];
      const color = colors[index % colors.length];
      
      // Add the trajectory to the scene
      addTrajectory(data, data.filename || `Trajectory ${index + 1}`, color);
    }
  });
  
  // Update UI
  updateTrajectoryList();
  updateTimeSlider();
  
  // Show success message
  showMessage(`Successfully loaded ${trajectories.length} trajectories`, "success");
  
  // Reset view
  resetView();
}

// SERVER DATA BROWSING FUNCTIONS

// Enhanced Server Data Browser
// --------------------------
// Global state for server data browser
const serverDataBrowser = {
  currentFolder: 'sample_data',
  folders: [],
  files: [],
  selectedFiles: [],
  viewMode: 'list', // 'list' or 'grid'
  sortOption: 'date-desc',
  searchQuery: '',
  currentFilePreview: null
};

// Open the server data browser with cross-browser compatibility
function openServerDataBrowser() {
  // Reset state
  serverDataBrowser.selectedFiles = [];
  serverDataBrowser.searchQuery = '';
  serverDataBrowser.currentFilePreview = null;
  
  // Get UI elements with null checks
  const loadingIndicator = document.getElementById('server-data-loading');
  const errorDisplay = document.getElementById('server-data-error');
  const folderTabs = document.getElementById('folderTabs');
  const fileListContainer = document.getElementById('file-list-container');
  const fileGridContainer = document.getElementById('file-grid-container');
  const fileGrid = document.getElementById('file-grid');
  const emptyFolderMessage = document.getElementById('empty-folder-message');
  const filePreviewPanel = document.getElementById('file-preview-panel');
  const selectedFilesList = document.getElementById('selected-files-list');
  const loadButton = document.getElementById('load-selected-server-files');
  const searchInput = document.getElementById('server-data-search');
  const sortSelect = document.getElementById('server-data-sort');
  const breadcrumb = document.getElementById('current-folder-breadcrumb');
  const fileCountDisplay = document.getElementById('file-count-display');
  
  // Reset UI
  if (loadingIndicator) loadingIndicator.classList.remove('d-none');
  if (errorDisplay) errorDisplay.classList.add('d-none');
  if (folderTabs) folderTabs.innerHTML = '';
  if (fileListContainer) fileListContainer.innerHTML = '';
  if (fileGrid) fileGrid.innerHTML = '';
  if (emptyFolderMessage) emptyFolderMessage.classList.add('d-none');
  if (filePreviewPanel) filePreviewPanel.classList.add('d-none');
  if (searchInput) searchInput.value = '';
  if (breadcrumb) breadcrumb.textContent = 'Loading...';
  if (selectedFilesList) {
    selectedFilesList.innerHTML = `<p class="text-muted text-center mb-0">No files selected. Select files from the list below.</p>`;
  }
  if (fileCountDisplay) fileCountDisplay.textContent = '0 files available';
  
  // Disable load button
  if (loadButton) loadButton.disabled = true;
  
  // Setup event listeners if they don't exist yet
  setupDataBrowserEventListeners();
  
  // Show modal with error handling
  try {
    serverDataModal.show();
  } catch (error) {
    console.error("Error showing modal:", error);
    showMessage("Opening server data browser, please wait...", "info");
  }
  
  // Fetch server data with appropriate method
  fetchServerData('/browse_data')
    .then(processServerData)
    .catch(handleServerDataError);
  
  // Helper function to process server data
  function processServerData(data) {
    // Store server data with fallback defaults
    serverDataBrowser.currentFolder = data.current_folder || 'sample_data';
    serverDataBrowser.folders = data.folders || [];
    serverDataBrowser.files = data.files || [];
    
    // Update breadcrumb
    if (breadcrumb) {
      breadcrumb.textContent = serverDataBrowser.currentFolder.replace('_', ' ');
    }
    
    // Update file count display
    if (fileCountDisplay) {
      const fileCount = serverDataBrowser.files.length;
      fileCountDisplay.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''} available`;
    }
    
    // Render UI components
    try {
      renderFolderTabs();
      renderFileList();
    } catch (error) {
      console.error('Error rendering server data browser:', error);
      showMessage('Error displaying file browser UI', 'warning');
    }
    
    // Hide loading indicator
    if (loadingIndicator) loadingIndicator.classList.add('d-none');
  }
  
  // Helper function to handle errors
  function handleServerDataError(error) {
    console.error('Error loading server data:', error);
    
    // Update UI to show error
    if (loadingIndicator) loadingIndicator.classList.add('d-none');
    
    if (errorDisplay) {
      errorDisplay.classList.remove('d-none');
      errorDisplay.textContent = 'Error loading server data: ' + (error.message || 'Unknown error');
    }
    
    // Show a toast message as well
    showMessage('Error loading server data: ' + (error.message || 'Unknown error'), 'danger');
  }
}

// Set up event listeners for the data browser if they don't exist yet
function setupDataBrowserEventListeners() {
  // Only set up once
  if (window.dataBrowserListenersInitialized) return;
  
  // Search input
  const searchInput = document.getElementById('server-data-search');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      serverDataBrowser.searchQuery = this.value.trim().toLowerCase();
      renderFileList(); // Re-render with filter
    });
  }
  
  // Sort select
  const sortSelect = document.getElementById('server-data-sort');
  if (sortSelect) {
    sortSelect.addEventListener('change', function() {
      serverDataBrowser.sortOption = this.value;
      renderFileList(); // Re-render with new sort order
    });
  }
  
  // View mode toggles
  const listViewBtn = document.getElementById('view-mode-list');
  const gridViewBtn = document.getElementById('view-mode-grid');
  
  if (listViewBtn) {
    listViewBtn.addEventListener('click', function() {
      if (serverDataBrowser.viewMode !== 'list') {
        serverDataBrowser.viewMode = 'list';
        this.classList.add('active');
        if (gridViewBtn) gridViewBtn.classList.remove('active');
        // Toggle containers
        const listContainer = document.getElementById('file-list-container');
        const gridContainer = document.getElementById('file-grid-container');
        if (listContainer) listContainer.classList.remove('d-none');
        if (gridContainer) gridContainer.classList.add('d-none');
      }
    });
  }
  
  if (gridViewBtn) {
    gridViewBtn.addEventListener('click', function() {
      if (serverDataBrowser.viewMode !== 'grid') {
        serverDataBrowser.viewMode = 'grid';
        this.classList.add('active');
        if (listViewBtn) listViewBtn.classList.remove('active');
        // Toggle containers
        const listContainer = document.getElementById('file-list-container');
        const gridContainer = document.getElementById('file-grid-container');
        if (listContainer) listContainer.classList.add('d-none');
        if (gridContainer) gridContainer.classList.remove('d-none');
      }
    });
  }
  
  // Home folder link
  const folderHome = document.getElementById('folder-home');
  if (folderHome) {
    folderHome.addEventListener('click', function(e) {
      e.preventDefault();
      // Reset to default folder
      if (serverDataBrowser.currentFolder !== 'sample_data') {
        changeFolder('sample_data');
      }
    });
  }
  
  // Close preview button with proper focus management
  const closePreview = document.getElementById('close-preview');
  if (closePreview) {
    // Store the element that had focus before opening the preview panel
    let previewTriggerElement = null;
    
    closePreview.addEventListener('click', function() {
      const previewPanel = document.getElementById('file-preview-panel');
      if (previewPanel) {
        previewPanel.classList.add('d-none');
        serverDataBrowser.currentFilePreview = null;
        
        // Return focus to the element that triggered the preview
        if (previewTriggerElement) {
          previewTriggerElement.focus();
          previewTriggerElement = null;
        }
      }
    });
    
    // Add keyboard handler for accessibility
    document.addEventListener('keydown', function(event) {
      const previewPanel = document.getElementById('file-preview-panel');
      // Only process if preview panel is visible
      if (previewPanel && !previewPanel.classList.contains('d-none')) {
        if (event.key === 'Escape') {
          previewPanel.classList.add('d-none');
          serverDataBrowser.currentFilePreview = null;
          
          // Return focus to the element that triggered the preview
          if (previewTriggerElement) {
            previewTriggerElement.focus();
            previewTriggerElement = null;
          }
          
          event.preventDefault();
        }
      }
    });
    
    // Store the trigger element when previewing a file
    window.storePreviewTrigger = function(element) {
      previewTriggerElement = element;
    };
  }
  
  // Mark as initialized
  window.dataBrowserListenersInitialized = true;
}

// Fetch server data with cross-browser compatibility
function fetchServerData(url) {
  return new Promise((resolve, reject) => {
    if (browserSupport.fetch) {
      // Modern browsers - use fetch API
      fetch(url)
        .then(response => {
          if (!response.ok) {
            throw new Error(`Error fetching server data (${response.status}): ${response.statusText}`);
          }
          return response.json();
        })
        .then(resolve)
        .catch(reject);
    } else {
      // Legacy browsers - use XMLHttpRequest
      const xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      
      xhr.onload = function() {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const data = JSON.parse(xhr.responseText);
            resolve(data);
          } catch (error) {
            reject(new Error('Error parsing server response: ' + error.message));
          }
        } else {
          reject(new Error(`Server error (${xhr.status}): ${xhr.statusText}`));
        }
      };
      
      xhr.onerror = function() {
        reject(new Error('Network error occurred'));
      };
      
      xhr.ontimeout = function() {
        reject(new Error('Request timed out'));
      };
      
      xhr.timeout = 30000; // 30 seconds
      
      // Send request with error handling
      try {
        xhr.send();
      } catch (error) {
        reject(new Error('Error sending request: ' + error.message));
      }
    }
  });
}

// Render folder tabs
function renderFolderTabs() {
  const tabsContainer = document.getElementById('folderTabs');
  if (!tabsContainer) return;
  
  tabsContainer.innerHTML = '';
  
  serverDataBrowser.folders.forEach((folder) => {
    const isActive = folder === serverDataBrowser.currentFolder;
    
    const tabItem = document.createElement('li');
    tabItem.className = 'nav-item';
    
    const tabLink = document.createElement('button');
    tabLink.className = `nav-link ${isActive ? 'active' : ''}`;
    tabLink.textContent = folder.replace('_', ' ');
    
    // Add folder icon
    const icon = document.createElement('i');
    icon.className = 'fas fa-folder me-2';
    tabLink.prepend(icon);
    
    // Add event listener
    tabLink.addEventListener('click', () => {
      changeFolder(folder);
    });
    
    tabItem.appendChild(tabLink);
    tabsContainer.appendChild(tabItem);
  });
}

// Change folder with cross-browser compatibility
function changeFolder(folder) {
  if (!folder || folder === serverDataBrowser.currentFolder) {
    return;
  }
  
  // Get UI elements with null checks
  const loadingIndicator = document.getElementById('server-data-loading');
  const errorDisplay = document.getElementById('server-data-error');
  const breadcrumb = document.getElementById('current-folder-breadcrumb');
  const filePreviewPanel = document.getElementById('file-preview-panel');
  
  // Hide any open preview
  if (filePreviewPanel) filePreviewPanel.classList.add('d-none');
  serverDataBrowser.currentFilePreview = null;
  
  // Show loading indicator
  if (loadingIndicator) loadingIndicator.classList.remove('d-none');
  if (errorDisplay) errorDisplay.classList.add('d-none');
  
  // Update breadcrumb
  if (breadcrumb) breadcrumb.textContent = 'Loading...';
  
  // Fetch data for the folder
  fetchServerData(`/browse_data?folder=${encodeURIComponent(folder)}`)
    .then(data => {
      // Update browser state
      serverDataBrowser.currentFolder = data.current_folder || folder;
      serverDataBrowser.files = data.files || [];
      
      // Update breadcrumb
      if (breadcrumb) {
        breadcrumb.textContent = serverDataBrowser.currentFolder.replace('_', ' ');
      }
      
      // Update file count
      const fileCountDisplay = document.getElementById('file-count-display');
      if (fileCountDisplay) {
        const fileCount = serverDataBrowser.files.length;
        fileCountDisplay.textContent = `${fileCount} file${fileCount !== 1 ? 's' : ''} available`;
      }
      
      // Update UI
      renderFolderTabs();
      renderFileList();
      
      // Hide loading indicator
      if (loadingIndicator) loadingIndicator.classList.add('d-none');
    })
    .catch(error => {
      console.error('Error changing folder:', error);
      
      // Update UI to show error
      if (loadingIndicator) loadingIndicator.classList.add('d-none');
      
      if (errorDisplay) {
        errorDisplay.classList.remove('d-none');
        errorDisplay.textContent = 'Error loading folder data: ' + (error.message || 'Unknown error');
      }
      
      // Show a toast message
      showMessage('Error loading folder: ' + folder + ' - ' + (error.message || 'Unknown error'), 'danger');
      
      // Update breadcrumb back to the current folder
      if (breadcrumb) {
        breadcrumb.textContent = serverDataBrowser.currentFolder.replace('_', ' ');
      }
    });
}

// Filter files based on search query
function filterFiles(files) {
  if (!serverDataBrowser.searchQuery) {
    return files;
  }
  
  return files.filter(file => 
    file.name.toLowerCase().includes(serverDataBrowser.searchQuery)
  );
}

// Sort files based on current sort option
function sortFiles(files) {
  const sortOption = serverDataBrowser.sortOption;
  
  return [...files].sort((a, b) => {
    switch (sortOption) {
      case 'name-asc':
        return a.name.localeCompare(b.name);
      case 'name-desc':
        return b.name.localeCompare(a.name);
      case 'date-desc':
        return b.modified - a.modified;
      case 'date-asc':
        return a.modified - b.modified;
      case 'size-desc':
        return b.size - a.size;
      case 'size-asc':
        return a.size - b.size;
      default:
        return 0;
    }
  });
}

// Render file list based on current view mode
function renderFileList() {
  // Filter and sort files
  const filteredFiles = filterFiles(serverDataBrowser.files);
  const sortedFiles = sortFiles(filteredFiles);
  
  // Show empty state if no files
  const emptyFolderMessage = document.getElementById('empty-folder-message');
  if (emptyFolderMessage) {
    if (sortedFiles.length === 0) {
      emptyFolderMessage.classList.remove('d-none');
    } else {
      emptyFolderMessage.classList.add('d-none');
    }
  }
  
  // Update UI based on view mode
  if (serverDataBrowser.viewMode === 'grid') {
    renderGridView(sortedFiles);
  } else {
    renderListView(sortedFiles);
  }
  
  // Update selected files list
  updateSelectedFilesList();
}

// Render list view of files
function renderListView(files) {
  const container = document.getElementById('file-list-container');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (files.length === 0) {
    return;
  }
  
  // Create table
  const table = document.createElement('table');
  table.className = 'table table-hover mb-0';
  
  // Create header
  const thead = document.createElement('thead');
  thead.innerHTML = `
    <tr>
      <th width="40px"><i class="fas fa-check-square" title="Select"></i></th>
      <th>Name</th>
      <th width="100px">Size</th>
      <th width="120px">Actions</th>
    </tr>
  `;
  table.appendChild(thead);
  
  // Create body
  const tbody = document.createElement('tbody');
  
  // Add each file
  files.forEach(file => {
    const isSelected = serverDataBrowser.selectedFiles.some(sf => sf.path === file.path);
    
    const row = document.createElement('tr');
    row.className = `file-row ${isSelected ? 'selected' : ''}`;
    row.dataset.path = file.path;
    
    // Highlight search terms if present
    let fileName = file.name;
    if (serverDataBrowser.searchQuery) {
      const query = serverDataBrowser.searchQuery;
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      fileName = fileName.replace(regex, '<span class="highlight-match">$1</span>');
    }
    
    row.innerHTML = `
      <td>
        <div class="form-check">
          <input class="form-check-input file-checkbox" type="checkbox" value="${file.path}" 
                 id="check-${file.path.replace(/[^\w]/g, '-')}" ${isSelected ? 'checked' : ''}>
        </div>
      </td>
      <td>
        <i class="fas fa-file-csv text-primary me-2"></i>${fileName}
      </td>
      <td>${file.size_formatted || formatValue(file.size || 0, 'B')}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary view-file-btn" data-path="${file.path}">
          <i class="fas fa-eye"></i> Preview
        </button>
      </td>
    `;
    
    // Add event listeners
    const checkbox = row.querySelector('.file-checkbox');
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        toggleFileSelection(file, e.target.checked);
        row.classList.toggle('selected', e.target.checked);
      });
    }
    
    const viewBtn = row.querySelector('.view-file-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger row click
        previewFile(file);
      });
    }
    
    // Row click event (toggle selection)
    row.addEventListener('click', (e) => {
      // Skip if clicking on checkbox or button
      if (e.target.type === 'checkbox' || e.target.tagName === 'BUTTON' || 
          e.target.parentElement.tagName === 'BUTTON' || e.target.tagName === 'I') {
        return;
      }
      
      // Toggle checkbox
      if (checkbox) {
        checkbox.checked = !checkbox.checked;
        toggleFileSelection(file, checkbox.checked);
        row.classList.toggle('selected', checkbox.checked);
      }
    });
    
    tbody.appendChild(row);
  });
  
  table.appendChild(tbody);
  container.appendChild(table);
}

// Render grid view of files
function renderGridView(files) {
  const container = document.getElementById('file-grid');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (files.length === 0) {
    return;
  }
  
  // Add each file as a card
  files.forEach(file => {
    const isSelected = serverDataBrowser.selectedFiles.some(sf => sf.path === file.path);
    
    // Highlight search terms if present
    let fileName = file.name;
    if (serverDataBrowser.searchQuery) {
      const query = serverDataBrowser.searchQuery;
      const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
      fileName = fileName.replace(regex, '<span class="highlight-match">$1</span>');
    }
    
    const card = document.createElement('div');
    card.className = 'col-md-3 col-sm-4 col-6';
    
    card.innerHTML = `
      <div class="card file-grid-item ${isSelected ? 'selected' : ''}">
        <div class="card-body text-center p-3">
          <div class="form-check position-absolute" style="top: 10px; right: 10px;">
            <input class="form-check-input file-checkbox" type="checkbox" value="${file.path}" 
                   id="grid-check-${file.path.replace(/[^\w]/g, '-')}" ${isSelected ? 'checked' : ''}>
          </div>
          <div class="file-icon text-primary">
            <i class="fas fa-file-csv"></i>
          </div>
          <div class="small text-truncate" title="${file.name}">${fileName}</div>
          <div class="small text-muted">${file.size_formatted || formatValue(file.size || 0, 'B')}</div>
          <button class="btn btn-sm btn-outline-primary mt-2 view-file-btn" data-path="${file.path}">
            <i class="fas fa-eye"></i> Preview
          </button>
        </div>
      </div>
    `;
    
    // Add event listeners
    const cardElement = card.querySelector('.file-grid-item');
    const checkbox = card.querySelector('.file-checkbox');
    
    if (checkbox) {
      checkbox.addEventListener('change', (e) => {
        toggleFileSelection(file, e.target.checked);
        if (cardElement) cardElement.classList.toggle('selected', e.target.checked);
      });
    }
    
    const viewBtn = card.querySelector('.view-file-btn');
    if (viewBtn) {
      viewBtn.addEventListener('click', (e) => {
        e.stopPropagation(); // Don't trigger card click
        previewFile(file);
      });
    }
    
    // Card click event (toggle selection)
    if (cardElement) {
      cardElement.addEventListener('click', (e) => {
        // Skip if clicking on checkbox or button
        if (e.target.type === 'checkbox' || e.target.tagName === 'BUTTON' || 
            e.target.parentElement.tagName === 'BUTTON' || e.target.tagName === 'I') {
          return;
        }
        
        // Toggle checkbox
        if (checkbox) {
          checkbox.checked = !checkbox.checked;
          toggleFileSelection(file, checkbox.checked);
          cardElement.classList.toggle('selected', checkbox.checked);
        }
      });
    }
    
    container.appendChild(card);
  });
}

// Update the selected files list UI
function updateSelectedFilesList() {
  const container = document.getElementById('selected-files-list');
  const countElement = document.getElementById('selected-files-count');
  const loadButton = document.getElementById('load-selected-server-files');
  
  if (container) {
    if (serverDataBrowser.selectedFiles.length === 0) {
      container.innerHTML = `<p class="text-muted text-center mb-0">No files selected. Select files from the list below.</p>`;
    } else {
      container.innerHTML = '';
      
      serverDataBrowser.selectedFiles.forEach(file => {
        const badge = document.createElement('span');
        badge.className = 'selected-file-badge';
        badge.innerHTML = `
          <i class="fas fa-file-csv text-primary me-1"></i> ${file.name}
          <i class="fas fa-times-circle remove-selected" data-path="${file.path}"></i>
        `;
        
        // Add event listener to remove button
        const removeBtn = badge.querySelector('.remove-selected');
        if (removeBtn) {
          removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            removeFileSelection(file);
          });
        }
        
        container.appendChild(badge);
      });
    }
  }
  
  // Update count
  if (countElement) {
    countElement.textContent = `Selected: ${serverDataBrowser.selectedFiles.length} files`;
  }
  
  // Update load button state
  if (loadButton) {
    loadButton.disabled = serverDataBrowser.selectedFiles.length === 0;
  }
}

// Toggle file selection
function toggleFileSelection(file, isSelected) {
  if (!file || !file.path) return;
  
  if (isSelected) {
    // Check if already in the array
    if (!serverDataBrowser.selectedFiles.some(f => f.path === file.path)) {
      serverDataBrowser.selectedFiles.push(file);
    }
  } else {
    // Remove from array
    serverDataBrowser.selectedFiles = serverDataBrowser.selectedFiles.filter(f => f.path !== file.path);
  }
  
  // Update UI
  updateSelectedFilesList();
  
  // Update all checkboxes with the same path
  const checkboxes = document.querySelectorAll(`.file-checkbox[value="${file.path}"]`);
  checkboxes.forEach(cb => {
    cb.checked = isSelected;
    
    // Update parent row/card styling
    const row = cb.closest('.file-row');
    if (row) row.classList.toggle('selected', isSelected);
    
    const card = cb.closest('.file-grid-item');
    if (card) card.classList.toggle('selected', isSelected);
  });
}

// Remove file selection
function removeFileSelection(file) {
  toggleFileSelection(file, false);
}

// Preview a file
function previewFile(file) {
  if (!file || !file.path) return;
  
  // Set current preview
  serverDataBrowser.currentFilePreview = file;
  
  // Store the current active element (the button that triggered the preview)
  if (window.storePreviewTrigger && document.activeElement) {
    window.storePreviewTrigger(document.activeElement);
  }
  
  // Update preview panel UI
  const previewPanel = document.getElementById('file-preview-panel');
  const previewFileName = document.getElementById('preview-file-name');
  const previewInfoName = document.getElementById('preview-info-name');
  const previewInfoSize = document.getElementById('preview-info-size');
  const previewInfoType = document.getElementById('preview-info-type');
  const previewInfoPoints = document.getElementById('preview-info-points');
  const previewInfoModified = document.getElementById('preview-info-modified');
  const previewDataSample = document.getElementById('preview-data-sample');
  const closePreviewButton = document.getElementById('close-preview');
  
  // Show panel and update basic info
  if (previewPanel) {
    previewPanel.classList.remove('d-none');
    
    // Announce to screen readers that the preview is now open
    const liveRegion = document.createElement('div');
    liveRegion.setAttribute('aria-live', 'polite');
    liveRegion.className = 'visually-hidden';
    liveRegion.textContent = `Previewing file ${file.name}`;
    document.body.appendChild(liveRegion);
    
    // Remove the live region after announcement
    setTimeout(() => {
      document.body.removeChild(liveRegion);
    }, 1000);
  }
  
  if (previewFileName) previewFileName.textContent = file.name;
  
  // Focus the close button for better keyboard navigation
  if (closePreviewButton) {
    setTimeout(() => {
      closePreviewButton.focus();
    }, 100);
  }
  if (previewInfoName) previewInfoName.textContent = file.name;
  if (previewInfoSize) previewInfoSize.textContent = file.size_formatted || formatValue(file.size || 0, 'B');
  if (previewInfoType) previewInfoType.textContent = getFileExtension(file.name).toUpperCase() || 'Unknown';
  if (previewInfoModified) {
    const date = new Date(file.modified * 1000);
    previewInfoModified.textContent = date.toLocaleString();
  }
  
  // Show loading state for data
  if (previewDataSample) {
    previewDataSample.innerHTML = `
      <div class="text-center py-3" aria-live="polite" aria-busy="true">
        <div class="spinner-border text-primary" role="status">
          <span class="visually-hidden">Loading...</span>
        </div>
        <p class="mt-2" id="preview-loading-message">Loading preview of ${file.name}...</p>
      </div>
    `;
  }
  
  // Fetch preview data
  fetchServerData(`/get_server_file?path=${encodeURIComponent(file.path)}`)
    .then(data => {
      // Update points count
      if (previewInfoPoints && data.metadata && data.metadata.points_count) {
        previewInfoPoints.textContent = `${data.metadata.points_count} / ${data.metadata.original_count || 'N/A'}`;
      } else if (previewInfoPoints) {
        previewInfoPoints.textContent = data.data ? data.data.length.toString() : '0';
      }
      
      // Show data sample
      if (previewDataSample && data.data) {
        // Show only first 10 records
        const sampleData = data.data.slice(0, 10);
        
        if (sampleData.length > 0) {
          // Get all unique keys from the data
          const allKeys = new Set();
          sampleData.forEach(item => {
            Object.keys(item).forEach(key => allKeys.add(key));
          });
          
          // Convert to array and sort
          const keys = Array.from(allKeys).sort();
          
          // Create table with ARIA attributes for better accessibility
          let tableHtml = '<table class="table table-sm table-striped" aria-label="Flight data sample" role="grid">';
          
          // Table header
          tableHtml += '<thead><tr role="row">';
          keys.forEach(key => {
            tableHtml += `<th role="columnheader" scope="col">${key}</th>`;
          });
          tableHtml += '</tr></thead>';
          
          // Table body
          tableHtml += '<tbody>';
          sampleData.forEach((item, index) => {
            tableHtml += `<tr role="row">`;
            keys.forEach(key => {
              const cellValue = item[key] !== undefined ? item[key] : '-';
              // First column should be a header for the row in most cases
              if (key === keys[0]) {
                tableHtml += `<th role="rowheader" scope="row">${cellValue}</th>`;
              } else {
                tableHtml += `<td role="cell">${cellValue}</td>`;
              }
            });
            tableHtml += '</tr>';
          });
          tableHtml += '</tbody></table>';
          
          // Add note if there's more data with proper screen reader context
          if (data.data.length > 10) {
            tableHtml += `<p class="text-muted small mt-2" aria-live="polite">
              <i class="fas fa-info-circle me-1" aria-hidden="true"></i>
              Showing 10 of ${data.data.length} records. Additional data is available in the full visualization.
            </p>`;
          }
          
          previewDataSample.innerHTML = tableHtml;
        } else {
          previewDataSample.innerHTML = '<div class="alert alert-info" role="alert"><i class="fas fa-info-circle me-2" aria-hidden="true"></i>No data available for preview.</div>';
        }
      } else if (previewDataSample) {
        previewDataSample.innerHTML = '<div class="alert alert-warning" role="alert" aria-live="assertive"><i class="fas fa-exclamation-triangle me-2" aria-hidden="true"></i>Unable to load preview data.</div>';
      }
    })
    .catch(error => {
      console.error('Error loading file preview:', error);
      
      if (previewDataSample) {
        previewDataSample.innerHTML = `<div class="alert alert-danger" role="alert" aria-live="assertive">
          <i class="fas fa-exclamation-circle me-2" aria-hidden="true"></i>
          Error loading preview: ${error.message || 'Unknown error'}
        </div>`;
      }
      
      if (previewInfoPoints) {
        previewInfoPoints.textContent = 'Error';
      }
    });
}

// Get file extension
function getFileExtension(filename) {
  return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2) || '';
}

// View server file data with cross-browser compatibility
function viewServerFile(filePath) {
  if (!filePath) {
    showMessage("Invalid file path", "warning");
    return;
  }
  
  // Get UI elements with null checks for resilience
  const progressBar = document.getElementById('upload-progress');
  const statusText = document.getElementById('upload-status');
  
  // Show loading in the modal with error handling
  try {
    serverDataModal.hide();
  } catch (error) {
    console.error("Error hiding server data modal:", error);
  }
  
  try {
    uploadModal.show();
  } catch (error) {
    console.error("Error showing upload modal:", error);
    showMessage("Loading file preview...", "info");
  }
  
  // Update progress UI with null checks
  if (progressBar) progressBar.style.width = '0%';
  if (statusText) statusText.textContent = `Loading file preview...`;
  
  // Handle file fetching based on browser support
  if (browserSupport.fetch) {
    // Modern browsers - use fetch API
    fetch(`/get_server_file?path=${encodeURIComponent(filePath)}`)
      .then(response => {
        if (!response.ok) {
          return response.json()
            .then(err => { throw new Error(err.error || `Server error (${response.status})`) })
            .catch(e => { throw new Error(`Server error (${response.status}): ${response.statusText}`) });
        }
        return response.json();
      })
      .then(data => {
        handleFilePreviewSuccess(data);
      })
      .catch(error => {
        handleFilePreviewError(error);
      });
  } else {
    // Legacy browsers - use XMLHttpRequest
    const xhr = new XMLHttpRequest();
    xhr.open('GET', `/get_server_file?path=${encodeURIComponent(filePath)}`, true);
    
    xhr.onload = function() {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const data = JSON.parse(xhr.responseText);
          handleFilePreviewSuccess(data);
        } catch (error) {
          handleFilePreviewError(new Error('Error parsing file data: ' + error.message));
        }
      } else {
        try {
          const response = JSON.parse(xhr.responseText);
          handleFilePreviewError(new Error(response.error || `Server error (${xhr.status}): ${xhr.statusText}`));
        } catch (e) {
          handleFilePreviewError(new Error(`Server error (${xhr.status}): ${xhr.statusText}`));
        }
      }
    };
    
    xhr.onerror = function() {
      handleFilePreviewError(new Error('Network error occurred'));
    };
    
    xhr.ontimeout = function() {
      handleFilePreviewError(new Error('Request timed out'));
    };
    
    xhr.timeout = 60000; // 60 seconds for potentially large files
    
    // Send request with error handling
    try {
      xhr.send();
    } catch (error) {
      handleFilePreviewError(new Error('Error sending request: ' + error.message));
    }
  }
  
  // Helper function to handle successful file preview
  function handleFilePreviewSuccess(data) {
    // Update progress UI
    if (progressBar) progressBar.style.width = '100%';
    if (statusText) {
      statusText.textContent = `File preview loaded successfully! Found ${data.data ? data.data.length : 0} data points.`;
    }
    
    // Hide modal after a brief delay
    setTimeout(() => {
      try {
        uploadModal.hide();
        serverDataModal.show();
      } catch (error) {
        console.error("Error switching modals:", error);
      }
    }, 2000);
  }
  
  // Helper function to handle file preview errors
  function handleFilePreviewError(error) {
    console.error("Error previewing file:", error);
    
    // Update progress UI
    if (progressBar) progressBar.style.width = '100%';
    if (statusText) {
      statusText.textContent = `Error loading file preview: ${error.message || 'Unknown error'}`;
    }
    
    // Show error message after a brief delay
    setTimeout(() => {
      try {
        uploadModal.hide();
        serverDataModal.show();
      } catch (error) {
        console.error("Error switching modals:", error);
      }
      
      showMessage(`Error previewing file: ${error.message || 'Unknown error'}`, 'danger');
    }, 2000);
  }
}

// Load selected server files for visualization
function loadSelectedServerFiles() {
  // Validate selection
  if (!serverDataBrowser.selectedFiles || serverDataBrowser.selectedFiles.length === 0) {
    showMessage('No files selected', 'warning');
    return;
  }
  
  // Get UI elements with null checks for resilience
  const progressBar = document.getElementById('upload-progress');
  const statusText = document.getElementById('upload-status');
  
  // Close/show modals with error handling
  try {
    serverDataModal.hide();
  } catch (error) {
    console.error("Error hiding server data modal:", error);
  }
  
  try {
    uploadModal.show();
  } catch (error) {
    console.error("Error showing upload modal:", error);
    showMessage("Processing files, please wait...", "info");
  }
  
  // Update UI with null checks
  if (progressBar) progressBar.style.width = '0%';
  if (statusText) statusText.textContent = 'Preparing to visualize flight data...';
  
  // Reset any existing trajectories
  clearTrajectories();
  
  // Initialize processing variables
  let processedCount = 0;
  let failedCount = 0;
  const colors = [0x0088ff, 0xff8800, 0x88ff00, 0xff0088, 0x00ff88, 0x8800ff];
  
  // Make a copy of selected files to avoid issues if the modal is reopened
  const filesToProcess = [...serverDataBrowser.selectedFiles];
  const totalFiles = filesToProcess.length;
  
  // Process files sequentially to avoid overwhelming the server
  processNextFile(0);
  
  // Process files one at a time
  function processNextFile(index) {
    // All files processed
    if (index >= totalFiles) {
      finishProcessing();
      return;
    }
    
    const file = filesToProcess[index];
    
    // Update status
    if (statusText) {
      statusText.textContent = `Processing file ${index + 1} of ${totalFiles}: ${file.name || 'Unknown file'}`;
    }
    
    if (progressBar) {
      progressBar.style.width = `${(index / totalFiles) * 100}%`;
    }
    
    // Fetch file data
    fetchServerData(`/get_server_file?path=${encodeURIComponent(file.path)}`)
      .then(data => {
        processedCount++;
        
        // Update progress UI
        if (progressBar) {
          progressBar.style.width = `${(processedCount / totalFiles) * 100}%`;
        }
        
        // Check if we have data points
        if (!data.data || data.data.length === 0) {
          throw new Error('No valid data points found in file');
        }
        
        try {
          // Log metadata
          console.log(`File ${file.name || 'unknown'} metadata:`, data.metadata);
          
          // Add trajectory to scene
          addTrajectory(data.data, file.name || `File ${index + 1}`, colors[index % colors.length]);
          
          // Update status
          if (statusText) {
            statusText.textContent = `Processed ${processedCount} of ${totalFiles} files`;
            if (data.metadata && data.metadata.points_count) {
              statusText.textContent += ` (${data.metadata.points_count} points from ${data.metadata.original_count || 'unknown'} total)`;
            }
          }
        } catch (error) {
          console.error("Error adding trajectory:", error);
          failedCount++;
          if (statusText) {
            statusText.textContent = `Error visualizing ${file.name || 'file'}: ${error.message || 'Unknown error'}`;
          }
        }
        
        // Process next file
        processNextFile(index + 1);
      })
      .catch(error => {
        console.error("Error processing file:", error);
        
        // Update status
        if (statusText) {
          statusText.textContent = `Error processing ${file.name || 'file'}: ${error.message || 'Unknown error'}`;
        }
        
        processedCount++;
        failedCount++;
        
        // Update progress even if there's an error
        if (progressBar) {
          progressBar.style.width = `${(processedCount / totalFiles) * 100}%`;
        }
        
        // Continue with next file
        processNextFile(index + 1);
      });
  }
  
  // Finish processing and update UI
  function finishProcessing() {
    // Hide modal after a brief delay
    setTimeout(() => {
      try {
        uploadModal.hide();
      } catch (error) {
        console.error("Error hiding modal:", error);
      }
      
      // Update UI
      updateTrajectoryList();
      updateTimeSlider();
      
      // Show completion message
      const successCount = processedCount - failedCount;
      if (failedCount > 0) {
        if (successCount > 0) {
          showMessage(`Visualized ${successCount} of ${totalFiles} flight trajectories. ${failedCount} file(s) had errors.`, "warning");
        } else {
          showMessage(`Failed to visualize all ${totalFiles} files. Please check file format and try again.`, "danger");
        }
      } else {
        showMessage(`Successfully visualized ${totalFiles} flight trajectories`, "success");
      }
      
      // Clear selection in data browser
      serverDataBrowser.selectedFiles = [];
    }, 500);
  }
}
