# Flight Trajectory Visualizer Application Structure

This document provides an overview of the application structure to help with deployment and maintenance.

## Core Files

- `main.py`: Entry point for the application, imports from app.py
- `app.py`: Contains the Flask application, routes, and API endpoints
- `utils/data_processor.py`: Core data processing functionality for CSV files
- `gunicorn_config.py`: Configuration for gunicorn server in production

## Templates and Static Files

### Templates
- `templates/index.html`: Main page template for the visualization interface

### Static Assets
- `static/js/script.js`: Main JavaScript file for 3D visualization
- `static/css/style.css`: CSS styles for the application

## Important Points for Deployment

1. **Required Environment Variables**:
   - `SESSION_SECRET`: Secret key for Flask sessions
   - `PORT` (optional): Port number to run the application on (defaults to 5000)

2. **Core Dependencies**:
   - Flask: Web framework
   - Pandas: For data processing
   - NumPy: For numerical operations
   - Gunicorn: WSGI HTTP Server for production

3. **Entry Point**:
   The application should be started using:
   ```
   gunicorn --bind 0.0.0.0:PORT main:app
   ```

4. **File Uploads**:
   The application processes CSV files directly in memory to avoid disk usage.
   
5. **Memory Requirements**:
   Processing large CSV files can require significant memory. Ensure your server has adequate resources.

## Troubleshooting Common Issues

1. **Slow File Processing**:
   - Large CSV files are processed with memory-efficient methods, which may take time
   - If consistently slow, consider pre-processing files or increasing server resources

2. **Browser Performance**:
   - 3D visualization requires WebGL support
   - Performance depends on client hardware and browser capabilities

3. **File Size Limits**:
   - Default maximum upload size is 100MB
   - Can be adjusted in the Flask configuration if needed

## Maintenance

1. **Keeping the Application Running**:
   - Use nohup, screen, or supervisor as described in the deployment guide
   - Implement a monitoring system to restart the application if it crashes

2. **Backups**:
   - The application doesn't store persistent data, but back up your configuration files
   - If you customize the code, maintain version control