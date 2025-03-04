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

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
  // Initialize 3D scene
  initScene();
  
  // Initialize empty charts
  initCharts();
  
  // Add event listeners
  document.getElementById('load-files-btn').addEventListener('click', handleFileUpload);
  document.getElementById('view-mode').addEventListener('change', handleViewModeChange);
  document.getElementById('play-btn').addEventListener('click', playAnimation);
  document.getElementById('pause-btn').addEventListener('click', pauseAnimation);
  document.getElementById('time-slider').addEventListener('input', handleTimeSliderChange);
  document.getElementById('playback-speed').addEventListener('change', handlePlaybackSpeedChange);
  document.getElementById('reset-view-btn').addEventListener('click', resetView);
  document.getElementById('fullscreen-btn').addEventListener('click', toggleFullscreen);
  
  // Initialize modal
  uploadModal = new bootstrap.Modal(document.getElementById('uploadModal'));
  
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
  camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 2000);
  camera.position.set(50, 50, 50);
  
  // Create renderer
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);
  
  // Add orbit controls
  controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;
  
  // Add grid helper - much larger grid to accommodate flight data
  const gridHelper = new THREE.GridHelper(1000, 100, 0x555555, 0x333333);
  scene.add(gridHelper);
  
  // Add axes helper (red = x, green = y, blue = z) - much larger
  const axesHelper = new THREE.AxesHelper(50);
  scene.add(axesHelper);
  
  // Add lighting
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);
  
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
  directionalLight.position.set(5, 10, 7.5);
  scene.add(directionalLight);
  
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

// Handle file upload
function handleFileUpload() {
  const fileInput = document.getElementById('file-input');
  const files = fileInput.files;
  
  if (files.length === 0) {
    showMessage("Please select at least one file to upload", "warning");
    return;
  }
  
  // Show upload modal
  uploadModal.show();
  const progressBar = document.getElementById('upload-progress');
  const statusText = document.getElementById('upload-status');
  
  // Reset any existing trajectories
  clearTrajectories();
  
  // Process each file
  let processedCount = 0;
  const colors = [0x0088ff, 0xff8800, 0x88ff00, 0xff0088, 0x00ff88, 0x8800ff];
  
  // Use server-side processing for large files and to handle Unix timestamps
  Array.from(files).forEach((file, index) => {
    statusText.textContent = `Processing file: ${file.name}`;
    progressBar.style.width = `${(index / files.length) * 100}%`;
    
    // Create form data for file upload
    const formData = new FormData();
    formData.append('file', file);
    
    // Send file to server for processing
    fetch('/process_csv', {
      method: 'POST',
      body: formData
    })
    .then(response => {
      if (!response.ok) {
        return response.json().then(err => { throw new Error(err.error || 'Server error') });
      }
      return response.json();
    })
    .then(data => {
      processedCount++;
      progressBar.style.width = `${(processedCount / files.length) * 100}%`;
      
      // Check if we have data points
      if (!data.data || data.data.length === 0) {
        throw new Error('No valid data points found in file');
      }
      
      // Log metadata
      console.log(`File ${file.name} metadata:`, data.metadata);
      
      // Add trajectory to scene
      addTrajectory(data.data, file.name, colors[index % colors.length]);
      
      // Update status
      statusText.textContent = `Processed ${processedCount} of ${files.length} files`;
      statusText.textContent += ` (${data.metadata.points_count} points from ${data.metadata.original_count} total)`;
      
      // If all files are processed, close modal and update UI
      if (processedCount === files.length) {
        setTimeout(() => {
          uploadModal.hide();
          updateTrajectoryList();
          updateTimeSlider();
          showMessage(`Successfully loaded ${files.length} trajectories`, "success");
        }, 500);
      }
    })
    .catch(error => {
      console.error("Error processing file:", error);
      statusText.textContent = `Error processing ${file.name}: ${error.message}`;
      processedCount++;
      
      // Update progress even if there's an error
      progressBar.style.width = `${(processedCount / files.length) * 100}%`;
    });
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
  // Extract position points for trajectory line
  const points = data.map(point => new THREE.Vector3(
    point.position_e || 0,       // X axis (East)
    -point.position_d || 0,      // Y axis (Up - note the negative since 'd' is down)
    point.position_n || 0        // Z axis (North)
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
  
  // Store the trajectory data
  trajectories.push({
    name: name,
    data: data,
    points: points,
    visible: true,
    color: color,
    objects: {
      trajectory: trajectory,
      aircraft: aircraft
    }
  });
  
  // Update charts with this trajectory's data
  updateCharts();
}

// Create aircraft model
function createAircraftModel(color) {
  // Simple aircraft representation using a cone - larger size for better visibility
  const geometry = new THREE.ConeGeometry(2, 5, 4);
  geometry.rotateX(Math.PI / 2);
  const material = new THREE.MeshPhongMaterial({ color: color });
  
  return new THREE.Mesh(geometry, material);
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
  
  // Update position
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
  
  // Prepare data for altitude chart
  const altitudeTraces = trajectories.filter(t => t.visible).map(traj => {
    const times = traj.data.map(d => d.time);
    const altitudes = traj.data.map(d => -d.position_d); // Negative of down is up
    
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
  
  // Update charts
  Plotly.react('position-chart', altitudeTraces, {
    title: 'Altitude Profile',
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
      camera.position.set(0, 200, 0);
      camera.lookAt(0, 0, 0);
      break;
    case 'side':
      // East-Altitude view
      camera.position.set(200, 0, 0);
      camera.lookAt(0, 0, 0);
      break;
    case 'trailing':
      // View from behind aircraft (will be updated during animation)
      if (trajectories.length > 0 && trajectories[0].visible) {
        const timeIndex = Math.floor(animationState.currentTimeIndex);
        if (timeIndex < trajectories[0].points.length) {
          const point = trajectories[0].points[timeIndex];
          const offset = new THREE.Vector3(0, 10, -30); // Behind and above, larger offset
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
    title: 'Altitude Profile',
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
  camera.position.set(50, 50, 50);
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

// Show message to user
function showMessage(message, type = "info") {
  // Create a temporary message at the top of visualization container
  const msgElement = document.createElement('div');
  msgElement.className = `alert alert-${type} position-absolute top-0 start-50 translate-middle-x mt-3`;
  msgElement.style.zIndex = 1000;
  msgElement.textContent = message;
  
  document.getElementById('visualization-container').appendChild(msgElement);
  
  // Remove after 3 seconds
  setTimeout(() => {
    msgElement.remove();
  }, 3000);
}
