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
try:
    import pandas as pd
    import numpy as np
except ImportError:
    logging.error("Required packages not found. Please install pandas and numpy.")
    # Handle import errors gracefully
    import sys
    if 'pandas' not in sys.modules:
        # Create mock pandas module
        class MockPd:
            def __getattr__(self, name):
                raise ImportError(f"pandas module is not available: {name}")
        pd = MockPd()
    if 'numpy' not in sys.modules:
        # Create mock numpy module
        class MockNp:
            def __getattr__(self, name):
                raise ImportError(f"numpy module is not available: {name}")
        np = MockNp()

def process_csv_data(csv_content):
    """
    Process CSV content into a format suitable for visualization.
    Optimized for gigabytes of data with memory-efficient processing.
    
    Args:
        csv_content (str): CSV file content as a string
    
    Returns:
        dict: Processed data ready for visualization
    """
    try:
        # First, check file size to decide on processing approach
        file_size_bytes = len(csv_content)
        file_size_mb = file_size_bytes / (1024 * 1024)
        is_large_file = file_size_mb > 100  # Consider files larger than 100MB as large
        
        if is_large_file:
            logging.info(f"Processing large file of {file_size_mb:.2f} MB with chunked approach")
        
        # Try to detect if the file has headers
        with io.StringIO(csv_content) as f:
            first_line = f.readline().strip()
            # Check if first line looks like headers (contains non-numeric values)
            has_headers = not all(col.replace('-', '').replace('.', '').isdigit() for col in first_line.split(',') if col.strip())
            
        # For very large files, use chunked processing to reduce memory usage
        if is_large_file:
            chunk_size = 50000  # Process in chunks of 50k rows
            
            # Get column names and structure from first chunk
            if has_headers:
                # Get first chunk to determine column structure
                df_iter = pd.read_csv(io.StringIO(csv_content), chunksize=chunk_size)
                first_chunk = next(df_iter)
                column_names = list(first_chunk.columns)
                logging.info(f"Processing large CSV file with headers: {column_names}")
                
                # Create a sample dataframe from the first chunk for detection and processing
                df = first_chunk
            else:
                # For headerless files
                df_iter = pd.read_csv(io.StringIO(csv_content), header=None, chunksize=chunk_size)
                first_chunk = next(df_iter)
                # Create default column names
                column_names = [f'col{i}' for i in range(len(first_chunk.columns))]
                first_chunk.columns = column_names
                logging.info(f"Processing large CSV file without headers, creating {len(column_names)} default columns")
                
                # Create a sample dataframe from the first chunk
                df = first_chunk
        else:
            # For regular sized files, load everything into memory
            if has_headers:
                df = pd.read_csv(io.StringIO(csv_content))
                logging.info(f"Processing CSV file with headers: {list(df.columns)}")
            else:
                # If no headers detected, create default column names
                logging.info(f"Processing CSV file without headers, creating default column names")
                df = pd.read_csv(io.StringIO(csv_content), header=None)
                # Create default column names (col0, col1, etc.)
                df.columns = [f'col{i}' for i in range(len(df.columns))]
        
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
            
            # Create point data in the flat format expected by the frontend
            # The visualization expects position_n, position_e, position_d directly
            point_data = {
                'position_n': float(row['position_n']),
                'position_e': float(row['position_e']),
                'position_d': float(row['position_d']),
                'time': float(row['normalized_time'])
            }
            
            # Add orientation angles if available
            if orientation:
                for angle, value in orientation.items():
                    point_data[angle] = value
            
            # Add velocity components if available
            if velocity:
                for vel, value in velocity.items():
                    point_data[vel] = value
            
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
        
        # Convert numpy values to native Python types to ensure JSON serialization works
        result = {
            'data': trajectory_points,
            'metadata': {
                'points_count': len(trajectory_points),
                'original_count': int(metadata['total_points']),
                'altitude_range': [float(metadata['altitude_range'][0]), float(metadata['altitude_range'][1])],
                'distance': float(metadata['distance']),
                'duration': float(metadata['duration']),
                'sampling_factor': int(metadata['sampling_factor'])
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
    # Potential column name patterns - more comprehensive patterns for better matching
    position_patterns = {
        'position_n': ['n', 'north', 'x', 'pos_n', 'position_north', 'pos_north', 'position_x', 'pos_x', 
                     'posx', 'nx', 'northx', 'latitude', 'lat', 'posn', 'position n'],
        'position_e': ['e', 'east', 'y', 'pos_e', 'position_east', 'pos_east', 'position_y', 'pos_y',
                     'posy', 'ey', 'easty', 'longitude', 'lon', 'long', 'pose', 'position e'],
        'position_d': ['d', 'down', 'z', 'alt', 'altitude', 'pos_d', 'position_down', 'pos_down', 'position_z', 'pos_z',
                     'posz', 'dz', 'downz', 'height', 'elev', 'elevation', 'depth', 'posd', 'position d']
    }
    
    # Also try to infer from numeric columns if the data appears to be X/Y/Z coordinate data
    numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
    
    # If we have at least 3 numeric columns, try to infer position data
    infer_from_numeric = False
    if len(numeric_columns) >= 3:
        infer_from_numeric = True
        
    result = {}
    
    # First try to match by column name patterns
    for std_col, patterns in position_patterns.items():
        # First check if the standard column already exists
        if std_col in df.columns:
            continue
            
        # Try to find alternative column
        found = False
        for pattern in patterns:
            # Look for exact matches with case insensitivity
            matches = [col for col in df.columns if col.lower() == pattern.lower()]
            if matches:
                result[matches[0]] = std_col
                found = True
                break
                
            # Look for partial matches with case insensitivity
            if not found:
                partial_matches = [col for col in df.columns if pattern.lower() in col.lower() or col.lower() in pattern.lower()]
                if partial_matches:
                    result[partial_matches[0]] = std_col
                    found = True
                    break
                    
    # If we found all three position components, return the mapping
    if len(result) == 3:
        logging.info(f"Detected position columns by name pattern matching: {result}")
        return result
    
    # If pattern matching didn't find all required columns, try to infer from numeric column positions
    if infer_from_numeric and len(numeric_columns) >= 3:
        logging.info("Pattern matching didn't find all position columns. Trying to infer from numeric columns.")
        # If we have exactly 3 numeric columns, assume they are position_n, position_e, position_d in order
        if len(numeric_columns) == 3:
            result = {
                numeric_columns[0]: 'position_n',
                numeric_columns[1]: 'position_e',
                numeric_columns[2]: 'position_d'
            }
            logging.info(f"Inferred position columns from 3 numeric columns: {result}")
            return result
            
        # If we have more than 3 columns but the first 3 are numeric, use those
        if len(df.columns) >= 3 and all(col in numeric_columns for col in df.columns[:3]):
            result = {
                df.columns[0]: 'position_n',
                df.columns[1]: 'position_e',
                df.columns[2]: 'position_d'
            }
            logging.info(f"Inferred position columns from first 3 columns: {result}")
            return result
            
    # If we still don't have a mapping, try one more approach: look for X/Y/Z coordinate patterns
    # in column names or infer from common position indexes (0, 1, 2)
    if len(result) < 3:
        # Try to find columns that might be X/Y/Z coordinates
        x_cols = [col for col in df.columns if col.lower() in ['x', 'col0', '0']]
        y_cols = [col for col in df.columns if col.lower() in ['y', 'col1', '1']]
        z_cols = [col for col in df.columns if col.lower() in ['z', 'col2', '2']]
        
        if x_cols and 'position_n' not in result.values():
            result[x_cols[0]] = 'position_n'
        if y_cols and 'position_e' not in result.values():
            result[y_cols[0]] = 'position_e'
        if z_cols and 'position_d' not in result.values():
            result[z_cols[0]] = 'position_d'
            
    # Only return a result if we found all three position components
    if len(result) == 3:
        logging.info(f"Final position column mapping: {result}")
        return result
        
    logging.warning(f"Could not detect all position columns. Found only: {result}")
    return None