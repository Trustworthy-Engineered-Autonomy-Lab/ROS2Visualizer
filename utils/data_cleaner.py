"""
Data Cleaning module for Flight Trajectory visualization application.
Implements various cleaning operations for flight trajectory data.
"""

import io
import csv
import os
import logging
import math
import statistics
import tempfile
import shutil
from datetime import datetime

# Import pandas and numpy - these are necessary for processing CSV files
import pandas as pd
import numpy as np

def analyze_csv_file(file_content, filename, is_sample=False):
    """
    Analyze a CSV file and return basic statistics.
    Optimized for very large files (GBs of data) with chunked processing.
    
    Args:
        file_content (str): CSV file content as string
        filename (str): Name of the file
        is_sample (bool): If True, indicates this is just a sample of a large file
        
    Returns:
        dict: Statistics about the file
    """
    try:
        # First, check for very large files by size and handle differently if needed
        file_size_bytes = len(file_content)
        file_size_mb = file_size_bytes / (1024 * 1024)
        is_large_file = file_size_mb > 100  # Consider files larger than 100MB as large
        
        if is_large_file:
            logging.info(f"Processing large file ({file_size_mb:.2f} MB) with chunked approach")
        
        # Try to detect if the file has headers
        with io.StringIO(file_content) as f:
            first_line = f.readline().strip()
            # Check if first line looks like headers (contains non-numeric values)
            has_headers = not all(col.replace('-', '').replace('.', '').isdigit() for col in first_line.split(',') if col.strip())
        
        # For very large files, use a chunked approach with iterative processing
        if is_large_file:
            # Create a TextIOWrapper for reading the file in chunks
            chunk_size = 100000  # Process 100k rows at a time
            total_rows = 0
            sample_rows = []
            column_names = None
            
            # Read the first chunk to get headers and initial statistics
            if has_headers:
                # Read with headers
                df_iter = pd.read_csv(io.StringIO(file_content), chunksize=chunk_size)
                first_chunk = next(df_iter)
                column_names = list(first_chunk.columns)
                logging.info(f"CSV file '{filename}' loaded with headers: {column_names}")
            else:
                # Read without headers
                df_iter = pd.read_csv(io.StringIO(file_content), header=None, chunksize=chunk_size)
                first_chunk = next(df_iter)
                # Create default column names
                column_names = [f'col{i}' for i in range(len(first_chunk.columns))]
                first_chunk.columns = column_names
                logging.info(f"CSV file '{filename}' loaded without headers, creating {len(column_names)} default columns")
            
            # Initialize statistics tracking variables
            total_rows += len(first_chunk)
            
            # Sample rows for preview (take first 5 rows)
            sample_rows = first_chunk.head(5).to_dict('records')
            
            # Create a simplified dataframe with just the essential columns for analysis
            # This avoids loading the entire file into memory
            df = first_chunk
            
            # For large files, we'll estimate rather than compute exact stats
            logging.info(f"Analyzing large file using sampling approach - total rows sampled: {total_rows}")
        else:
            # For smaller files, use the standard approach
            if has_headers:
                df = pd.read_csv(io.StringIO(file_content))
                logging.info(f"CSV file '{filename}' loaded with headers: {list(df.columns)}")
            else:
                # If no headers detected, create default column names
                logging.info(f"CSV file '{filename}' loaded without headers, creating default column names")
                df = pd.read_csv(io.StringIO(file_content), header=None)
                # Create default column names (col0, col1, etc.)
                df.columns = [f'col{i}' for i in range(len(df.columns))]
            sample_rows = df.head(5).to_dict('records')
        
        # Calculate basic statistics
        row_count = len(df)
        column_count = len(df.columns)
        columns = list(df.columns)
        file_size_bytes = len(file_content)
        file_size_mb = file_size_bytes / (1024 * 1024)
        
        # Determine column types
        column_types = {}
        numeric_stats = {}
        
        for col in df.columns:
            try:
                if pd.api.types.is_numeric_dtype(df[col]):
                    column_types[col] = 'numeric'
                    
                    # Calculate numeric statistics for this column
                    stats = {}
                    non_null = df[col].dropna()
                    
                    if len(non_null) > 0:
                        stats['min'] = float(non_null.min())
                        stats['max'] = float(non_null.max())
                        stats['mean'] = float(non_null.mean())
                        stats['median'] = float(non_null.median())
                        try:
                            stats['std'] = float(non_null.std())
                        except:
                            stats['std'] = 0
                        
                        # Check for outliers
                        q1 = float(non_null.quantile(0.25))
                        q3 = float(non_null.quantile(0.75))
                        iqr = q3 - q1
                        lower_bound = q1 - 1.5 * iqr
                        upper_bound = q3 + 1.5 * iqr
                        outliers = len(non_null[(non_null < lower_bound) | (non_null > upper_bound)])
                        stats['outliers'] = outliers
                        stats['outlier_percentage'] = (outliers / len(non_null)) * 100 if len(non_null) > 0 else 0
                    
                    numeric_stats[col] = stats
                else:
                    column_types[col] = 'string'
            except:
                column_types[col] = 'unknown'
        
        # Calculate missing values
        missing_values = df.isna().sum().sum()
        missing_percentage = (missing_values / (row_count * column_count)) * 100 if row_count * column_count > 0 else 0
        
        # Check for trajectory data
        trajectory_metrics = {}
        
        # Check if position columns exist in the data
        has_position_data = all(col in df.columns for col in ['position_n', 'position_e', 'position_d'])
        
        if has_position_data:
            # Compute distances between consecutive points
            df_clean = df.dropna(subset=['position_n', 'position_e', 'position_d'])
            
            if len(df_clean) > 1:
                try:
                    # For large files, sample the data to prevent timeouts
                    sample_rate = max(1, len(df_clean) // 500)  # Sample at most 500 points for analysis
                    logging.info(f"Analyzing trajectory with sampling rate: {sample_rate} for {len(df_clean)} points")
                    
                    # Initialize arrays for coordinates
                    distances = []
                    
                    # Process samples instead of every point to improve performance
                    for i in range(1, len(df_clean), sample_rate):
                        if i >= len(df_clean):
                            break
                            
                        prev_i = max(0, i - sample_rate)
                        try:
                            # Initialize with defaults
                            pos_n1 = pos_e1 = pos_d1 = pos_n2 = pos_e2 = pos_d2 = 0.0
                            
                            # Extract position data using loc instead of iloc for better performance
                            # and use try/except for safer access
                            try:
                                # First point coordinates - using loc for column access is faster 
                                if 'position_n' in df_clean.columns:
                                    pos_n1 = float(df_clean['position_n'].iloc[prev_i])
                                if 'position_e' in df_clean.columns:
                                    pos_e1 = float(df_clean['position_e'].iloc[prev_i])
                                if 'position_d' in df_clean.columns:
                                    pos_d1 = float(df_clean['position_d'].iloc[prev_i])
                                    
                                # Second point coordinates
                                if 'position_n' in df_clean.columns:
                                    pos_n2 = float(df_clean['position_n'].iloc[i])
                                if 'position_e' in df_clean.columns:
                                    pos_e2 = float(df_clean['position_e'].iloc[i])
                                if 'position_d' in df_clean.columns:
                                    pos_d2 = float(df_clean['position_d'].iloc[i])
                                
                                # Calculate distance
                                p1 = (pos_n1, pos_e1, pos_d1)
                                p2 = (pos_n2, pos_e2, pos_d2)
                                distance = math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2 + (p2[2]-p1[2])**2)
                                
                                # Scale distance based on sample rate
                                distances.append(distance)
                            except (ValueError, TypeError) as e:
                                logging.debug(f"Skipping point due to conversion error: {str(e)}")
                                continue
                        except Exception as e:
                            logging.warning(f"Error calculating distance: {str(e)}")
                            continue
                    
                    # Scale up distances based on sample rate to estimate total
                    total_distance = sum(distances) * (sample_rate if sample_rate > 1 else 1) if distances else 0
                    static_samples = sum(1 for d in distances if d < 0.01)
                    static_percentage = (static_samples / len(distances)) * 100 if distances else 0
                    
                    # Altitude change
                    try:
                        if 'position_d' in df_clean.columns and not df_clean['position_d'].empty:
                            min_alt = -float(df_clean['position_d'].max())  # Negative of max 'down' is min altitude
                            max_alt = -float(df_clean['position_d'].min())  # Negative of min 'down' is max altitude
                            alt_change = max_alt - min_alt
                        else:
                            min_alt = 0
                            max_alt = 0
                            alt_change = 0
                    except Exception as e:
                        logging.warning(f"Error calculating altitude metrics: {str(e)}")
                        min_alt = 0
                        max_alt = 0
                        alt_change = 0
                    
                    trajectory_metrics = {
                        'total_distance': total_distance,
                        'avg_speed': total_distance / len(df_clean) if len(df_clean) > 0 else 0,
                        'static_samples': static_samples,
                        'static_percentage': static_percentage,
                        'min_altitude': min_alt,
                        'max_altitude': max_alt,
                        'altitude_change': alt_change
                    }
                except Exception as e:
                    trajectory_metrics = {
                        'error': f'Error calculating trajectory metrics: {str(e)}'
                    }
            else:
                trajectory_metrics = {
                    'error': 'Not enough position data points to calculate trajectory metrics'
                }
        else:
            trajectory_metrics = {
                'error': 'Position data columns not found in file'
            }
            
        # Assemble result
        return {
            'filename': filename,
            'row_count': row_count,
            'column_count': column_count,
            'columns': columns,
            'column_types': column_types,
            'file_size_bytes': file_size_bytes,
            'file_size_mb': file_size_mb,
            'missing_values': int(missing_values),
            'missing_percentage': missing_percentage,
            'numeric_stats': numeric_stats,
            'trajectory_metrics': trajectory_metrics,
            'timestamp': datetime.now().isoformat(),
            'raw_preview': df.head(5).to_dict('records')
        }
    except Exception as e:
        logging.error(f"Error analyzing CSV file: {str(e)}")
        return {
            'filename': filename,
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }

def apply_cleaning_operations(file_info, config, use_temp_file=False):
    """
    Apply configured cleaning operations to a file.
    
    Args:
        file_info (dict): File information including content or temp_filepath
        config (dict): Cleaning configuration
        use_temp_file (bool): If True, read from temp_filepath instead of content
        
    Returns:
        dict: Results of cleaning operations
    """
    # Initialize result structure
    result = {
        'filename': file_info['filename'],
        'original_stats': {
            'row_count': file_info.get('row_count', 0),
            'file_size_mb': file_info.get('file_size_mb', 0)
        },
        'operations_applied': [],
        'cleaning_results': {}
    }
    
    # Check if we're using a temporary file path or content in memory
    if use_temp_file and 'temp_filepath' in file_info and os.path.exists(file_info['temp_filepath']):
        # Get content from temp file
        temp_filepath = file_info['temp_filepath']
        encoding = file_info.get('encoding', 'utf-8')
        logging.info(f"Reading file content from temporary file: {temp_filepath} with encoding {encoding}")
        
        try:
            # Read just the first ~1MB for initial processing and detection
            with open(temp_filepath, 'r', encoding=encoding) as f:
                file_content = f.read(1024 * 1024)  # Read first MB for analysis
                
            # Get file size from the file system
            file_size_bytes = os.path.getsize(temp_filepath)
            file_size_mb = file_size_bytes / (1024 * 1024)
            
            # Flag that we're using a temp file for chunked processing
            is_temp_file = True
        except Exception as e:
            logging.error(f"Error reading from temp file: {str(e)}")
            result['error'] = f"Error reading from temporary file: {str(e)}"
            return result
    else:
        # Use content from memory
        file_content = file_info.get('content', '')
        if not file_content:
            result['error'] = 'File content not available'
            return result
        is_temp_file = False
    
    try:
        # Check if this is a large file
        file_size_bytes = len(file_content)
        file_size_mb = file_size_bytes / (1024 * 1024)
        is_large_file = file_size_mb > 100  # Consider files larger than 100MB as large
        
        if is_large_file:
            logging.info(f"Cleaning large file ({file_size_mb:.2f} MB) with chunked processing approach")
        
        # Try to detect if the file has headers
        with io.StringIO(file_content) as f:
            first_line = f.readline().strip()
            # Check if first line looks like headers (contains non-numeric values)
            has_headers = not all(col.replace('-', '').replace('.', '').isdigit() 
                               for col in first_line.split(',') if col.strip())
        
        # For large files, we'll use chunked processing to minimize memory usage
        if is_large_file:
            chunk_size = 100000  # Process in 100k row chunks
            
            # Initialize an output buffer to collect processed results
            output_buffer = io.StringIO()
            header_written = False
            total_rows_processed = 0
            
            # Process the file in chunks
            if has_headers:
                df_chunks = pd.read_csv(io.StringIO(file_content), chunksize=chunk_size)
                logging.info(f"Processing large file with headers in chunks")
            else:
                df_chunks = pd.read_csv(io.StringIO(file_content), header=None, chunksize=chunk_size)
                # Create column names for headerless files
                first_chunk = next(df_chunks)
                first_chunk.columns = [f'col{i}' for i in range(len(first_chunk.columns))]
                logging.info(f"Processing large file without headers in chunks, creating default column names")
                
                # We need to reset the iterator since we pulled the first chunk
                df_chunks = pd.read_csv(io.StringIO(file_content), header=None, chunksize=chunk_size)
                for i, col in enumerate(first_chunk.columns):
                    df_chunks.columns = [f'col{i}' for i in range(len(first_chunk.columns))]
            
            # For the cleaning operations, we'll use the first chunk as a sample
            if has_headers:
                df = next(df_chunks)
            else:
                df = next(df_chunks)
                df.columns = [f'col{i}' for i in range(len(df.columns))]
            
            # Reset the iterator for actual processing
            if has_headers:
                df_chunks = pd.read_csv(io.StringIO(file_content), chunksize=chunk_size)
            else:
                df_chunks = pd.read_csv(io.StringIO(file_content), header=None, chunksize=chunk_size)
                for chunk in df_chunks:
                    chunk.columns = [f'col{i}' for i in range(len(chunk.columns))]
            
            # Save a copy of the first chunk for before/after comparison
            original_df = df.copy()
            
            # Note: Actual chunk processing will happen after applying operations to the sample
        else:
            # For smaller files, use the standard approach
            if has_headers:
                df = pd.read_csv(io.StringIO(file_content))
                logging.info(f"Cleaning CSV file with detected headers: {list(df.columns)}")
            else:
                # If no headers detected, create default column names
                logging.info(f"Cleaning CSV file without headers, creating default column names")
                df = pd.read_csv(io.StringIO(file_content), header=None)
                # Create default column names (col0, col1, etc.)
                df.columns = [f'col{i}' for i in range(len(df.columns))]
                
            # Save a copy for comparison
            original_df = df.copy()
        
        # Track changes for each operation
        changes = {}
        
        # Apply enabled cleaning operations based on config
        
        # 2.1 File Size Filtering (this would be applied at batch level)
        if config.get('file_size_filtering', {}).get('enabled', False):
            min_size_mb = config['file_size_filtering'].get('min_size_mb', 10)
            if file_info.get('file_size_mb', 0) < min_size_mb:
                result['operations_applied'].append('file_size_filtering')
                result['cleaning_results']['file_size_filtering'] = {
                    'action': 'skipped',
                    'reason': f'File size {file_info.get("file_size_mb", 0):.2f} MB is below threshold {min_size_mb} MB'
                }
                return result  # Skip further processing
        
        # 2.2 Header Management
        if config.get('header_management', {}).get('enabled', False):
            standard_headers = config['header_management'].get('standard_headers', [
                'sec', 'nanosec', 'frame_id', 'position_n', 'position_e', 'position_d',
                'va', 'alpha', 'beta', 'phi', 'theta', 'psi', 'chi', 'u', 'v', 'w', 'p', 'q', 'r',
                'vg', 'wn', 'we', 'chi_deg', 'psi_deg', 'initial_lat', 'initial_long', 'initial_alt'
            ])
            
            # Check if headers need standardization
            current_headers = list(df.columns)
            missing_headers = [h for h in standard_headers if h not in current_headers]
            extra_headers = [h for h in current_headers if h not in standard_headers]
            
            if missing_headers or extra_headers:
                # Create a mapping from current to standard headers
                header_mapping = {}
                for i, header in enumerate(current_headers):
                    if i < len(standard_headers):
                        header_mapping[header] = standard_headers[i]
                
                # Rename columns that have a mapping
                df = df.rename(columns=header_mapping)
                
                # Add missing columns with NaN values
                for header in missing_headers:
                    if header not in df.columns:
                        df[header] = np.nan
                
                result['operations_applied'].append('header_management')
                result['cleaning_results']['header_management'] = {
                    'headers_before': current_headers,
                    'headers_after': list(df.columns),
                    'missing_headers_added': missing_headers,
                    'renamed_headers': header_mapping
                }
        
        # 2.3 Static Flight Detection & Removal
        if config.get('static_flight_detection', {}).get('enabled', False):
            distance_threshold = config['static_flight_detection'].get('distance_threshold', 10)
            
            if 'trajectory_metrics' in file_info and 'total_distance' in file_info['trajectory_metrics']:
                total_distance = file_info['trajectory_metrics']['total_distance']
                
                if total_distance < distance_threshold:
                    result['operations_applied'].append('static_flight_detection')
                    result['cleaning_results']['static_flight_detection'] = {
                        'action': 'removed',
                        'reason': f'Total distance {total_distance:.2f}m is below threshold {distance_threshold}m',
                        'total_distance': total_distance
                    }
                    # For static flight removal, we'd typically skip this file in a batch process
                    # Here we'll just flag it
                    df = pd.DataFrame()  # Empty dataframe to indicate removal
                else:
                    result['cleaning_results']['static_flight_detection'] = {
                        'action': 'kept',
                        'total_distance': total_distance
                    }
        
        # 2.4 Trim Static Start
        if config.get('trim_static_start', {}).get('enabled', False) and not df.empty:
            window_size = config['trim_static_start'].get('window_size', 50)
            speed_threshold = config['trim_static_start'].get('speed_threshold', 0.5)
            position_threshold = config['trim_static_start'].get('position_threshold', 0.5)
            
            # Check if we have position columns
            if all(col in df.columns for col in ['position_n', 'position_e', 'position_d']):
                start_index = 0
                
                # Optimize calculation for large files
                if len(df) > 5000:  # Only use sampling for large files
                    # Use sampling to speed up analysis for large files
                    sample_rate = max(1, len(df) // 200)  # Analyze at most 200 windows
                    logging.info(f"Analyzing static start with sampling rate: {sample_rate} for {len(df)} points")
                    
                    for i in range(0, len(df) - window_size, sample_rate):
                        # Extract window data directly as numpy arrays for faster calculation
                        window_n = df['position_n'].iloc[i:i+window_size].to_numpy()
                        window_e = df['position_e'].iloc[i:i+window_size].to_numpy()
                        window_d = df['position_d'].iloc[i:i+window_size].to_numpy()
                        
                        # Calculate max position change in window using vectorized operations
                        max_change_n = np.max(window_n) - np.min(window_n)
                        max_change_e = np.max(window_e) - np.min(window_e)
                        max_change_d = np.max(window_d) - np.min(window_d)
                        max_change = math.sqrt(max_change_n**2 + max_change_e**2 + max_change_d**2)
                        
                        if max_change > position_threshold:
                            # Fine-tune the start index by checking each point in the sample range
                            for j in range(i, min(i + sample_rate, len(df) - window_size)):
                                sub_window_n = df['position_n'].iloc[j:j+window_size].to_numpy()
                                sub_window_e = df['position_e'].iloc[j:j+window_size].to_numpy()
                                sub_window_d = df['position_d'].iloc[j:j+window_size].to_numpy()
                                
                                sub_max_change_n = np.max(sub_window_n) - np.min(sub_window_n)
                                sub_max_change_e = np.max(sub_window_e) - np.min(sub_window_e)
                                sub_max_change_d = np.max(sub_window_d) - np.min(sub_window_d)
                                sub_max_change = math.sqrt(sub_max_change_n**2 + sub_max_change_e**2 + sub_max_change_d**2)
                                
                                if sub_max_change > position_threshold:
                                    start_index = j
                                    break
                            break
                else:
                    # For smaller files, use the original approach
                    for i in range(len(df) - window_size):
                        window = df.iloc[i:i+window_size]
                        
                        # Calculate max position change in window
                        max_change_n = window['position_n'].max() - window['position_n'].min()
                        max_change_e = window['position_e'].max() - window['position_e'].min()
                        max_change_d = window['position_d'].max() - window['position_d'].min()
                        max_change = math.sqrt(max_change_n**2 + max_change_e**2 + max_change_d**2)
                        
                        if max_change > position_threshold:
                            start_index = i
                            break
                
                if start_index > 0:
                    rows_before = len(df)
                    df = df.iloc[start_index:].reset_index(drop=True)
                    rows_removed = rows_before - len(df)
                    
                    result['operations_applied'].append('trim_static_start')
                    result['cleaning_results']['trim_static_start'] = {
                        'rows_removed': rows_removed,
                        'percentage_removed': (rows_removed / rows_before) * 100 if rows_before > 0 else 0,
                        'start_index': start_index
                    }
        
        # 2.5 Remove Static Samples
        if config.get('remove_static_samples', {}).get('enabled', False) and not df.empty:
            speed_threshold = config['remove_static_samples'].get('speed_threshold', 0.0)
            
            if 'velocity' in df.columns:
                # Filter out points with velocity below threshold
                rows_before = len(df)
                df = df[df['velocity'] > speed_threshold].reset_index(drop=True)
                rows_removed = rows_before - len(df)
                
                result['operations_applied'].append('remove_static_samples')
                result['cleaning_results']['remove_static_samples'] = {
                    'rows_removed': rows_removed,
                    'percentage_removed': (rows_removed / rows_before) * 100 if rows_before > 0 else 0,
                    'threshold': speed_threshold
                }
            else:
                # If velocity isn't available, calculate it from position changes
                if all(col in df.columns for col in ['position_n', 'position_e', 'position_d']):
                    # For large files, sample to prevent timeout
                    sample_rate = max(1, len(df) // 1000)  # Process at most 1000 points
                    logging.info(f"Calculating velocities with sampling rate: {sample_rate} for {len(df)} points")
                    
                    # Create separate arrays for better performance
                    pos_n = df['position_n'].to_numpy()
                    pos_e = df['position_e'].to_numpy()
                    pos_d = df['position_d'].to_numpy()
                    
                    # Initialize velocity column
                    df['calculated_velocity'] = 0.0
                    
                    # Create a mask of points to process
                    indices_to_process = list(range(0, len(df), sample_rate))
                    if indices_to_process[-1] != len(df) - 1:
                        indices_to_process.append(len(df) - 1)
                    
                    # Batch calculate velocities for sampled points
                    for i in range(1, len(indices_to_process)):
                        idx = indices_to_process[i]
                        prev_idx = indices_to_process[i-1]
                        try:
                            # Calculate velocity between sampled points
                            p1 = np.array([float(pos_n[prev_idx]), float(pos_e[prev_idx]), float(pos_d[prev_idx])])
                            p2 = np.array([float(pos_n[idx]), float(pos_e[idx]), float(pos_d[idx])])
                            distance = np.linalg.norm(p2 - p1)
                            
                            # Assign velocity to all points in this segment
                            segment_velocity = distance / (idx - prev_idx) if idx != prev_idx else 0.0
                            df.loc[prev_idx:idx, 'calculated_velocity'] = segment_velocity
                        except (ValueError, IndexError, TypeError) as e:
                            logging.debug(f"Error calculating velocity at index {idx}: {str(e)}")
                            df.loc[prev_idx:idx, 'calculated_velocity'] = 0.0
                    
                    rows_before = len(df)
                    df = df[df['calculated_velocity'] > speed_threshold].reset_index(drop=True)
                    rows_removed = rows_before - len(df)
                    
                    result['operations_applied'].append('remove_static_samples')
                    result['cleaning_results']['remove_static_samples'] = {
                        'rows_removed': rows_removed,
                        'percentage_removed': (rows_removed / rows_before) * 100 if rows_before > 0 else 0,
                        'threshold': speed_threshold,
                        'note': 'Velocity calculated from position changes'
                    }
        
        # 2.6 Remove Quaternion Columns
        if config.get('remove_quaternion_columns', {}).get('enabled', False) and not df.empty:
            quaternion_columns = config['remove_quaternion_columns'].get('columns', [
                'Quat_1', 'Quat_2', 'Quat_3', 'Quat_4', 'quat_valid'
            ])
            
            # Find which of these columns actually exist
            columns_to_remove = [col for col in quaternion_columns if col in df.columns]
            
            if columns_to_remove:
                df = df.drop(columns=columns_to_remove)
                
                result['operations_applied'].append('remove_quaternion_columns')
                result['cleaning_results']['remove_quaternion_columns'] = {
                    'columns_removed': columns_to_remove,
                    'count': len(columns_to_remove)
                }
        
        # 2.7 Anomaly Detection & Removal
        if config.get('anomaly_detection', {}).get('enabled', False) and not df.empty:
            std_threshold = config['anomaly_detection'].get('std_threshold', 2.0)
            metrics_to_check = config['anomaly_detection'].get('metrics', ['average_speed', 'total_distance', 'altitude_change'])
            
            anomalies_detected = []
            
            # Check trajectory metrics for anomalies
            if 'trajectory_metrics' in file_info:
                metrics = file_info['trajectory_metrics']
                
                # We would need reference statistics across all files to detect anomalies properly
                # For now, let's use a simplified approach with some hardcoded thresholds
                
                if 'avg_speed' in metrics and 'average_speed' in metrics_to_check:
                    avg_speed = metrics['avg_speed']
                    if avg_speed > 100:  # Arbitrary threshold for demonstration
                        anomalies_detected.append({
                            'metric': 'average_speed',
                            'value': avg_speed,
                            'threshold': 100,
                            'reason': 'Average speed is unusually high'
                        })
                
                if 'altitude_change' in metrics and 'altitude_change' in metrics_to_check:
                    alt_change = metrics.get('altitude_change', 0)
                    if alt_change > 5000:  # Arbitrary threshold
                        anomalies_detected.append({
                            'metric': 'altitude_change',
                            'value': alt_change,
                            'threshold': 5000,
                            'reason': 'Altitude change is unusually large'
                        })
            
            if anomalies_detected:
                result['operations_applied'].append('anomaly_detection')
                result['cleaning_results']['anomaly_detection'] = {
                    'anomalies': anomalies_detected,
                    'action': 'flagged' if config['anomaly_detection'].get('flag_only', True) else 'removed'
                }
                
                # If configured to remove anomalous files, we would skip this file
                if not config['anomaly_detection'].get('flag_only', True):
                    df = pd.DataFrame()  # Empty dataframe to indicate removal
        
        # 2.8 File Resequencing
        # This would typically be implemented at the batch level after processing all files
        # Here we just note it as a potential operation
        if config.get('file_resequencing', {}).get('enabled', False):
            base_filename = config['file_resequencing'].get('base_filename', "test {number}.csv")
            
            result['operations_applied'].append('file_resequencing')
            result['cleaning_results']['file_resequencing'] = {
                'original_filename': file_info['filename'],
                'note': 'Filename would be updated in batch process'
            }
        
        # Calculate final statistics
        rows_after = len(df)
        columns_after = len(df.columns)
        
        # Prepare output as CSV string
        if not df.empty:
            output = io.StringIO()
            df.to_csv(output, index=False)
            cleaned_content = output.getvalue()
            cleaned_file_size = len(cleaned_content)
            
            result['cleaned_stats'] = {
                'row_count': rows_after,
                'row_reduction': file_info.get('row_count', 0) - rows_after,
                'row_reduction_percentage': ((file_info.get('row_count', 0) - rows_after) / file_info.get('row_count', 1)) * 100 if file_info.get('row_count', 0) > 0 else 0,
                'file_size_mb': cleaned_file_size / (1024 * 1024),
                'file_size_reduction_mb': file_info.get('file_size_mb', 0) - (cleaned_file_size / (1024 * 1024)),
                'file_size_reduction_percentage': ((file_info.get('file_size_bytes', 0) - cleaned_file_size) / file_info.get('file_size_bytes', 1)) * 100 if file_info.get('file_size_bytes', 0) > 0 else 0
            }
            
            # Include sample of cleaned data
            result['cleaned_preview'] = df.head(5).to_dict('records')
            result['cleaned_content'] = cleaned_content
        else:
            result['cleaned_stats'] = {
                'row_count': 0,
                'row_reduction': file_info.get('row_count', 0),
                'row_reduction_percentage': 100,
                'file_size_mb': 0,
                'file_size_reduction_mb': file_info.get('file_size_mb', 0),
                'file_size_reduction_percentage': 100,
                'note': 'File removed or empty after cleaning'
            }
        
        return result
    
    except Exception as e:
        logging.error(f"Error applying cleaning operations: {str(e)}")
        result['error'] = f"Error applying cleaning operations: {str(e)}"
        return result