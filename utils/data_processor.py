import csv
import io
import json
import logging
from datetime import datetime

def process_csv_data(csv_content):
    """
    Process CSV content into a format suitable for visualization.
    
    Args:
        csv_content (str): CSV file content as a string
    
    Returns:
        dict: Processed data ready for visualization
    """
    # Parse CSV data
    csv_reader = csv.reader(io.StringIO(csv_content))
    headers = next(csv_reader)  # Get the headers
    
    # Convert headers to lowercase for consistent access
    headers = [h.lower() for h in headers]
    
    # Create a mapping for expected column names
    column_map = {
        'position_n': ['position_n', 'north', 'n'],
        'position_e': ['position_e', 'east', 'e'],
        'position_d': ['position_d', 'down', 'd', 'altitude', 'alt'],
        'phi': ['phi', 'roll'],
        'theta': ['theta', 'pitch'],
        'psi': ['psi', 'yaw', 'heading'],
        'sec': ['sec', 'seconds', 'time'],
        'nanosec': ['nanosec', 'nanoseconds'],
        'velocity': ['velocity', 'va', 'vel', 'speed']
    }
    
    # Identify column indices
    column_indices = {}
    for key, possible_names in column_map.items():
        for i, header in enumerate(headers):
            if header in possible_names:
                column_indices[key] = i
                break
    
    # Check if we have the minimum required columns
    required_columns = ['position_n', 'position_e', 'position_d']
    missing_columns = [col for col in required_columns if col not in column_indices]
    
    if missing_columns:
        raise ValueError(f"Missing required columns: {', '.join(missing_columns)}")
    
    # Parse the data rows
    data_points = []
    row_count = 0
    start_time = None  # Initialize start_time variable
    
    # Get all rows first to determine total count
    rows = list(csv_reader)
    total_rows = len(rows)
    logging.info(f"Total rows in CSV: {total_rows}")
    
    # Calculate downsampling factor - taking every 50th point as requested
    downsample_factor = 50
    
    # Process the downsampled rows
    for i, row in enumerate(rows):
        # Only process every N-th row to reduce data size
        if i % downsample_factor != 0:
            continue
            
        point = {}
        
        # Extract values for each identified column
        for key, index in column_indices.items():
            try:
                if index < len(row):
                    point[key] = float(row[index])
            except (ValueError, IndexError):
                # Skip malformed data for this column
                continue
        
        # Skip row if we couldn't parse essential values
        if not all(k in point for k in required_columns):
            continue
            
        # Add additional calculated values if needed
        if 'sec' in point and 'nanosec' in point:
            # Store raw unix time
            point['unix_time'] = point['sec'] + point['nanosec'] / 1e9
            
            try:
                # Try to convert Unix time to human-readable format for display
                dt = datetime.fromtimestamp(point['sec'])
                point['formatted_time'] = dt.strftime('%H:%M:%S')
                
                # Use time since start for plotting and animation
                if start_time is None:
                    # Store first timestamp to calculate relative time
                    start_time = point['unix_time']
                    point['time'] = 0
                else:
                    point['time'] = point['unix_time'] - start_time
            except Exception as e:
                logging.warning(f"Error processing timestamp: {e}")
                point['time'] = row_count * 0.1  # Fallback: assume 10Hz sampling
        else:
            # If no time data available, use row index
            point['time'] = row_count * 0.1  # Assume 10Hz sampling
        
        # Add velocity if available directly or calculate if needed
        if 'velocity' not in point and row_count > 0 and point['time'] > 0:
            # Try to calculate velocity from position change
            prev_point = data_points[-1]
            dt = point['time'] - prev_point['time']
            if dt > 0:
                dx = point['position_e'] - prev_point['position_e']
                dy = point['position_d'] - prev_point['position_d']
                dz = point['position_n'] - prev_point['position_n']
                point['velocity'] = (dx**2 + dy**2 + dz**2)**0.5 / dt
        
        data_points.append(point)
        row_count += 1
    
    logging.info(f"Processed {row_count} points after downsampling")
    
    return {
        'data': data_points,
        'metadata': {
            'columns': list(column_indices.keys()),
            'points_count': len(data_points),
            'original_count': total_rows,
            'downsample_factor': downsample_factor
        }
    }
