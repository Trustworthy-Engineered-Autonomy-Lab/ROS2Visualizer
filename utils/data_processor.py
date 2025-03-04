"""
Data processing module for Flight Trajectory visualization application.
Implements processing and conversion functions for flight data.
"""

import io
import csv
import json
import math
import logging
from datetime import datetime
import pandas as pd
import numpy as np

def process_csv_data(csv_content):
    """
    Process CSV content into a format suitable for visualization.
    
    Args:
        csv_content (str): CSV file content as a string
    
    Returns:
        dict: Processed data ready for visualization
    """
    try:
        # Parse CSV to pandas DataFrame
        df = pd.read_csv(io.StringIO(csv_content))
        
        # Check if required position columns exist
        required_columns = ['position_n', 'position_e', 'position_d']
        if not all(col in df.columns for col in required_columns):
            # Try to detect alternative position column names
            alt_columns = detect_position_columns(df)
            if alt_columns:
                # Rename columns to expected format
                df = df.rename(columns=alt_columns)
            else:
                return {
                    'error': 'Missing required position columns',
                    'message': 'Could not find position_n, position_e, position_d columns or alternatives'
                }
        
        # Check if data has timestamps
        has_timestamps = 'sec' in df.columns and 'nanosec' in df.columns
        
        # Process the data depending on available columns
        trajectory = []
        metadata = {
            'total_points': len(df),
            'processed_points': 0,
            'altitude_range': [0, 0],
            'distance': 0,
            'duration': 0,
            'sampling_rate': 0,
            'min_time': 0,
            'max_time': 0
        }
        
        # Calculate time if available
        if has_timestamps:
            df['time'] = df['sec'] + df['nanosec'] / 1e9
            min_time = df['time'].min()
            metadata['min_time'] = min_time
            metadata['max_time'] = df['time'].max()
            metadata['duration'] = metadata['max_time'] - min_time
            if len(df) > 1:
                metadata['sampling_rate'] = len(df) / metadata['duration']
            
            # Normalize time to start at 0
            df['normalized_time'] = df['time'] - min_time
        else:
            # If no timestamps, use index as time
            df['normalized_time'] = df.index / 10.0  # Assume 10Hz
        
        # Calculate altitude range (negative of position_d)
        if 'position_d' in df.columns:
            # In NED frame, altitude is negative of 'down'
            min_alt = -df['position_d'].max()
            max_alt = -df['position_d'].min()
            metadata['altitude_range'] = [min_alt, max_alt]
        
        # Apply altitude scaling factor (1.8x) for better visualization
        altitude_scale = 1.8
        
        # Extract trajectory data
        # For efficiency, we'll sample data points for large datasets
        sampling_factor = max(1, len(df) // 1000)  # Sample at most 1000 points
        metadata['sampling_factor'] = sampling_factor
        
        trajectory_points = []
        previous_position = None
        
        for i in range(0, len(df), sampling_factor):
            row = df.iloc[i]
            
            # Position data (using NED to XYZ conversion for THREE.js)
            # In NED frame: North=X, East=Y, Down=-Z
            position = {
                'x': float(row['position_n']),
                'y': float(row['position_e']),
                'z': -float(row['position_d']) * altitude_scale  # Negate Down to get Up, apply scaling
            }
            
            # Calculate distance from previous point
            if previous_position:
                dx = position['x'] - previous_position['x']
                dy = position['y'] - previous_position['y']
                dz = position['z'] - previous_position['z'] / altitude_scale  # Remove scale for true distance
                segment_distance = math.sqrt(dx*dx + dy*dy + dz*dz)
                metadata['distance'] += segment_distance
            
            previous_position = position
            
            # Orientation data (if available)
            orientation = {}
            for angle in ['phi', 'theta', 'psi']:
                if angle in df.columns:
                    orientation[angle] = float(row[angle])
            
            # Velocity data (if available)
            velocity = {}
            for vel in ['u', 'v', 'w']:
                if vel in df.columns:
                    velocity[vel] = float(row[vel])
            
            # Combine all data for this point
            point_data = {
                'position': position,
                'time': float(row['normalized_time']),
                'orientation': orientation,
                'velocity': velocity
            }
            
            # Add additional data columns if available
            for col in df.columns:
                if col not in ['position_n', 'position_e', 'position_d', 
                              'sec', 'nanosec', 'time', 'normalized_time', 
                              'phi', 'theta', 'psi', 'u', 'v', 'w']:
                    try:
                        value = float(row[col])
                        point_data[col] = value
                    except (ValueError, TypeError):
                        # Skip non-numeric values
                        pass
            
            trajectory_points.append(point_data)
        
        metadata['processed_points'] = len(trajectory_points)
        
        # Create result dictionary in the format expected by the frontend
        # Frontend expects 'data' field with direct trajectory points
        # and specific metadata format
        result = {
            'data': trajectory_points,
            'metadata': {
                'points_count': len(trajectory_points),
                'original_count': metadata['total_points'],
                'altitude_range': metadata['altitude_range'],
                'distance': metadata['distance'],
                'duration': metadata['duration'],
                'sampling_factor': metadata['sampling_factor']
            }
        }
        
        return result
        
    except Exception as e:
        logging.error(f"Error processing CSV data: {str(e)}")
        return {
            'error': 'Processing error',
            'message': str(e)
        }

def detect_position_columns(df):
    """
    Attempt to detect position columns with alternative names.
    
    Args:
        df (pandas.DataFrame): The data frame to search
    
    Returns:
        dict: Mapping of detected columns to standard names, or None if not found
    """
    # Potential column name patterns
    position_patterns = {
        'position_n': ['n', 'north', 'x', 'pos_n', 'position_north', 'pos_north', 'position_x', 'pos_x'],
        'position_e': ['e', 'east', 'y', 'pos_e', 'position_east', 'pos_east', 'position_y', 'pos_y'],
        'position_d': ['d', 'down', 'z', 'alt', 'altitude', 'pos_d', 'position_down', 'pos_down', 'position_z', 'pos_z']
    }
    
    result = {}
    
    # Check for each standard position column
    for std_col, patterns in position_patterns.items():
        # First check if the standard column already exists
        if std_col in df.columns:
            continue
            
        # Try to find alternative column
        found = False
        for pattern in patterns:
            # Look for exact matches
            matches = [col for col in df.columns if col.lower() == pattern.lower()]
            if matches:
                result[matches[0]] = std_col
                found = True
                break
                
            # Look for partial matches
            if not found:
                partial_matches = [col for col in df.columns if pattern.lower() in col.lower()]
                if partial_matches:
                    result[partial_matches[0]] = std_col
                    found = True
                    break
    
    # Only return a result if we found all three position components
    if len(result) == 3:
        return result
    return None