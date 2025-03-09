# Flight Trajectory Visualization Platform

A cutting-edge 3D flight trajectory visualization platform for ROS2 Humble data, enabling advanced exploration and analysis of UAV flight paths.

![Flight Trajectory Visualization](https://placeholder-for-screenshot.png)

## Features

- **Three.js-powered 3D rendering engine** - Smooth and interactive 3D visualization
- **ROS2 Humble data integration** - Seamless compatibility with ROS2 Humble data formats
- **Advanced cloud storage integration** - Import data directly from Google Drive and Microsoft OneDrive
- **Dynamic aircraft model visualization** - Realistic aircraft models that follow flight paths
- **Flexible view modes and camera settings** - Multiple perspectives for comprehensive analysis
- **Memory-efficient large dataset handling** - Optimized for gigabyte-scale flight data files
- **Enhanced UI with interactive modal systems** - User-friendly interface for data exploration

## Live Demo

[Access the live demo here](https://your-deployment-url.replit.app) (Coming soon)

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

### Uploading Flight Data

1. Click the "Upload Files" button in the main interface
2. Select CSV files containing flight trajectory data
3. The system will automatically process and visualize the data

### Using Cloud Storage

1. Click "Import from Cloud" button
2. Select your cloud provider (Google Drive or Microsoft OneDrive)
3. Authenticate with your account
4. Browse and select files to import
5. The system will download, process, and visualize the data

### Visualizing Flight Paths

- **Rotate View**: Click and drag with the mouse
- **Zoom**: Use the mouse wheel or pinch gesture
- **Pan**: Hold Shift and drag with the mouse
- **Toggle Aircraft Models**: Use the "Show Aircraft" checkbox
- **Change View Mode**: Select from the "View Mode" dropdown (Top-down, Side, Free, Follow)
- **Time Control**: Use the time slider to navigate through the flight path

### Data Analysis Tools

- **Charts Panel**: View altitude, speed, and other metrics
- **Data Inspector**: Click on any point in the trajectory to see detailed data
- **Playback Controls**: Play, pause, and adjust playback speed of the flight animation

## Data Formats

The application accepts CSV files with flight trajectory data. The minimum required columns are:

- Latitude (decimal degrees)
- Longitude (decimal degrees)
- Altitude (meters)
- Timestamp (ISO format or epoch time)

Additional columns that will be recognized:
- Heading/Yaw (degrees)
- Pitch (degrees)
- Roll (degrees)
- Speed (m/s)
- Battery level (%)

Example format:
```
timestamp,latitude,longitude,altitude,heading,pitch,roll,speed
2023-01-01T12:00:00Z,37.7749,-122.4194,100.5,45.0,2.1,0.5,15.2
2023-01-01T12:00:01Z,37.7750,-122.4193,101.2,45.2,2.0,0.6,15.3
```

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

The platform includes tools for cleaning and preprocessing large flight data files:

- **Column mapping**: Automatically detect and map columns with different names
- **Outlier detection**: Identify and filter statistical outliers in position data
- **Smoothing**: Apply noise reduction algorithms to flight paths
- **Downsampling**: Reduce data density for better performance with very large files
- **Gap filling**: Interpolate missing data points in trajectories

Access these features from the "Data Cleaning" tab in the interface.

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

## Acknowledgments

- ROS2 Humble community
- Three.js developers
- All contributors to this project

---

Made with ❤️ by [Your Team Name]