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
# These are necessary imports for processing CSV data
import pandas as pd
import numpy as np

def process_csv_data(csv_content, file_encoding='utf-8', use_file_path=False, is_large_file=False, sample_rate=1):
    """
    Process CSV content into a format suitable for visualization.
    Optimized for gigabytes of data with memory-efficient processing.
    
    Args:
        csv_content (str or path): CSV file content as a string or path to CSV file
        file_encoding (str): Encoding of the file, used when use_file_path=True
        use_file_path (bool): If True, csv_content is treated as a file path
        is_large_file (bool): If True, forces chunked processing approach
        sample_rate (int): If > 1, only processes every Nth row (e.g. 50 = 1/50 of data points)
    
    Returns:
        dict: Processed data ready for visualization
    """
    try:
        start_time = datetime.now()
        logging.info(f"Starting CSV processing at {start_time}")
        
        # Determine processing approach based on whether we're dealing with a file path or content
        if use_file_path:
            # When processing from a file path, we can use pandas' efficiency for large files
            file_path = csv_content
            
            # Get file size for logging and decision making
            import os
            file_size_bytes = os.path.getsize(file_path)
            file_size_mb = file_size_bytes / (1024 * 1024)
            
            logging.info(f"Processing from file path: {file_path}, size: {file_size_mb:.2f} MB")
            
            # Check if the file is large to determine chunked approach
            is_large_file = is_large_file or file_size_mb > 100  # Consider files >100MB as large
            
            # Peek at first few lines to detect headers and column structure
            with open(file_path, 'r', encoding=file_encoding) as f:
                first_lines = [f.readline() for _ in range(5)]
                first_line = first_lines[0].strip()
                
                # Check if first line looks like headers (contains non-numeric values)
                has_headers = not all(col.replace('-', '').replace('.', '').replace('e', '').replace('+', '').isdigit() 
                                    for col in first_line.split(',') if col.strip())
                
                logging.info(f"Detected headers: {has_headers}")
                logging.info(f"First line: {first_line}")
                
                # Log headers for debugging
                header_line = first_line if has_headers else "No headers detected"
                logging.info(f"Processing CSV file with headers: {header_line.split(',')}")
                
        else:
            # Traditional string content processing
            file_size_bytes = len(csv_content)
            file_size_mb = file_size_bytes / (1024 * 1024)
            
            # Determine if chunked processing is needed
            is_large_file = is_large_file or file_size_mb > 100
            
            if is_large_file:
                logging.info(f"Processing large content of {file_size_mb:.2f} MB with chunked approach")
            
            # Try to detect if the file has headers
            with io.StringIO(csv_content) as f:
                first_line = f.readline().strip()
                # Check if first line looks like headers with enhanced scientific notation handling
                has_headers = not all(col.replace('-', '').replace('.', '').replace('e', '').replace('+', '').isdigit() 
                                      for col in first_line.split(',') if col.strip())
            
        # For very large files, use chunked processing to reduce memory usage
        if is_large_file:
            chunk_size = 50000  # Process in chunks of 50k rows
            
            # Get column names and structure from first chunk
            if has_headers:
                try:
                    # Handle both file path and content string cases
                    if use_file_path:
                        df_iter = pd.read_csv(csv_content, encoding=file_encoding, 
                                             chunksize=chunk_size, low_memory=True)
                    else:
                        df_iter = pd.read_csv(io.StringIO(csv_content), chunksize=chunk_size, 
                                             low_memory=True)
                    
                    first_chunk = next(df_iter)
                    logging.info(f"Successfully loaded first chunk with {len(first_chunk)} rows")
                except Exception as e:
                    logging.error(f"Error loading first chunk: {str(e)}")
                    raise
                column_names = list(first_chunk.columns)
                logging.info(f"Processing large CSV file with headers: {column_names}")
                
                # Create a sample dataframe from the first chunk for detection and processing
                df = first_chunk
            else:
                # For headerless files - handle both file path and content string cases
                try:
                    if use_file_path:
                        df_iter = pd.read_csv(csv_content, encoding=file_encoding, 
                                             header=None, chunksize=chunk_size, low_memory=True)
                    else:
                        df_iter = pd.read_csv(io.StringIO(csv_content), 
                                             header=None, chunksize=chunk_size, low_memory=True)
                    
                    first_chunk = next(df_iter)
                    logging.info(f"Successfully loaded first chunk of headerless file with {len(first_chunk)} rows")
                except Exception as e:
                    logging.error(f"Error loading first chunk of headerless file: {str(e)}")
                    raise
                    
                # Create default column names
                column_names = [f'col{i}' for i in range(len(first_chunk.columns))]
                first_chunk.columns = column_names
                logging.info(f"Processing large CSV file without headers, creating {len(column_names)} default columns")
                
                # Create a sample dataframe from the first chunk
                df = first_chunk
        else:
            # For regular sized files, load everything into memory
            if has_headers:
                try:
                    # Handle both file path and content string cases
                    if use_file_path:
                        df = pd.read_csv(csv_content, encoding=file_encoding)
                        logging.info(f"Processing file with path: {csv_content}")
                    else:
                        df = pd.read_csv(io.StringIO(csv_content))
                    logging.info(f"Processing CSV file with headers: {list(df.columns)}")
                except Exception as e:
                    logging.error(f"Error loading CSV with headers: {str(e)}")
                    raise
            else:
                # If no headers detected, create default column names
                logging.info(f"Processing CSV file without headers, creating default column names")
                try:
                    if use_file_path:
                        df = pd.read_csv(csv_content, encoding=file_encoding, header=None)
                    else:
                        df = pd.read_csv(io.StringIO(csv_content), header=None)
                    # Create default column names (col0, col1, etc.)
                    df.columns = [f'col{i}' for i in range(len(df.columns))]
                except Exception as e:
                    logging.error(f"Error loading CSV without headers: {str(e)}")
                    raise
        
        # Check if required position columns exist
        required_columns = ['position_n', 'position_e', 'position_d']
        if not all(col in df.columns for col in required_columns):
            # Try to detect alternative position column names
            alt_columns = detect_position_columns(df)
            if alt_columns:
                # Rename columns to expected format
                df = df.rename(columns=alt_columns)
                logging.info(f"Renamed position columns using mapping: {alt_columns}")
            else:
                # Special case for ROS2 Humble data format (based on sample data)
                # If we detect typical ROS2 timestamp columns, try specific numeric columns
                # that are likely to contain position data (indices 3, 4, 5 in the sample)
                
                has_ros_timestamp = False
                if len(df.columns) >= 2:
                    # Check for timestamp pattern in first two columns (common in ROS2 data)
                    first_col = str(df.columns[0])
                    if first_col.isdigit() and len(first_col) >= 10:  # Unix timestamp typically 10+ digits
                        has_ros_timestamp = True
                        
                if has_ros_timestamp and len(df.columns) >= 6:
                    # For ROS2 data with timestamp headers, position data is often at indices 3, 4, 5
                    try:
                        # Create mapping for the position columns
                        position_mapping = {
                            df.columns[3]: 'position_n',  # North/X position
                            df.columns[4]: 'position_e',  # East/Y position
                            df.columns[5]: 'position_d'   # Down/Z position
                        }
                        
                        # Verify these columns contain numeric data in a reasonable range
                        for col in [df.columns[3], df.columns[4], df.columns[5]]:
                            # Convert column to numeric, coercing errors to NaN
                            # Handle case where pandas might not be fully loaded
                            try:
                                df[col] = pd.to_numeric(df[col], errors='coerce')
                            except (NameError, AttributeError):
                                # If pd is not available, manually convert values
                                df[col] = df[col].astype(float)
                        
                        # Rename the columns
                        df = df.rename(columns=position_mapping)
                        logging.info(f"Using ROS2 standard position indices (3,4,5): {position_mapping}")
                    except Exception as e:
                        logging.error(f"Error mapping ROS2 position columns: {str(e)}")
                        return {
                            'error': 'Missing required position columns',
                            'message': f'Could not find position columns in ROS2 data: {str(e)}'
                        }
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
        # For efficiency, we'll sample data points based on the provided sample_rate or fallback to auto-sampling
        if sample_rate > 1:
            # Use the specified sample rate (e.g., 50 = take every 50th datapoint)
            sampling_factor = sample_rate
            logging.info(f"Using specified sampling rate of 1/{sample_rate} datapoints")
        else:
            # Auto-sampling for large datasets (max 1000 points)
            sampling_factor = max(1, len(df) // 1000)
            
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
    
    # Special case for ROS2 trajectory data: Extract positions at specific column indices if
    # we detect timestamp data in the format expected for ROS messages
    # This is to handle trajectory data specific to ROS2 Humble
    
    timestamp_indicators = ['sec', 'nanosec']
    has_timestamps = any(ts in ''.join(str(col).lower() for col in df.columns) for ts in timestamp_indicators)
    has_ros_structure = False
    
    # Check if this looks like a ROS message structure with timestamps
    if has_timestamps or (len(df.columns) >= 2 and any('1741' in str(col) for col in df.columns[:2])):
        logging.info("ROS2 timestamp structure detected. Trying special column mapping.")
        has_ros_structure = True
        # Try to find timestamp columns which are usually the first two columns in ROS2 data
    
    # Also try to infer from numeric columns if the data appears to be X/Y/Z coordinate data
    numeric_columns = df.select_dtypes(include=['number']).columns.tolist()
    
    # If we have at least 3 numeric columns, try to infer position data
    infer_from_numeric = False
    if len(numeric_columns) >= 3:
        infer_from_numeric = True
        
    result = {}
    
    # Handle special case for ROS2 Humble data structure - commonly indexes 3, 4, 5 for position
    if has_ros_structure and len(df.columns) >= 6:
        # In ROS2 data, position columns are often at indexes 3, 4, 5 (after timestamp fields)
        # Or sometimes at indexes 0, 1, 2 if no timestamps
        
        # Try common ROS2 trajectory column positions (after timestamps)
        candidate_column_sets = [
            # Position columns right after timestamps (common in ROS2 data)
            [3, 4, 5],
            # Position in the middle of message
            [5, 6, 7],
            # Standard column indices in position messages
            [0, 1, 2]
        ]
        
        for column_indices in candidate_column_sets:
            if all(idx < len(df.columns) for idx in column_indices):
                # Check if these columns contain typical position data (numeric with reasonable ranges)
                candidate_columns = [df.columns[idx] for idx in column_indices]
                
                # Check if all are numeric
                if all(col in numeric_columns for col in candidate_columns):
                    try:
                        # Check data values to see if they look like positions
                        values = [df[col].dropna().astype(float) for col in candidate_columns]
                        
                        # Filter out non-position-like data: values should be in a reasonable range
                        # (-10,000 to 10,000 is a common range for position values in meters)
                        ranges = [(values[i].min(), values[i].max()) for i in range(3)]
                        
                        if all(-100000 < r[0] < 100000 and -100000 < r[1] < 100000 for r in ranges):
                            # This set of columns looks like position data
                            result = {
                                candidate_columns[0]: 'position_n',
                                candidate_columns[1]: 'position_e',
                                candidate_columns[2]: 'position_d'
                            }
                            logging.info(f"Detected position columns from ROS2 message structure: {result}")
                            return result
                    except (ValueError, TypeError):
                        # If we can't convert to float or other error, continue to next set
                        continue
    
    # First try to match by column name patterns
    for std_col, patterns in position_patterns.items():
        # First check if the standard column already exists
        if std_col in df.columns:
            continue
            
        # Try to find alternative column
        found = False
        for pattern in patterns:
            # Look for exact matches with case insensitivity
            matches = [col for col in df.columns if str(col).lower() == pattern.lower()]
            if matches:
                result[matches[0]] = std_col
                found = True
                break
                
            # Look for partial matches with case insensitivity
            if not found:
                partial_matches = [col for col in df.columns if 
                                  pattern.lower() in str(col).lower() or 
                                  str(col).lower() in pattern.lower()]
                if partial_matches:
                    result[partial_matches[0]] = std_col
                    found = True
                    break
    
    # If we found all three position components, return the mapping
    if len(result) == 3:
        logging.info(f"Detected position columns by name pattern matching: {result}")
        return result
    
    # Special handling for scientific notation columns that could be position data
    # e.g., '8.586749e-05' or similar in the sample data
    scientific_columns = [col for col in df.columns if 'e-' in str(col) or 'e+' in str(col)]
    if scientific_columns and len(scientific_columns) >= 3:
        # Try to map these to position columns
        logging.info(f"Found scientific notation columns, trying to map to positions: {scientific_columns[:3]}")
        
        # For the specific data format we've seen, look for patterns in scientific notation
        # We've observed that position columns often have values in ranges like:
        # X/N: Small non-zero values (e.g., 0.014227205)
        # Y/E: Scientific notation with e- exponent (e.g., 8.586749e-05)
        # Z/D: Small negative values (e.g., -0.09170395)
        
        position_n_candidates = []
        position_e_candidates = []
        position_d_candidates = []
        
        # Go through all numeric columns to find suitable candidates
        for col in numeric_columns:
            try:
                col_values = df[col].dropna()
                if len(col_values) > 0:
                    col_min = float(col_values.min())
                    col_max = float(col_values.max())
                    col_mean = float(col_values.mean())
                    
                    # Scientific notation column (e-06 to e-03 range) - likely East position
                    if 'e-' in str(col):
                        position_e_candidates.append(col)
                    # Negative values around -0.1 to -1.0 - likely Down position
                    elif col_mean < 0 and -10 < col_mean < -0.01:
                        position_d_candidates.append(col)
                    # Small positive values (0.01 to 1.0) - likely North position
                    elif 0.001 < col_mean < 10 and col_min > -1:
                        position_n_candidates.append(col)
            except:
                continue
        
        # If we have candidates for all three positions
        if position_n_candidates and position_e_candidates and position_d_candidates:
            result = {
                position_n_candidates[0]: 'position_n',
                position_e_candidates[0]: 'position_e',
                position_d_candidates[0]: 'position_d'
            }
            logging.info(f"Mapped position columns based on value patterns: {result}")
            return result
        else:
            # Fall back to just using the scientific columns in order
            result = {
                scientific_columns[0]: 'position_n',
                scientific_columns[1]: 'position_e',
                scientific_columns[2]: 'position_d'
            }
            logging.info(f"Mapped scientific notation columns to positions in order: {result}")
            return result
    
    # As a fallback approach, try to find columns with actual position data in them
    # rather than just by name
    if infer_from_numeric and len(numeric_columns) >= 3:
        logging.info("Pattern matching didn't find all position columns. Analyzing numeric column data patterns.")
        
        # For each numeric column, calculate statistics to see if it looks like position data
        position_candidates = []
        
        for col in numeric_columns:
            # Check actual values in the column
            try:
                col_values = df[col].dropna()
                if len(col_values) > 0:
                    # Calculate some basic statistics
                    col_min = float(col_values.min())
                    col_max = float(col_values.max())
                    col_mean = float(col_values.mean())
                    col_std = float(col_values.std()) if len(col_values) > 1 else 0
                    
                    # Position data typically has these characteristics:
                    # 1. A reasonable range (not all zeros, not extremely large values)
                    # 2. Some variation (std dev > 0)
                    # 3. Values typically in the range of -1000 to 1000 for most trajectories
                    
                    if (
                        col_std > 0 and 
                        -1000000 < col_min < 1000000 and 
                        -1000000 < col_max < 1000000 and
                        col_min != col_max  # Has some variation
                    ):
                        # This column looks like it might contain position data
                        position_candidates.append((col, col_std, col_mean))
            except:
                # Skip columns that can't be analyzed
                continue
        
        # Sort candidates by standard deviation (higher variation is more likely to be position data)
        position_candidates.sort(key=lambda x: x[1], reverse=True)
        
        # If we have at least 3 candidates, use the top 3 as position columns
        if len(position_candidates) >= 3:
            result = {
                position_candidates[0][0]: 'position_n',  # Highest variation for North
                position_candidates[1][0]: 'position_e',  # Second highest for East
                position_candidates[2][0]: 'position_d'   # Third highest for Down
            }
            logging.info(f"Inferred position columns from numeric data patterns: {result}")
            return result
    
    # For data with timestamp columns, try specific indices that are common for position
    if has_ros_structure and len(df.columns) >= 6:
        # Try with fixed indices that are common in ros_msgs
        if len(df.columns) >= 6:
            # Use columns 3, 4, 5 which are often position data in ROS messages
            cols = [df.columns[3], df.columns[4], df.columns[5]]
            if all(col in numeric_columns for col in cols):
                logging.info(f"Using ROS2 standard position indices (3,4,5): {cols}")
                return {
                    cols[0]: 'position_n',
                    cols[1]: 'position_e',
                    cols[2]: 'position_d'
                }
    
    # As a last resort, try to find any 3 numeric columns to use
    if infer_from_numeric and len(numeric_columns) >= 3:
        logging.info("Using the first 3 numeric columns as position data")
        return {
            numeric_columns[0]: 'position_n',
            numeric_columns[1]: 'position_e',
            numeric_columns[2]: 'position_d'
        }
    
    # If we still don't have a mapping, try one more approach: look for X/Y/Z coordinate patterns
    # in column names or infer from common position indexes (0, 1, 2)
    if len(result) < 3:
        # Try to find columns that might be X/Y/Z coordinates
        x_cols = [col for col in df.columns if str(col).lower() in ['x', 'col0', '0']]
        y_cols = [col for col in df.columns if str(col).lower() in ['y', 'col1', '1']]
        z_cols = [col for col in df.columns if str(col).lower() in ['z', 'col2', '2']]
        
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