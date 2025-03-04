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
from datetime import datetime

# Install pandas and numpy if not already installed
try:
    import pandas as pd
    import numpy as np
except ImportError:
    logging.error("Required packages not found. Please install pandas and numpy.")
    raise

def analyze_csv_file(file_content, filename):
    """
    Analyze a CSV file and return basic statistics.
    
    Args:
        file_content (str): CSV file content as string
        filename (str): Name of the file
        
    Returns:
        dict: Statistics about the file
    """
    try:
        # Convert string content to DataFrame
        df = pd.read_csv(io.StringIO(file_content))
        
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
                    distances = []
                    for i in range(1, len(df_clean)):
                        try:
                            p1 = (float(df_clean.iloc[i-1]['position_n']), 
                                  float(df_clean.iloc[i-1]['position_e']), 
                                  float(df_clean.iloc[i-1]['position_d']))
                            p2 = (float(df_clean.iloc[i]['position_n']), 
                                  float(df_clean.iloc[i]['position_e']), 
                                  float(df_clean.iloc[i]['position_d']))
                            distance = math.sqrt((p2[0]-p1[0])**2 + (p2[1]-p1[1])**2 + (p2[2]-p1[2])**2)
                            distances.append(distance)
                        except (ValueError, KeyError, IndexError) as e:
                            logging.warning(f"Error calculating distance for row {i}: {str(e)}")
                            continue
                    
                    total_distance = sum(distances) if distances else 0
                    static_samples = sum(1 for d in distances if d < 0.01)
                    static_percentage = (static_samples / len(distances)) * 100 if distances else 0
                    
                    # Altitude change
                    try:
                        min_alt = -float(df_clean['position_d'].max())  # Negative of max 'down' is min altitude
                        max_alt = -float(df_clean['position_d'].min())  # Negative of min 'down' is max altitude
                        alt_change = max_alt - min_alt
                    except:
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

def apply_cleaning_operations(file_info, config):
    """
    Apply configured cleaning operations to a file.
    
    Args:
        file_info (dict): File information including content
        config (dict): Cleaning configuration
        
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
    
    # Get file content
    file_content = file_info.get('content', '')
    if not file_content:
        result['error'] = 'File content not available'
        return result
    
    try:
        # Convert to DataFrame for processing
        df = pd.read_csv(io.StringIO(file_content))
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
                
                # Calculate position changes in sliding windows
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
                    # Calculate velocities
                    df['calculated_velocity'] = 0.0
                    for i in range(1, len(df)):
                        try:
                            p1 = np.array([float(df.iloc[i-1]['position_n']), 
                                        float(df.iloc[i-1]['position_e']), 
                                        float(df.iloc[i-1]['position_d'])])
                            p2 = np.array([float(df.iloc[i]['position_n']), 
                                        float(df.iloc[i]['position_e']), 
                                        float(df.iloc[i]['position_d'])])
                            distance = np.linalg.norm(p2 - p1)
                            df.loc[i, 'calculated_velocity'] = distance
                        except (ValueError, KeyError, IndexError, TypeError):
                            df.loc[i, 'calculated_velocity'] = 0.0
                    
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