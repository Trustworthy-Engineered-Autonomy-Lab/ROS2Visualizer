import os
import logging
import tempfile
import time
import uuid
import re
import json
from werkzeug.middleware.proxy_fix import ProxyFix
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import base64

# Configure logging
logging.basicConfig(level=logging.INFO)

# Create Flask app
app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

# Set session secret key
app.secret_key = os.environ.get("SESSION_SECRET", "dev_secret_key")

# Configure Flask for handling large file uploads without disk usage
app.config['MAX_CONTENT_LENGTH'] = 1 * 1024 * 1024 * 1024  # 1GB max upload size

# Import utility functions
from utils.data_processor import process_csv_data
from utils.data_cleaner import analyze_csv_file, apply_cleaning_operations
from utils.cloud_storage import get_cloud_service, save_oauth_credentials

@app.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html')

@app.route('/data_cleaning')
def data_cleaning():
    """Render the data cleaning page."""
    return render_template('data_cleaning.html')

# Direct CSV content approach - no file uploads
@app.route('/analyze_csv_direct', methods=['POST'])
def analyze_csv_direct():
    """Analyze CSV content sent directly in request body without file upload.
    
    This approach completely bypasses Werkzeug's file upload handling
    and avoids disk quota issues by not using multipart form uploads.
    
    Expected request format:
    {
        "filename": "data.csv",
        "content": "base64-encoded-csv-content",
        "encoding": "utf-8"  // optional
    }
    """
    try:
        data = request.json
        if not data or 'content' not in data or 'filename' not in data:
            return jsonify({"error": "Missing file content or filename"}), 400
        
        # Extract basic info
        filename = data['filename']
        encoding = data.get('encoding', 'utf-8')
        content_b64 = data['content']
        
        # Decode base64 content
        try:
            content = base64.b64decode(content_b64).decode(encoding)
        except Exception as e:
            return jsonify({"error": f"Failed to decode content: {str(e)}"}), 400
        
        # Now analyze the CSV content
        start_time = time.time()
        stats = analyze_csv_file(content, filename, is_sample=False)
        analysis_duration = time.time() - start_time
        
        # Add timing information
        stats['analysis_time'] = analysis_duration
        stats['filename'] = filename
        stats['success'] = True
        stats['memory_efficient_processing'] = True
        stats['timestamp'] = time.time()
        
        # Return detailed analytics
        return jsonify({"files": [stats]})
        
    except Exception as e:
        logging.error(f"Error in analyze_csv_direct: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Server error: {str(e)}"}), 500

# For backward compatibility, keep the old route but have it redirect to this one
@app.route('/analyze_csv', methods=['POST'])
def analyze_csv():
    """Legacy route that now shows a helpful error message."""
    return jsonify({
        "error": "Direct file uploads are disabled due to disk quota issues. Please use the new client-side approach.",
        "solution": "Use /analyze_csv_direct endpoint with base64-encoded content instead of multipart form uploads."
    }), 400

# Create a new endpoint for processing CSV files directly with base64 content
@app.route('/process_csv_direct', methods=['POST'])
def process_csv_direct():
    """Process CSV content sent directly as base64 in request body.
    
    This approach bypasses file uploads entirely to avoid disk quota issues.
    
    Expected request format:
    {
        "filename": "data.csv",
        "content": "base64-encoded-csv-content", 
        "encoding": "utf-8"  // optional
    }
    """
    try:
        data = request.json
        if not data or 'content' not in data or 'filename' not in data:
            return jsonify({"error": "Missing file content or filename"}), 400
        
        # Extract basic info
        filename = data['filename']
        encoding = data.get('encoding', 'utf-8')
        content_b64 = data['content']
        
        # Decode base64 content
        try:
            content = base64.b64decode(content_b64).decode(encoding)
        except Exception as e:
            return jsonify({"error": f"Failed to decode content: {str(e)}"}), 400
            
        # Process the CSV content directly without file uploads
        start_time = time.time()
        logging.info(f"Processing direct CSV data for {filename}")
        
        # Process the CSV data
        processed_data = process_csv_data(content, file_encoding=encoding)
        
        # Add performance metrics
        processing_duration = time.time() - start_time
        processed_data['performance_metrics'] = {
            'total_duration_seconds': round(processing_duration, 2),
            'memory_efficient_processing': True
        }
        
        return jsonify(processed_data)
    except Exception as e:
        logging.error(f"Error in process_csv_direct: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route('/clean_data', methods=['POST'])
def clean_data():
    """Apply cleaning operations to analyzed files using memory-efficient approach."""
    try:
        config = request.json
        if not config:
            return jsonify({"error": "No cleaning configuration provided"}), 400
            
        # Check if this is a direct cleaning request with file content
        if 'file_content' in config and 'filename' in config:
            file_info = {
                'content': config['file_content'],
                'filename': config['filename']
            }
            
            # Apply operations directly to the content
            cleaned_data = apply_cleaning_operations(file_info, config)
            return jsonify({"results": [cleaned_data]})
        
        # Otherwise check session data
        if 'analysis_results' not in session:
            return jsonify({"error": "No analysis results found. Please analyze files first."}), 400
        
        # Get files info from session
        analysis_results = session['analysis_results']
        
        # Process files with the given configuration
        cleaning_results = []
        for file_info in analysis_results:
            if 'error' not in file_info:
                cleaned_data = apply_cleaning_operations(file_info, config)
                cleaning_results.append(cleaned_data)
            else:
                cleaning_results.append(file_info)  # Pass through files with errors
        
        return jsonify({"results": cleaning_results})
    except Exception as e:
        logging.error(f"Error during data cleaning: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error during data cleaning: {str(e)}"}), 500

@app.route('/process_csv', methods=['POST'])
def process_csv():
    """Legacy endpoint that shows a helpful error message."""
    return jsonify({
        "error": "Direct file uploads are disabled due to disk quota issues. Please use the new client-side approach.",
        "solution": "Use /process_csv_direct endpoint with base64-encoded content instead of multipart form uploads."
    }), 400

# Cloud storage integration routes
@app.route('/cloud/auth', methods=['GET', 'POST'])
def cloud_auth():
    """Initiate authentication with cloud storage providers."""
    if request.method == 'POST':
        try:
            provider = request.json.get('provider')
            
            if not provider:
                return jsonify({"error": "Cloud provider not specified"}), 400
            
            # Get cloud service instance
            cloud_service = get_cloud_service(provider)
            
            # Start authentication flow
            auth_result = cloud_service.authenticate()
            
            return jsonify(auth_result)
            
        except Exception as e:
            logging.error(f"Error initiating cloud auth: {str(e)}")
            import traceback
            logging.error(traceback.format_exc())
            return jsonify({"error": f"Error initiating cloud auth: {str(e)}"}), 500
    else:
        # Render cloud auth page for GET requests
        return render_template('cloud_auth.html')


@app.route('/cloud/auth/status', methods=['GET'])
def cloud_auth_status():
    """Check authentication status for cloud providers."""
    try:
        # Check Google auth status
        google_service = get_cloud_service('google')
        google_authenticated = google_service.authenticated
        
        # Check Microsoft auth status
        ms_service = get_cloud_service('microsoft')
        ms_authenticated = ms_service.authenticated
        
        return jsonify({
            'google_authenticated': google_authenticated,
            'microsoft_authenticated': ms_authenticated
        })
        
    except Exception as e:
        logging.error(f"Error checking cloud auth status: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({
            'google_authenticated': False,
            'microsoft_authenticated': False,
            'error': str(e)
        }), 500


@app.route('/cloud/auth/callback', methods=['POST'])
def cloud_auth_callback():
    """Handle OAuth callback from cloud providers."""
    try:
        provider = request.json.get('provider')
        auth_code = request.json.get('auth_code')
        
        if not provider or not auth_code:
            return jsonify({"error": "Missing provider or auth code"}), 400
        
        # Get cloud service instance
        cloud_service = get_cloud_service(provider)
        
        # Exchange auth code for tokens
        auth_result = cloud_service.exchange_auth_code(auth_code)
        
        # Store auth state in session
        session['cloud_auth'] = {
            'provider': provider,
            'authenticated': auth_result.get('authenticated', False)
        }
        
        return jsonify(auth_result)
        
    except Exception as e:
        logging.error(f"Error in OAuth callback: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error in OAuth callback: {str(e)}"}), 500


@app.route('/cloud/list_files', methods=['GET', 'POST'])
def cloud_list_files():
    """List files from cloud storage."""
    try:
        if request.method == 'POST':
            provider = request.json.get('provider')
            folder_id = request.json.get('folder_id')
            file_types = request.json.get('file_types', ['csv', 'txt'])
        else:
            provider = request.args.get('provider')
            folder_id = request.args.get('folder_id')
            file_types_str = request.args.get('file_types', 'csv,txt')
            file_types = file_types_str.split(',') if file_types_str else ['csv', 'txt']
        
        if not provider:
            return jsonify({"error": "Cloud provider not specified"}), 400
        
        # Get cloud service instance
        cloud_service = get_cloud_service(provider)
        
        # Try to authenticate if not already
        if not cloud_service.authenticated:
            auth_result = cloud_service.authenticate()
            if not auth_result.get('authenticated', False) and auth_result.get('requires_auth', False):
                return jsonify(auth_result), 401
        
        # List files
        files = cloud_service.list_files(folder_id, file_types)
        
        return jsonify({"files": files})
        
    except Exception as e:
        logging.error(f"Error listing cloud files: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error listing cloud files: {str(e)}"}), 500


@app.route('/process_cloud_folder', methods=['POST'])
def process_cloud_folder():
    """Process a shared folder or file link from Google Drive, OneDrive, or SharePoint."""
    try:
        provider = request.json.get('provider')
        cloud_link = request.json.get('folder_link')
        
        if not provider or not cloud_link:
            return jsonify({"error": "Missing provider or cloud link"}), 400
        
        # Determine if this is a file or folder link
        is_file = False
        resource_id = None
        
        # Process based on provider
        if provider == 'google':
            # Handle Google Drive links
            if 'folders/' in cloud_link:
                # Extract Google Drive folder ID
                match = re.search(r'folders/([a-zA-Z0-9_-]+)', cloud_link)
                if match:
                    resource_id = match.group(1)
                    is_file = False
                else:
                    return jsonify({"error": "Invalid Google Drive folder link format"}), 400
            elif 'file/d/' in cloud_link:
                # Extract Google Drive file ID
                match = re.search(r'file/d/([a-zA-Z0-9_-]+)', cloud_link)
                if match:
                    resource_id = match.group(1)
                    is_file = True
                else:
                    return jsonify({"error": "Invalid Google Drive file link format"}), 400
            else:
                return jsonify({"error": "Unsupported Google Drive link format"}), 400
                
        elif provider == 'microsoft':
            # Handle OneDrive/SharePoint links
            if '1drv.ms' in cloud_link:
                # OneDrive short link format (1drv.ms)
                logging.info(f"Processing OneDrive short link: {cloud_link}")
                
                # Handle different short link formats
                if '1drv.ms/f/' in cloud_link:
                    # OneDrive folder short link (old format)
                    resource_id = cloud_link
                    is_file = False
                elif '1drv.ms/u/' in cloud_link:
                    # OneDrive file short link (old format)
                    resource_id = cloud_link
                    is_file = True
                elif '1drv.ms/x/s!' in cloud_link or '1drv.ms/b/s!' in cloud_link:
                    # Excel or generic file format with s! pattern
                    resource_id = cloud_link
                    is_file = True
                    logging.info("Detected OneDrive Excel file short link")
                elif '1drv.ms/f/s!' in cloud_link:
                    # Folder format with s! pattern
                    resource_id = cloud_link
                    is_file = False
                    logging.info("Detected OneDrive folder short link with s! pattern")
                else:
                    # For any other 1drv.ms links, check for file extensions in the URL
                    file_ext_match = re.search(r'[^/]+\.(csv|txt|xlsx|xls|docx|pdf)(?:\?|$)', cloud_link)
                    if file_ext_match:
                        resource_id = cloud_link
                        is_file = True
                        logging.info(f"Detected OneDrive file with extension: {file_ext_match.group(1)}")
                    else:
                        # Default assumption for unrecognized 1drv.ms links is a folder
                        resource_id = cloud_link
                        is_file = False
                        logging.info("Unrecognized OneDrive short link, treating as folder")
            elif 'sharepoint.com' in cloud_link:
                # SharePoint link, need to extract the site and drive
                resource_id = cloud_link
                # Determine if this is a file or folder based on URL pattern
                if re.search(r'\.(csv|txt|xlsx|xls)(?:\?|$)', cloud_link, re.IGNORECASE):
                    is_file = True
                else:
                    is_file = False
            else:
                # Standard OneDrive link
                resource_id = cloud_link
                # Determine if this is a file or folder based on URL pattern
                if '/view.aspx?' in cloud_link or '/viewid=' in cloud_link:
                    is_file = True
                elif re.search(r'\.(csv|txt|xlsx|xls)(?:\?|$)', cloud_link, re.IGNORECASE):
                    is_file = True
                else:
                    is_file = False
        else:
            return jsonify({"error": f"Unsupported cloud provider: {provider}"}), 400
            
        # Get cloud service instance
        cloud_service = get_cloud_service(provider)
        
        # Try to authenticate if not already
        if not cloud_service.authenticated:
            auth_result = cloud_service.authenticate()
            if not auth_result.get('authenticated', False) and auth_result.get('requires_auth', False):
                return jsonify({
                    "error": "Authentication required",
                    "auth_url": auth_result.get('auth_url'),
                    "requires_auth": True,
                    "provider": provider
                }), 401
        
        # Process based on type
        if is_file:
            # Download and process individual file
            logging.info(f"Processing single file with ID: {resource_id}")
            temp_file_path, file_name = cloud_service.download_file(resource_id)
            
            # Check if the file was downloaded successfully
            if not temp_file_path or not os.path.exists(temp_file_path):
                return jsonify({"error": f"Failed to download file from {provider}"}), 500
                
            # Process the downloaded file
            encodings_to_try = ['utf-8', 'latin-1', 'utf-16', 'cp1252', 'iso-8859-1']
            content = None
            
            for encoding in encodings_to_try:
                try:
                    with open(temp_file_path, 'r', encoding=encoding) as f:
                        content = f.read()
                    break
                except UnicodeDecodeError:
                    continue
            
            if content is None:
                return jsonify({"error": f"Could not decode file {file_name} with any supported encoding"}), 400
                
            # Clean up temp file
            try:
                os.remove(temp_file_path)
            except:
                logging.warning(f"Could not remove temporary file {temp_file_path}")
                
            # Process the file content
            processed_data = process_csv_data(content)
            
            return jsonify({
                "resource_type": "file",
                "provider": provider,
                "file_name": file_name,
                "processed_data": processed_data,
                "success": True
            })
            
        else:
            # Process folder contents
            logging.info(f"Processing folder with ID: {resource_id}")
            
            # List files in the folder
            files = cloud_service.list_files(resource_id, file_types=['csv', 'txt', 'xlsx', 'xls'])
            
            # Filter out non-CSV files for now
            csv_files = [f for f in files if f['name'].lower().endswith(('.csv', '.txt'))]
            
            if not csv_files:
                return jsonify({
                    "resource_type": "folder",
                    "provider": provider,
                    "error": "No CSV or text files found in the folder",
                    "available_files": [f['name'] for f in files],
                    "success": False
                }), 400
                
            # Just return the file list for now
            return jsonify({
                "resource_type": "folder",
                "provider": provider,
                "files": csv_files,
                "success": True
            })
            
    except Exception as e:
        logging.error(f"Error processing cloud folder: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({
            "error": f"Error processing cloud folder: {str(e)}",
            "provider": request.json.get('provider', 'unknown'),
            "success": False
        }), 500


@app.route('/cloud/download_file', methods=['POST'])
def cloud_download_file():
    """Download a file from cloud storage and process it."""
    try:
        provider = request.json.get('provider')
        file_id = request.json.get('file_id')
        
        if not provider or not file_id:
            return jsonify({"error": "Missing provider or file ID"}), 400
            
        # Get cloud service instance
        cloud_service = get_cloud_service(provider)
        
        # Try to authenticate if not already
        if not cloud_service.authenticated:
            auth_result = cloud_service.authenticate()
            if not auth_result.get('authenticated', False) and auth_result.get('requires_auth', False):
                return jsonify({
                    "error": "Authentication required",
                    "auth_url": auth_result.get('auth_url'),
                    "requires_auth": True,
                    "provider": provider
                }), 401
                
        # Download the file
        temp_file_path, file_name = cloud_service.download_file(file_id)
        
        # Check if the file was downloaded successfully
        if not temp_file_path or not os.path.exists(temp_file_path):
            return jsonify({"error": f"Failed to download file from {provider}"}), 500
            
        # Process the downloaded file
        encodings_to_try = ['utf-8', 'latin-1', 'utf-16', 'cp1252', 'iso-8859-1']
        content = None
        
        for encoding in encodings_to_try:
            try:
                with open(temp_file_path, 'r', encoding=encoding) as f:
                    content = f.read()
                break
            except UnicodeDecodeError:
                continue
        
        if content is None:
            return jsonify({"error": f"Could not decode file {file_name} with any supported encoding"}), 400
            
        # Clean up temp file
        try:
            os.remove(temp_file_path)
        except:
            logging.warning(f"Could not remove temporary file {temp_file_path}")
            
        # Process the file content
        processed_data = process_csv_data(content)
        
        return jsonify({
            "file_name": file_name,
            "processed_data": processed_data,
            "success": True
        })
        
    except Exception as e:
        logging.error(f"Error downloading file: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error downloading file: {str(e)}"}), 500


@app.route('/cloud/save_credentials', methods=['POST'])
def cloud_save_credentials():
    """Save OAuth credentials for cloud storage providers."""
    try:
        provider = request.json.get('provider')
        client_id = request.json.get('client_id')
        client_secret = request.json.get('client_secret')
        redirect_uri = request.json.get('redirect_uri')
        tenant_id = request.json.get('tenant_id')
        
        if not provider or not client_id or not client_secret:
            return jsonify({"error": "Missing required credentials"}), 400
            
        # Save credentials
        success = save_oauth_credentials(provider, client_id, client_secret, redirect_uri, tenant_id)
        
        if success:
            return jsonify({"success": True, "message": f"Credentials for {provider} saved successfully"})
        else:
            return jsonify({"error": f"Failed to save {provider} credentials"}), 500
            
    except Exception as e:
        logging.error(f"Error saving credentials: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error saving credentials: {str(e)}"}), 500


@app.route('/generate_demo_data', methods=['GET'])
def generate_demo_trajectory_data():
    """Generate demo trajectory data for visualization."""
    import random
    import math
    
    pattern = request.args.get('pattern', 'figure8')
    num_points = int(request.args.get('points', 100))
    
    points = []
    
    # Base values
    alt_base = 100
    alt_range = 50
    time_step = 0.5
    
    if pattern == 'figure8':
        # Generate a figure-8 pattern
        for i in range(num_points):
            t = i / num_points * 2 * math.pi
            
            # Figure 8 parametric equations
            x = 50 * math.sin(t)
            y = 50 * math.sin(t) * math.cos(t)
            
            # Add some noise
            x += random.uniform(-2, 2)
            y += random.uniform(-2, 2)
            
            # Altitude varies sinusoidally
            altitude = alt_base + alt_range * math.sin(3 * t)
            
            points.append({
                'north': x,
                'east': y,
                'altitude': altitude,
                'time': i * time_step
            })
            
    elif pattern == 'spiral':
        # Generate a spiral pattern
        for i in range(num_points):
            t = i / num_points * 6 * math.pi
            
            # Spiral equations
            radius = 5 + t * 5
            x = radius * math.cos(t)
            y = radius * math.sin(t)
            
            # Add some noise
            x += random.uniform(-1, 1)
            y += random.uniform(-1, 1)
            
            # Altitude increases with time
            altitude = alt_base + t * 5
            
            points.append({
                'north': x,
                'east': y,
                'altitude': altitude,
                'time': i * time_step
            })
            
    else:  # Random path
        # Generate a random path
        x, y = 0, 0
        for i in range(num_points):
            # Random walk with momentum
            dx = random.uniform(-5, 5)
            dy = random.uniform(-5, 5)
            
            x += dx
            y += dy
            
            # Altitude varies randomly but smoothly
            altitude = alt_base + random.uniform(-alt_range/2, alt_range/2)
            
            points.append({
                'north': x,
                'east': y,
                'altitude': altitude,
                'time': i * time_step
            })
    
    # Return formatted data
    return jsonify({
        'data': points,
        'pattern': pattern,
        'metadata': {
            'points_count': len(points),
            'duration_seconds': (num_points - 1) * time_step
        }
    })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=True)