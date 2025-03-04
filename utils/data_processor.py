import csv
import io
import json

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
        'nanosec': ['nanosec', 'nanoseconds']
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
    for row in csv_reader:
        point = {}
        
        # Extract values for each identified column
        for key, index in column_indices.items():
            try:
                point[key] = float(row[index])
            except (ValueError, IndexError):
                # Skip malformed data
                continue
        
        # Add additional calculated values if needed
        if 'sec' in point and 'nanosec' in point:
            point['time'] = point['sec'] + point['nanosec'] / 1e9
        
        data_points.append(point)
    
    return {
        'data': data_points,
        'metadata': {
            'columns': list(column_indices.keys()),
            'points_count': len(data_points)
        }
    }
