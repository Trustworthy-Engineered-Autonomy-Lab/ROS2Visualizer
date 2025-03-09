# Flight Trajectory Visualization Platform by TEA Labs



flight trajectory visualization platform for ROS2 Humble data, enabling advanced exploration and analysis of UAV flight paths. Developed by Trustworthy Engineered Autonomy (TEA) Labs.

# Flight Trajectory Visualization Platform by TEA Labs


[![Watch the video](https://github.com/user-attachments/assets/7dc4623c-0d6b-49de-ab33-1947d3bdcb9d)](https://youtu.be/QPEhDHTueNw)



3D flight trajectory visualization platform for ROS2 Humble data, enabling advanced exploration and analysis of UAV flight paths. 


## Features

- **Three.js-powered 3D rendering engine** - Smooth and interactive 3D visualization with dynamic camera controls
- **ROS2 Humble data integration** - Seamless compatibility with ROS2 Humble message formats and timestamp structures
- **Advanced cloud storage integration** - Import data directly from Google Drive and Microsoft OneDrive with OAuth authentication
- **Dynamic aircraft model visualization** - Realistic aircraft models that follow flight paths with orientation data
- **Flexible view modes and camera settings** - Multiple perspectives (top-down, side, trailing, free) for comprehensive analysis
- **Memory-efficient large dataset handling** - Chunked processing optimized for gigabyte-scale flight data files
- **Enhanced UI with interactive modal systems** - User-friendly interface with accessible dialogs for data exploration
- **Comprehensive data cleaning workflow** - Tools for analyzing, cleaning, and preprocessing flight trajectory data
- **Intelligent column mapping** - Automatic detection of position and trajectory data in various formats




# port 3000 ece-ivan-lg02.ad.ufl.edu

## Table of Contents

- [Installation](#installation)
- [Usage Guide](#usage-guide)
- [Data Formats](#data-formats)
- [Cloud Storage Integration](#cloud-storage-integration)
- [Data Cleaning Features](#data-cleaning-features)
- [Customization](#customization)
- [Contributing](#contributing)
- [License](#license)

## Installation

### Prerequisites

- Python 3.10+
- Flask
- Three.js (included)
- PostgreSQL (for data storage)

### Setup Instructions

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/flight-trajectory-visualizer.git
cd flight-trajectory-visualizer
```

2. **Install Python dependencies**

```bash
pip install -r requirements.txt
```

3. **Set up environment variables**

Create a `.env` file in the root directory with:

```
DATABASE_URL=postgresql://user:password@localhost:5432/flight_data
SESSION_SECRET=your_secret_key_here
```

For cloud storage integration (optional):
```
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
MICROSOFT_CLIENT_ID=your_microsoft_client_id
MICROSOFT_CLIENT_SECRET=your_microsoft_client_secret
MICROSOFT_TENANT_ID=your_microsoft_tenant_id
```

4. **Start the application**

```bash
gunicorn --bind 0.0.0.0:5000 --reuse-port --reload main:app
```

Or using the Flask development server:

```bash
python main.py
```

The application will be available at `http://localhost:5000`

## Usage Guide

### Data Import Options

#### Uploading Local Files
1. Click the "Upload Files" button in the main interface
2. Select CSV files containing flight trajectory data
3. The system will automatically process and visualize the data

#### Using Server Data Browser
1. Click "Browse Server Data" button
2. Navigate through available folders (sample_data, flight_trajectories)
3. Select files to process and click "Load Selected Files"
4. Files will be processed and visualized automatically

#### Using Cloud Storage
1. Click "Import from Cloud" button
2. Select your cloud provider (Google Drive or Microsoft OneDrive)
3. Authenticate with your account (OAuth flow)
4. Browse and select files to import
5. The system will download, process, and visualize the data

### Visualization Controls

#### Camera Controls
- **Rotate View**: Click and drag with the mouse
- **Zoom**: Use the mouse wheel or pinch gesture
- **Pan**: Hold Shift and drag with the mouse

#### View Modes
- **Top-down**: Bird's eye view (useful for flight path patterns)
- **Side**: East-Altitude view (useful for altitude changes)
- **Trailing**: View from behind aircraft (dynamic following)
- **Free**: Unrestricted manual camera control

#### Playback Controls
- **Play/Pause**: Start or pause the trajectory animation
- **Time Slider**: Navigate to specific points in the flight path
- **Playback Speed**: Adjust animation speed (0.5x to 10x)
- **Reset View**: Return camera to default position

#### Visual Elements
- **Toggle Aircraft Models**: Show/hide 3D aircraft models
- **Toggle House**: Show/hide reference building (positioned at X=-1010, Y=0, Z=10)
- **Toggle Fullscreen**: Expand visualization to full browser window

### Data Analysis Tools
- **Trajectory List**: Enable/disable visibility of multiple trajectories
- **Charts Panel**: View altitude, speed, and other metrics over time
- **Data Inspector**: Click on any point in the trajectory to see detailed data
- **Time Display**: Shows current animation time and selected point details
- **Export**: Export processed and visualized data for further analysis

## Data Formats

The application accepts CSV files with flight trajectory data in multiple formats:

### Standard Format
The application recognizes standard position columns:

- position_n/latitude (North position in meters or decimal degrees)
- position_e/longitude (East position in meters or decimal degrees)
- position_d/altitude (Down position in meters - negative is up)
- time/timestamp (Epoch time or ISO format)

### ROS2 Humble Format
The application automatically detects ROS2 Humble message structures:

- Timestamp columns (sec, nanosec or epoch)
- Position data (often in columns 3, 4, 5)
- Orientation quaternions or Euler angles
- Velocity data

### Additional Supported Fields
The platform will automatically detect and visualize:

- Orientation (phi/roll, theta/pitch, psi/yaw in radians or degrees)
- Velocity components (u, v, w in m/s)
- Battery level (%)
- Other numeric telemetry data

Example ROS2 trajectory format:
```
1741145235,488322172,,0.021680186,-0.36555812,-0.08883252,0.22961263358592987,...
1741145235,491141538,,0.021720823,-0.36564198,-0.088240564,0.2397002726793289,...
```

The platform's intelligent column mapping will automatically detect position data in various formats.

## Cloud Storage Integration

### Google Drive Setup

1. Create a Google Cloud project
2. Enable the Google Drive API
3. Create OAuth credentials (Web application type)
4. Set authorized redirect URIs to include your application URL
5. Add your credentials to the environment variables

### Microsoft OneDrive Setup

1. Register an application in the Azure portal
2. Configure API permissions for Microsoft Graph (Files.Read)
3. Create a client secret
4. Set redirect URIs to include your application URL
5. Add your credentials to the environment variables

## Data Cleaning Features

The platform includes a comprehensive workflow for cleaning and preprocessing large flight data files:

### Workflow Steps
1. **Upload**: Select and upload flight data files
2. **Analyze**: Automatically analyze file content and structure
3. **Configure**: Set up cleaning operations for each file
4. **Preview**: Review the effects of cleaning operations
5. **Process**: Apply selected operations to all files
6. **Visualize**: View the cleaned data in the 3D viewer

### Cleaning Operations
- **Column mapping**: Automatically detect and map columns with different names
- **Outlier detection**: Identify and filter statistical outliers in position data
- **Smoothing**: Apply noise reduction algorithms to flight paths
- **Downsampling**: Reduce data density for better performance with very large files
- **Gap filling**: Interpolate missing data points in trajectories
- **Noise filtering**: Remove sensor noise from position and orientation data
- **Timestamp normalization**: Standardize various time formats

### Processing Metrics
The platform provides detailed metrics on:
- Data reduction percentage
- Outliers detected and removed
- Processing time
- Memory usage optimization

Access these features from the "Data Cleaning" tab in the interface or directly at the "/clean" endpoint.

## Customization

### Aircraft Models

You can customize aircraft models by:

1. Creating a 3D model in glTF or OBJ format
2. Adding it to the `/static/models/` directory
3. Updating the model selection dropdown in the UI

### Adding New Metrics

To add new metrics to charts and data analysis:

1. Modify the `process_csv_data()` function in `utils/data_processor.py`
2. Add the new metric to the chart initialization in `static/js/script.js`
3. Update the UI to display the new metric

### Extending Cloud Storage

To add support for additional cloud providers:

1. Create a new service class in `utils/cloud_storage.py` that extends `CloudStorageService`
2. Implement the required authentication and file operations
3. Add the UI elements in `static/js/cloud_storage.js`

## Contributing

We welcome contributions to improve the Flight Trajectory Visualization Platform!

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run tests to ensure functionality
5. Commit your changes (`git commit -m 'Add some amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Coding Standards

- Follow PEP 8 for Python code
- Use ESLint with Airbnb rules for JavaScript
- Document all functions and classes with docstrings/JSDoc

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Technical Implementation Details

### Backend Architecture
- **Flask**: Powers the web application with RESTful endpoints
- **Pandas/NumPy**: Used for efficient data processing and analysis
- **Chunked Processing**: Memory-efficient handling of large datasets with streaming approach
- **Dynamic Column Detection**: Intelligent mapping of various data formats to standardized structure

### Frontend Architecture
- **Three.js**: Core 3D rendering engine for trajectory visualization
- **Chart.js**: Real-time data visualization in charts and graphs
- **Accessible Modal System**: Enhanced UI with keyboard navigation and screen reader support
- **Responsive Design**: Adapts to different screen sizes and device capabilities

### Performance Optimizations
- **Trajectory Sampling**: Automatic downsampling for gigabyte-scale files
- **Efficient Data Structures**: Optimized for both rendering and analysis
- **Lazy Loading**: Only processes what's needed when it's needed
- **Progressive Enhancement**: Core functionality works without cloud integration

## Acknowledgments

- ROS2 Humble community
- Three.js developers
- Pandas and NumPy contributors
- All contributors to this project

---

Made with ❤️ by TEA Labs (Trustworthy Engineered Autonomy)
