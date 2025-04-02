/**
 * Attack Analyzer and Visualizer Module
 * 
 * Handles attack detection visualization for flight trajectory data
 * Integrates with the main visualization system to highlight attack segments
 */

class AttackVisualizer {
  constructor() {
    // Initialize settings
    this.settings = {
      enabled: true,                  // Master toggle for attack visualization
      showAttackMarkers: true,        // Show 3D markers at attack points
      highlightAttackSegments: true,  // Highlight attack segments on trajectories
      highlightAttackAltitude: true,  // Show attack segments in altitude chart
      highlightAttackVelocity: true,  // Show attack segments in velocity chart
      showAttackInfo: true,           // Show attack information panel
      markerScale: 1.0,               // Scale factor for attack markers
      colorByAttackType: true         // Color code by attack type vs. single color
    };
    
    // Attack type color mapping
    this.attackColors = {
      'PA': 0xff0000,   // Point Attack (Red)
      'RV': 0xff8800,   // Random Value Attack (Orange)
      'SA': 0xffff00,   // Sequence Attack (Yellow)
      'RA': 0x00ff00,   // Ramp Attack (Green)
      'DoS': 0x00ffff,  // Denial-of-Service (Cyan)
      'RP': 0x0088ff,   // Random Attack (Blue)
      'default': 0xff00ff  // Default (Magenta)
    };
    
    // Attack type full names for display
    this.attackTypeNames = {
      'PA': 'Point Attack',
      'RV': 'Random Value Attack',
      'SA': 'Sequence Attack',
      'RA': 'Ramp Attack',
      'DoS': 'Denial-of-Service',
      'RP': 'Random Attack',
      'Random Pulsed Attack': 'Random Pulsed Attack',
      'default': 'Unknown Attack'
    };
    
    // Elements for UI
    this.infoPanel = null;
    this.attackLegend = null;
    
    // Map of active attack markers
    this.attackMarkers = [];
    
    // Attack segments detected across all trajectories
    this.attackSegmentsAll = [];
  }
  
  /**
   * Initialize the attack visualizer
   */
  init() {
    console.log("Initializing Attack Visualizer...");
    this.initializeUI();
    this.bindEventListeners();
    return this;
  }
  
  /**
   * Initialize UI elements for attack visualization
   */
  initializeUI() {
    // Add attack settings to the settings panel
    const settingsPanel = document.getElementById('settings-panel');
    if (settingsPanel) {
      // Create attack settings section
      const attackSettingsSection = document.createElement('div');
      attackSettingsSection.className = 'mt-3 pt-2 border-top';
      attackSettingsSection.innerHTML = `
        <h6 class="mb-2 text-info">
          <i class="fas fa-shield-alt me-1"></i> Attack Visualization
        </h6>
        <div class="form-check form-switch mb-2">
          <input class="form-check-input" type="checkbox" id="enable-attack-viz" ${this.settings.enabled ? 'checked' : ''}>
          <label class="form-check-label" for="enable-attack-viz">Enable Attack Visualization</label>
        </div>
        <div class="attack-settings-options" ${!this.settings.enabled ? 'style="opacity: 0.5;"' : ''}>
          <div class="form-check form-switch ms-3 mb-1">
            <input class="form-check-input" type="checkbox" id="show-attack-markers" ${this.settings.showAttackMarkers ? 'checked' : ''} ${!this.settings.enabled ? 'disabled' : ''}>
            <label class="form-check-label" for="show-attack-markers">Show 3D Markers</label>
          </div>
          <div class="form-check form-switch ms-3 mb-1">
            <input class="form-check-input" type="checkbox" id="highlight-attack-segments" ${this.settings.highlightAttackSegments ? 'checked' : ''} ${!this.settings.enabled ? 'disabled' : ''}>
            <label class="form-check-label" for="highlight-attack-segments">Highlight Trajectory Segments</label>
          </div>
          <div class="form-check form-switch ms-3 mb-1">
            <input class="form-check-input" type="checkbox" id="highlight-attack-altitude" ${this.settings.highlightAttackAltitude ? 'checked' : ''} ${!this.settings.enabled ? 'disabled' : ''}>
            <label class="form-check-label" for="highlight-attack-altitude">Show in Altitude Chart</label>
          </div>
          <div class="form-check form-switch ms-3 mb-1">
            <input class="form-check-input" type="checkbox" id="highlight-attack-velocity" ${this.settings.highlightAttackVelocity ? 'checked' : ''} ${!this.settings.enabled ? 'disabled' : ''}>
            <label class="form-check-label" for="highlight-attack-velocity">Show in Velocity Chart</label>
          </div>
          <div class="form-check form-switch ms-3 mb-1">
            <input class="form-check-input" type="checkbox" id="show-attack-info" ${this.settings.showAttackInfo ? 'checked' : ''} ${!this.settings.enabled ? 'disabled' : ''}>
            <label class="form-check-label" for="show-attack-info">Show Attack Info Panel</label>
          </div>
        </div>
      `;
      
      settingsPanel.appendChild(attackSettingsSection);
      
      // Create attack color legend
      const legendDiv = document.createElement('div');
      legendDiv.className = 'attack-legend mt-2 ms-3';
      legendDiv.style.display = this.settings.enabled ? 'block' : 'none';
      legendDiv.innerHTML = `<h6>Attack Types</h6>`;
      
      const attackTypeList = document.createElement('div');
      attackTypeList.className = 'attack-type-list';
      
      // Add each attack type to the legend
      Object.keys(this.attackColors).forEach(attackType => {
        if (attackType === 'default') return;
        
        const item = document.createElement('div');
        item.className = 'attack-type-item';
        
        const colorSample = document.createElement('span');
        colorSample.className = 'attack-color-sample';
        colorSample.style.backgroundColor = '#' + this.attackColors[attackType].toString(16).padStart(6, '0');
        
        const typeName = document.createElement('span');
        typeName.className = 'attack-type-name';
        typeName.textContent = this.attackTypeNames[attackType] || attackType;
        
        item.appendChild(colorSample);
        item.appendChild(typeName);
        attackTypeList.appendChild(item);
      });
      
      legendDiv.appendChild(attackTypeList);
      this.attackLegend = legendDiv;
      settingsPanel.appendChild(legendDiv);
    }
    
    // Create info panel for attack details
    const infoPanel = document.createElement('div');
    infoPanel.className = 'attack-info-panel';
    infoPanel.style.display = 'none';
    infoPanel.innerHTML = `
      <h6 class="mb-2"><i class="fas fa-exclamation-triangle text-warning me-1"></i> Attack Detected</h6>
      <div class="attack-info-content">
        <p class="mb-1"><strong>Type:</strong> <span id="attack-type">Unknown</span></p>
        <p class="mb-1"><strong>Duration:</strong> <span id="attack-duration">0.0s</span></p>
        <p class="mb-1"><strong>Affected:</strong> <span id="attack-affected">Position</span></p>
        <p class="mb-0"><strong>Deviation:</strong> <span id="attack-deviation">±0.0m</span></p>
      </div>
    `;
    
    this.infoPanel = infoPanel;
    const visualizationContainer = document.getElementById('visualization-container');
    if (visualizationContainer) {
      visualizationContainer.appendChild(infoPanel);
    }
  }
  
  /**
   * Bind event listeners for attack visualization settings
   */
  bindEventListeners() {
    // Main enable/disable toggle
    const enableAttackViz = document.getElementById('enable-attack-viz');
    if (enableAttackViz) {
      enableAttackViz.addEventListener('change', (e) => {
        this.settings.enabled = e.target.checked;
        
        // Update UI
        const attackSettingsOptions = document.querySelector('.attack-settings-options');
        if (attackSettingsOptions) {
          attackSettingsOptions.style.opacity = this.settings.enabled ? '1' : '0.5';
        }
        
        // Enable/disable individual controls
        ['show-attack-markers', 'highlight-attack-segments', 'highlight-attack-altitude', 
         'highlight-attack-velocity', 'show-attack-info'].forEach(id => {
          const element = document.getElementById(id);
          if (element) {
            element.disabled = !this.settings.enabled;
          }
        });
        
        // Toggle legend visibility
        if (this.attackLegend) {
          this.attackLegend.style.display = this.settings.enabled ? 'block' : 'none';
        }
        
        // Hide info panel if disabled
        if (!this.settings.enabled && this.infoPanel) {
          this.infoPanel.style.display = 'none';
        }
        
        // Update visualization
        this.updateVisualization();
      });
    }
    
    // Individual settings
    const settingsMap = {
      'show-attack-markers': 'showAttackMarkers',
      'highlight-attack-segments': 'highlightAttackSegments',
      'highlight-attack-altitude': 'highlightAttackAltitude',
      'highlight-attack-velocity': 'highlightAttackVelocity',
      'show-attack-info': 'showAttackInfo'
    };
    
    Object.keys(settingsMap).forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener('change', (e) => {
          this.settings[settingsMap[id]] = e.target.checked;
          
          // Update visualization
          this.updateVisualization();
          
          // Special case for info panel
          if (id === 'show-attack-info' && this.infoPanel) {
            this.infoPanel.style.display = (this.settings.enabled && this.settings.showAttackInfo) ? 'block' : 'none';
          }
        });
      }
    });
  }
  
  /**
   * Process trajectories to identify attack segments
   * @param {Object} trajectory - Trajectory object with data and visualization properties
   * @param {number} trajectoryIndex - Index of the trajectory
   */
  processTrajectory(trajectory, trajectoryIndex) {
    if (!trajectory || !trajectory.data || !Array.isArray(trajectory.data)) {
      console.warn("Invalid trajectory data for attack processing");
      return;
    }
    
    // Check if trajectory has attack data
    const hasAttackData = trajectory.data.some(point => 
      point.is_attacked || 
      point.attack_type || 
      (typeof point.attack_status !== 'undefined' && point.attack_status !== null)
    );
    
    if (!hasAttackData) {
      console.log("No attack data found in trajectory");
      return;
    }
    
    console.log(`Processing attack data for trajectory ${trajectoryIndex}: ${trajectory.name}`);
    
    // Identify continuous attack segments
    const attackSegments = [];
    let currentSegment = null;
    
    trajectory.data.forEach((point, pointIndex) => {
      // Determine if this point is under attack
      const isAttacked = this.isPointUnderAttack(point);
      
      if (isAttacked) {
        // Get attack type
        const attackType = point.attack_type || 
                          (point.is_attacked ? 'default' : null);
        
        // If we're not in an attack segment, start a new one
        if (!currentSegment) {
          currentSegment = {
            startIndex: pointIndex,
            startTime: point.time,
            type: attackType,
            points: [pointIndex],
            affectedParameters: this.getAffectedParameters(point)
          };
        } else {
          // Continue existing segment
          currentSegment.points.push(pointIndex);
          
          // Update attack type if it changed
          if (attackType && attackType !== currentSegment.type) {
            currentSegment.type = attackType;
          }
          
          // Update affected parameters
          const affectedParams = this.getAffectedParameters(point);
          affectedParams.forEach(param => {
            if (!currentSegment.affectedParameters.includes(param)) {
              currentSegment.affectedParameters.push(param);
            }
          });
        }
      } else if (currentSegment) {
        // End of attack segment
        currentSegment.endIndex = pointIndex - 1;
        currentSegment.endTime = trajectory.data[pointIndex - 1].time;
        currentSegment.duration = currentSegment.endTime - currentSegment.startTime;
        
        // Calculate impact (deviation)
        currentSegment.maxDeviation = this.calculateMaxDeviation(trajectory, currentSegment);
        
        // Store segment
        attackSegments.push(currentSegment);
        currentSegment = null;
      }
    });
    
    // Handle case where attack continues to the end of trajectory
    if (currentSegment) {
      const lastIndex = trajectory.data.length - 1;
      currentSegment.endIndex = lastIndex;
      currentSegment.endTime = trajectory.data[lastIndex].time;
      currentSegment.duration = currentSegment.endTime - currentSegment.startTime;
      
      // Calculate impact (deviation)
      currentSegment.maxDeviation = this.calculateMaxDeviation(trajectory, currentSegment);
      
      attackSegments.push(currentSegment);
    }
    
    // Store segments in trajectory
    trajectory.attackSegments = attackSegments;
    
    // Also store in global list with trajectory reference
    attackSegments.forEach(segment => {
      this.attackSegmentsAll.push({
        ...segment,
        trajectoryIndex,
        trajectoryName: trajectory.name
      });
    });
    
    console.log(`Found ${attackSegments.length} attack segments in trajectory ${trajectoryIndex}`);
    return attackSegments;
  }
  
  /**
   * Get color for attack visualization based on attack type
   * @param {string} attackType - The type of attack
   * @returns {number} - Color code for the attack
   */
  getAttackColor(attackType) {
    if (!attackType || !this.settings.colorByAttackType) {
      return this.attackColors.default;
    }
    
    return this.attackColors[attackType] || this.attackColors.default;
  }
  
  /**
   * Update visualization based on current settings and attack segments
   */
  updateVisualization() {
    // Process all visible trajectories
    if (trajectories) {
      trajectories.forEach((trajectory, index) => {
        if (!trajectory.visible) return;
        
        // Skip trajectories without attack data
        if (!trajectory.hasAttackData) return;
        
        // Update trajectory line visualization
        if (this.settings.enabled && this.settings.highlightAttackSegments) {
          this.visualizeAttacksOnTrajectory(trajectory.objects.trajectory, trajectory, index);
        } else {
          // Reset to original appearance if visualization is disabled
          // We need to recreate the material to reset it
          if (trajectory.objects.trajectory.material) {
            const originalColor = trajectory.color;
            trajectory.objects.trajectory.material = new THREE.LineBasicMaterial({
              color: originalColor,
              linewidth: 2
            });
          }
        }
        
        // Update attack markers
        this.updateAttackMarkers(trajectory, index);
      });
    }
    
    // Update charts
    if (typeof updateCharts === 'function') {
      updateCharts();
    }
  }
  
  /**
   * Update attack markers visibility and position
   * @param {Object} trajectory - Trajectory data object
   * @param {number} trajectoryIndex - Index of the trajectory
   */
  updateAttackMarkers(trajectory, trajectoryIndex) {
    if (!trajectory.objects.attackMarkers) return;
    
    const visible = this.settings.enabled && this.settings.showAttackMarkers;
    
    trajectory.objects.attackMarkers.forEach(marker => {
      if (marker) {
        marker.visible = visible && trajectory.visible;
      }
    });
  }
  
  /**
   * Determine if a point is under attack
   * @param {Object} point - Trajectory point data
   * @returns {boolean} - True if point is under attack
   */
  isPointUnderAttack(point) {
    // Different data formats support
    if (point.is_attacked) return true;
    
    if (point.attack_type && point.attack_type !== 'None') return true;
    
    if (typeof point.attack_status !== 'undefined' && 
        point.attack_status !== null && 
        point.attack_status !== 0 && 
        point.attack_status !== false) return true;
    
    return false;
  }
  
  /**
   * Identify parameters affected by an attack
   * @param {Object} point - Trajectory point data
   * @returns {Array} - List of affected parameters
   */
  getAffectedParameters(point) {
    const affected = [];
    
    // Check for specific attack indicators
    if (point.delta_position_n) affected.push('position_n');
    if (point.delta_position_e) affected.push('position_e');
    if (point.delta_position_d) affected.push('position_d');
    if (point.delta_velocity) affected.push('velocity');
    
    // If no specific indicators, assume position is affected
    if (affected.length === 0 && this.isPointUnderAttack(point)) {
      affected.push('position');
    }
    
    return affected;
  }
  
  /**
   * Calculate maximum deviation caused by an attack
   * @param {Object} trajectory - Trajectory data
   * @param {Object} segment - Attack segment information
   * @returns {number} - Maximum deviation in meters
   */
  calculateMaxDeviation(trajectory, segment) {
    let maxDeviation = 0;
    
    for (let i = segment.startIndex; i <= segment.endIndex; i++) {
      const point = trajectory.data[i];
      
      // Check for explicit deviation values
      if (point.delta_position_n) maxDeviation = Math.max(maxDeviation, Math.abs(point.delta_position_n));
      if (point.delta_position_e) maxDeviation = Math.max(maxDeviation, Math.abs(point.delta_position_e));
      if (point.delta_position_d) maxDeviation = Math.max(maxDeviation, Math.abs(point.delta_position_d));
      
      // If position deltas not available, use velocity or estimate
      if (point.delta_velocity) {
        maxDeviation = Math.max(maxDeviation, Math.abs(point.delta_velocity) * (segment.duration / 2));
      }
    }
    
    // If no explicit deviation data, provide an estimate
    if (maxDeviation === 0) {
      // Very basic estimate - would need more sophisticated methods for real cases
      maxDeviation = segment.duration * 0.5; // Rough estimate: 0.5 meters per second
    }
    
    return maxDeviation;
  }
  
  /**
   * Get attack data for a specific trajectory and point index
   * @param {number} trajectoryIndex - Index of the trajectory
   * @param {number} pointIndex - Index of the point within the trajectory
   * @returns {Object|null} - Attack data or null if no attack
   */
  getAttackData(trajectoryIndex, pointIndex) {
    if (!trajectories || !trajectories[trajectoryIndex]) {
      return null;
    }
    
    const trajectory = trajectories[trajectoryIndex];
    
    // If no attack segments defined, check individual point
    if (!trajectory.attackSegments) {
      const point = trajectory.data[pointIndex];
      if (point && this.isPointUnderAttack(point)) {
        return {
          type: point.attack_type || 'default',
          point: pointIndex,
          affectedParameters: this.getAffectedParameters(point)
        };
      }
      return null;
    }
    
    // Check if point is in an attack segment
    for (const segment of trajectory.attackSegments) {
      if (pointIndex >= segment.startIndex && pointIndex <= segment.endIndex) {
        return {
          type: segment.type,
          startIndex: segment.startIndex,
          endIndex: segment.endIndex,
          startTime: segment.startTime,
          endTime: segment.endTime,
          duration: segment.duration,
          affectedParameters: segment.affectedParameters,
          maxDeviation: segment.maxDeviation
        };
      }
    }
    
    return null;
  }
  
  /**
   * Apply attack visualization to a trajectory line
   * @param {Object} trajectoryLine - Three.js line object
   * @param {Object} trajectory - Trajectory data
   * @param {number} trajectoryIndex - Index of the trajectory
   */
  visualizeAttacksOnTrajectory(trajectoryLine, trajectory, trajectoryIndex) {
    if (!trajectoryLine || !trajectory || !trajectory.attackSegments || trajectory.attackSegments.length === 0) {
      return;
    }
    
    // First, check if we can use the more efficient approach with multiple materials
    if (typeof THREE !== 'undefined' && typeof THREE.LineSegments !== 'undefined') {
      this.visualizeAttacksWithSegments(trajectoryLine, trajectory, trajectoryIndex);
    } else {
      // Fallback to color-only highlighting (less efficient)
      this.visualizeAttacksWithColor(trajectoryLine, trajectory, trajectoryIndex);
    }
  }
  
  /**
   * Visualize attacks by changing line color (basic approach)
   * @param {Object} trajectoryLine - Three.js line object
   * @param {Object} trajectory - Trajectory data
   * @param {number} trajectoryIndex - Index of the trajectory
   */
  visualizeAttacksWithColor(trajectoryLine, trajectory, trajectoryIndex) {
    // This is a simplified approach that only changes the color of the entire line
    // In a real implementation, you would use LineSegments or a custom shader
    
    // Get the first attack segment for simplicity
    if (trajectory.attackSegments.length > 0) {
      const segment = trajectory.attackSegments[0];
      const attackColor = this.getAttackColor(segment.type);
      
      // Apply attack color to entire line
      if (trajectoryLine.material) {
        trajectoryLine.material.color.set(attackColor);
        trajectoryLine.material.needsUpdate = true;
      }
    }
  }
  
  /**
   * Visualize attacks using line segments (advanced approach)
   * @param {Object} trajectoryLine - Three.js line object
   * @param {Object} trajectory - Trajectory data
   * @param {number} trajectoryIndex - Index of the trajectory
   */
  visualizeAttacksWithSegments(trajectoryLine, trajectory, trajectoryIndex) {
    // This would be implemented in a full version by creating separate
    // line segments for attacked and non-attacked portions
    console.log("Advanced attack visualization would be implemented here");
    
    // For now, use the simple color approach
    this.visualizeAttacksWithColor(trajectoryLine, trajectory, trajectoryIndex);
  }
  
  /**
   * Add visualization shapes for attack points
   * @param {Object} scene - Three.js scene
   * @param {Object} trajectory - Trajectory data
   * @param {number} trajectoryIndex - Index of the trajectory
   * @returns {Array} - Array of created marker objects
   */
  addAttackMarkers(scene, trajectory, trajectoryIndex) {
    if (!trajectory.attackSegments || trajectory.attackSegments.length === 0) {
      return [];
    }
    
    const markers = [];
    
    // Create a marker for each attack segment
    trajectory.attackSegments.forEach(segment => {
      // Use the middle point of the segment for the marker
      const midIndex = Math.floor((segment.startIndex + segment.endIndex) / 2);
      if (midIndex < trajectory.points.length) {
        const position = trajectory.points[midIndex];
        const attackColor = this.getAttackColor(segment.type);
        
        // Create a marker
        const marker = this.createAttackMarker(position, attackColor, this.settings.markerScale);
        
        // Store segment data with marker for use in interactions
        marker.userData = {
          isAttackMarker: true,
          trajectoryIndex: trajectoryIndex,
          attackSegment: segment,
          attackType: segment.type,
          attackTypeName: this.attackTypeNames[segment.type] || 'Unknown Attack'
        };
        
        // Add to scene if provided
        if (scene) {
          scene.add(marker);
        }
        
        markers.push(marker);
      }
    });
    
    return markers;
  }
  
  /**
   * Create a marker for attack visualization
   * @param {THREE.Vector3} position - Position of the marker
   * @param {number} color - Color of the marker
   * @param {number} scale - Scale factor for the marker
   * @returns {THREE.Object3D} - Marker object
   */
  createAttackMarker(position, color, scale = 1.0) {
    // This would create a custom marker in Three.js
    if (typeof THREE === 'undefined') {
      console.warn("THREE.js not available for creating attack markers");
      return null;
    }
    
    // Create a warning sign
    const markerGroup = new THREE.Group();
    markerGroup.position.copy(position);
    
    // Create a triangle shape
    const triangleGeometry = new THREE.ConeGeometry(10 * scale, 15 * scale, 3);
    triangleGeometry.rotateX(Math.PI); // Point upward
    
    const triangleMaterial = new THREE.MeshBasicMaterial({
      color: color,
      side: THREE.DoubleSide
    });
    
    const triangle = new THREE.Mesh(triangleGeometry, triangleMaterial);
    triangle.position.y += 15 * scale; // Position above the point
    markerGroup.add(triangle);
    
    // Add exclamation mark
    const exclamationGeometry = new THREE.CylinderGeometry(1.5 * scale, 1.5 * scale, 6 * scale, 8);
    const exclamationMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const exclamationMark = new THREE.Mesh(exclamationGeometry, exclamationMaterial);
    exclamationMark.position.set(0, 15 * scale, 0);
    markerGroup.add(exclamationMark);
    
    const dotGeometry = new THREE.SphereGeometry(1.5 * scale, 8, 8);
    const dot = new THREE.Mesh(dotGeometry, exclamationMaterial);
    dot.position.set(0, 10 * scale, 0);
    markerGroup.add(dot);
    
    // Make marker always face the camera
    markerGroup.userData.isBillboard = true;
    
    // Make marker clickable
    markerGroup.userData.isInteractive = true;
    markerGroup.userData.clickHandler = () => {
      this.showAttackInfo(markerGroup.userData);
    };
    
    // Add class for CSS selection
    markerGroup.userData.cssClass = 'attack-marker';
    
    return markerGroup;
  }
  
  /**
   * Show attack information in the UI
   * @param {Object} attackData - Data about the attack
   */
  showAttackInfo(attackData) {
    if (!this.settings.enabled || !this.settings.showAttackInfo || !this.infoPanel) {
      return;
    }
    
    // Update info panel content
    const attackType = document.getElementById('attack-type');
    const attackDuration = document.getElementById('attack-duration');
    const attackAffected = document.getElementById('attack-affected');
    const attackDeviation = document.getElementById('attack-deviation');
    
    if (attackType) {
      attackType.textContent = attackData.attackTypeName || 'Unknown';
      attackType.style.color = '#' + this.getAttackColor(attackData.attackType).toString(16).padStart(6, '0');
    }
    
    if (attackDuration && attackData.attackSegment) {
      attackDuration.textContent = attackData.attackSegment.duration.toFixed(2) + 's';
    }
    
    if (attackAffected && attackData.attackSegment) {
      attackAffected.textContent = attackData.attackSegment.affectedParameters.join(', ') || 'Unknown';
    }
    
    if (attackDeviation && attackData.attackSegment) {
      attackDeviation.textContent = '±' + attackData.attackSegment.maxDeviation.toFixed(2) + 'm';
    }
    
    // Show the panel
    this.infoPanel.style.display = 'block';
  }
  
  /**
   * Hide attack information panel
   */
  hideAttackInfo() {
    if (this.infoPanel) {
      this.infoPanel.style.display = 'none';
    }
  }
  
  /**
   * Enhance Plotly charts with attack visualization
   * @param {Array} traces - Plotly chart traces
   * @param {string} chartType - Type of chart ('altitude' or 'velocity')
   * @returns {Array} - Updated traces with attack visualization
   */
  enhanceChartWithAttackVisualization(traces, chartType) {
    if (!this.settings.enabled || traces.length === 0) {
      return traces;
    }
    
    // Create a deep copy of the traces to avoid modifying originals
    const enhancedTraces = JSON.parse(JSON.stringify(traces));
    
    // Find corresponding trajectories for each trace
    enhancedTraces.forEach((trace, traceIndex) => {
      const trajectoryName = trace.name;
      
      // Find matching trajectory - using global trajectories array (no window prefix)
      const trajectoryIndex = trajectories.findIndex(t => 
        t.name === trajectoryName && t.visible && t.hasAttackData
      );
      
      if (trajectoryIndex === -1) return;
      
      const trajectory = trajectories[trajectoryIndex];
      
      // If no attack segments or they're not loaded yet, skip
      if (!trajectory.attackSegments || trajectory.attackSegments.length === 0) {
        return;
      }
      
      // Create additional traces for attack segments
      trajectory.attackSegments.forEach(segment => {
        // Skip very short segments
        if (segment.endIndex - segment.startIndex < 2) return;
        
        // Get subset of points for this segment
        const segmentX = trace.x.slice(segment.startIndex, segment.endIndex + 1);
        const segmentY = trace.y.slice(segment.startIndex, segment.endIndex + 1);
        
        // Skip if not enough points
        if (segmentX.length < 2) return;
        
        // Create a new trace for the attack segment
        const attackSegmentTrace = {
          x: segmentX,
          y: segmentY,
          mode: 'lines',
          name: `${trajectoryName} (${this.attackTypeNames[segment.type] || 'Attack'})`,
          line: {
            color: '#' + this.getAttackColor(segment.type).toString(16).padStart(6, '0'),
            width: 3,
            dash: 'solid'
          },
          showlegend: false
        };
        
        enhancedTraces.push(attackSegmentTrace);
      });
    });
    
    return enhancedTraces;
  }
}

// NOTE: Attack visualizer is now initialized directly in script.js
// This duplicate initialization has been removed to prevent conflicts