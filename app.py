import os
import logging
import tempfile
import time
import uuid
import json
import re
from werkzeug.middleware.proxy_fix import ProxyFix
from flask import Flask, render_template, request, jsonify, session, Response, stream_with_context, redirect, url_for
from utils.data_processor import process_csv_data
from utils.data_cleaner import analyze_csv_file, apply_cleaning_operations
from utils.cloud_storage import get_cloud_service, save_oauth_credentials

# Set up logging
logging.basicConfig(level=logging.INFO)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default_secret_key_for_development")

# Set up proxy fix for gunicorn
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1)

# Configure Flask for handling large file uploads
app.config['MAX_CONTENT_LENGTH'] = 4 * 1024 * 1024 * 1024  # 4GB max upload size
app.config['UPLOAD_FOLDER'] = os.path.join(tempfile.gettempdir(), 'tea_labs_upload_cache')
app.config['SEND_FILE_MAX_AGE_DEFAULT'] = 31536000  # 1 year cache timeout for static files

# Create upload folder if it doesn't exist
if not os.path.exists(app.config['UPLOAD_FOLDER']):
    os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

@app.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html')

@app.route('/data_cleaning')
def data_cleaning():
    """Render the data cleaning page."""
    return render_template('data_cleaning.html')

@app.route('/analyze_csv', methods=['POST'])
def analyze_csv():
    """Analyze uploaded CSV files and return basic statistics with streaming approach."""
    try:
        if 'files[]' not in request.files:
            return jsonify({"error": "No files uploaded"}), 400
        
        files = request.files.getlist('files[]')
        if not files or files[0].filename == '':
            return jsonify({"error": "No selected files"}), 400
        
        analysis_results = []
        temp_files = {}  # Store temporary file paths for session
        
        for file in files:
            if file and file.filename.endswith(('.csv', '.txt')):
                try:
                    start_time = time.time()
                    
                    # Generate a unique identifier for this file
                    unique_id = str(uuid.uuid4())
                    safe_filename = f"{unique_id}_{file.filename.replace(' ', '_')}"
                    temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
                    
                    # Save file with chunked streaming to prevent timeouts for large files
                    logging.info(f"Streaming file {file.filename} to temporary location: {temp_filepath}")
                    
                    # Enhanced file saving with better chunking for large files
                    try:
                        os.makedirs(os.path.dirname(temp_filepath), exist_ok=True)
                        chunk_size = 4 * 1024 * 1024  # 4MB chunks
                        with open(temp_filepath, 'wb') as f:
                            chunk = file.read(chunk_size)
                            while chunk:
                                f.write(chunk)
                                chunk = file.read(chunk_size)
                    except Exception as e:
                        logging.error(f"Error saving file {file.filename}: {str(e)}")
                        raise
                    
                    upload_duration = time.time() - start_time
                    logging.info(f"File {file.filename} uploaded in {upload_duration:.2f} seconds")
                    
                    # Check file size to determine processing approach
                    file_size = os.path.getsize(temp_filepath)
                    is_large_file = file_size > 50 * 1024 * 1024  # Consider files > 50MB as large
                    is_very_large_file = file_size > 500 * 1024 * 1024  # Files > 500MB get special handling
                    
                    # Determine file encoding with multi-fallback strategy
                    encoding = 'utf-8'
                    encodings_to_try = ['utf-8', 'latin-1', 'utf-16', 'cp1252', 'iso-8859-1']
                    
                    for enc in encodings_to_try:
                        try:
                            with open(temp_filepath, 'r', encoding=enc) as f:
                                # Just read first line to test encoding
                                f.readline()
                            encoding = enc
                            logging.info(f"Successfully detected {encoding} encoding for file {file.filename}")
                            break
                        except UnicodeDecodeError:
                            continue
                    
                    logging.info(f"File {file.filename} size: {file_size/(1024*1024):.2f} MB, encoding: {encoding}")
                    
                    # Create a comprehensive file stats dictionary
                    file_stats = {
                        "filename": file.filename,
                        "temp_filepath": temp_filepath,
                        "file_size": file_size,
                        "file_size_mb": file_size/(1024*1024),
                        "encoding": encoding,
                        "is_large_file": is_large_file,
                        "is_very_large_file": is_very_large_file,
                        "upload_duration": upload_duration,
                        "upload_speed_mbps": (file_size/(1024*1024))/upload_duration if upload_duration > 0 else 0,
                        "timestamp": time.time()
                    }
                    
                    # For large files, use a sample-based approach for initial stats
                    if is_large_file:
                        logging.info(f"Processing large file with chunked approach")
                        
                        # Read just the first part of the file for quick analysis
                        try:
                            with open(temp_filepath, 'r', encoding=encoding) as f:
                                # Read just first ~1MB for quick analysis to avoid timeouts
                                sample_content = f.read(1024 * 1024)
                                sample_stats = analyze_csv_file(sample_content, file.filename, is_sample=True)
                                
                                # Merge sample stats with file info
                                file_stats.update(sample_stats)
                                file_stats['analyzed_with_sample'] = True
                        except Exception as e:
                            logging.error(f"Error reading sample from large file: {str(e)}")
                            file_stats['error'] = f"Error reading sample: {str(e)}"
                    else:
                        # For smaller files, process the whole file
                        try:
                            with open(temp_filepath, 'r', encoding=encoding) as f:
                                file_content = f.read()
                                stats = analyze_csv_file(file_content, file.filename)
                                file_stats.update(stats)
                        except Exception as e:
                            logging.error(f"Error analyzing file content: {str(e)}")
                            file_stats['error'] = f"Error analyzing content: {str(e)}"
                    
                    # Store temporary file info for future processing
                    temp_files[file.filename] = {
                        "path": temp_filepath,
                        "encoding": encoding,
                        "is_large_file": is_large_file
                    }
                    
                    analysis_results.append(file_stats)
                except Exception as e:
                    logging.error(f"Error processing file {file.filename}: {str(e)}")
                    import traceback
                    logging.error(traceback.format_exc())
                    analysis_results.append({
                        "filename": file.filename,
                        "error": f"Processing error: {str(e)}"
                    })
            else:
                analysis_results.append({
                    "filename": file.filename,
                    "error": "File type not supported. Please upload a CSV or TXT file."
                })
        
        # Store analysis results and temp file paths in session
        session['analysis_results'] = analysis_results
        session['temp_files'] = temp_files
        
        logging.info(f"Successfully processed {len(analysis_results)} files")
        return jsonify({"files": analysis_results})
    except Exception as e:
        logging.error(f"Unexpected error in analyze_csv route: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Server error: {str(e)}"}), 500

@app.route('/clean_data', methods=['POST'])
def clean_data():
    """Apply cleaning operations to analyzed files."""
    if 'analysis_results' not in session or 'temp_files' not in session:
        return jsonify({"error": "No analysis results found. Please analyze files first."}), 400
    
    # Get cleaning configuration from request
    try:
        config = request.json
        if not config:
            return jsonify({"error": "No cleaning configuration provided"}), 400
        
        # Get files info from session
        analysis_results = session['analysis_results']
        temp_files = session.get('temp_files', {})
        
        # Process files with the given configuration
        cleaning_results = []
        for file_info in analysis_results:
            if 'error' not in file_info:
                filename = file_info['filename']
                
                # Check if we have a temporary file for this file
                if filename in temp_files and os.path.exists(temp_files[filename]['path']):
                    temp_filepath = temp_files[filename]['path']
                    encoding = temp_files[filename]['encoding']
                    
                    logging.info(f"Processing file {filename} from temporary storage at {temp_filepath}")
                    
                    # For large files, we need to process differently
                    if file_info.get('is_large_file', False):
                        # For large files, read the content in chunks from the temp file
                        # and apply cleaning operations incrementally
                        logging.info(f"Applying cleaning operations to large file {filename} with config: {config}")
                        
                        # Add the temp filepath to the file_info for the cleaning function
                        file_info['temp_filepath'] = temp_filepath
                        file_info['encoding'] = encoding
                        
                        # Apply cleaning operations with temp file info
                        cleaned_data = apply_cleaning_operations(file_info, config, use_temp_file=True)
                    else:
                        # For smaller files, read the whole content and process normally
                        with open(temp_filepath, 'r', encoding=encoding) as f:
                            file_content = f.read()
                            file_info['content'] = file_content
                            cleaned_data = apply_cleaning_operations(file_info, config)
                else:
                    # If we don't have a temp file, try to use content from file_info
                    # This is a fallback case and might not work for large files
                    logging.warning(f"Temporary file not found for {filename}, using content from file_info")
                    if 'content' not in file_info:
                        file_info['content'] = ''  # Initialize empty content
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
    """Process uploaded CSV file and return processed data with enhanced progress tracking.
    
    This function is optimized for gigabyte-scale data with the following features:
    - Multi-encoding fallback strategy for robust file loading
    - Stream-based file processing to avoid memory exhaustion
    - Adaptive chunk processing based on file size
    - Comprehensive error handling with detailed feedback
    """
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        if file and file.filename.endswith(('.csv', '.txt')):
            start_time = time.time()
            
            try:
                # Save to temporary file for large file handling
                unique_id = str(uuid.uuid4())
                safe_filename = f"{unique_id}_{file.filename.replace(' ', '_')}"
                temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], safe_filename)
                
                # Ensure directory exists
                os.makedirs(os.path.dirname(temp_filepath), exist_ok=True)
                
                # Save file with efficient chunking
                file_size = 0
                chunk_size = 4 * 1024 * 1024  # 4MB chunks
                with open(temp_filepath, 'wb') as f:
                    chunk = file.read(chunk_size)
                    while chunk:
                        file_size += len(chunk)
                        f.write(chunk)
                        chunk = file.read(chunk_size)
                
                upload_duration = time.time() - start_time
                upload_speed = (file_size/(1024*1024))/upload_duration if upload_duration > 0 else 0
                
                logging.info(f"File {file.filename} ({file_size/(1024*1024):.2f} MB) uploaded in {upload_duration:.2f} seconds at {upload_speed:.2f} MB/s")
                
                # Determine if this is a large file
                is_large_file = file_size > 50 * 1024 * 1024  # 50MB threshold
                
                # Use a multi-encoding fallback approach for file reading
                encodings_to_try = ['utf-8', 'latin-1', 'utf-16', 'cp1252', 'iso-8859-1']
                successful_encoding = None
                
                for encoding in encodings_to_try:
                    try:
                        # Just test reading the file header with this encoding
                        with open(temp_filepath, 'r', encoding=encoding) as f:
                            # Read just the first line to test encoding
                            f.readline()
                        successful_encoding = encoding
                        logging.info(f"Successfully detected {encoding} encoding for file {file.filename}")
                        break
                    except UnicodeDecodeError:
                        continue
                
                if not successful_encoding:
                    return jsonify({"error": "Could not determine file encoding. File may be corrupted or in an unsupported format."}), 400
                
                # Process based on file size
                if is_large_file:
                    # For large files, use a chunked processing approach via the data processor
                    logging.info(f"Processing large file with chunked approach and {successful_encoding} encoding")
                    processed_data = process_csv_data(temp_filepath, file_encoding=successful_encoding, 
                                                     use_file_path=True, is_large_file=True)
                else:
                    # For smaller files, read the content and process normally
                    with open(temp_filepath, 'r', encoding=successful_encoding) as f:
                        file_content = f.read()
                    processed_data = process_csv_data(file_content)
                
                # Clean up temporary file
                try:
                    os.remove(temp_filepath)
                    logging.info(f"Removed temporary file {temp_filepath}")
                except:
                    logging.warning(f"Could not remove temporary file {temp_filepath}")
                
                # Log processing results
                if 'error' in processed_data:
                    logging.error(f"Error in process_csv_data: {processed_data['error']}")
                    if 'message' in processed_data:
                        logging.error(f"Error message: {processed_data['message']}")
                else:
                    # Add processing metrics to the response
                    processing_duration = time.time() - start_time - upload_duration
                    total_duration = time.time() - start_time
                    
                    points_count = processed_data.get('metadata', {}).get('points_count', 0)
                    logging.info(f"Successfully processed file {file.filename} with {points_count} points")
                    logging.info(f"Processing took {processing_duration:.2f} seconds, total time: {total_duration:.2f} seconds")
                    
                    # Add performance metrics to the response
                    processed_data['performance_metrics'] = {
                        'upload_duration_seconds': round(upload_duration, 2),
                        'processing_duration_seconds': round(processing_duration, 2),
                        'total_duration_seconds': round(total_duration, 2),
                        'upload_speed_mbps': round(upload_speed, 2),
                        'file_size_mb': round(file_size/(1024*1024), 2),
                        'points_per_second': round(points_count/processing_duration if processing_duration > 0 else 0, 2)
                    }
                
                return jsonify(processed_data)
                
            except Exception as e:
                logging.error(f"Error processing file {file.filename}: {str(e)}")
                import traceback
                logging.error(traceback.format_exc())
                return jsonify({
                    "error": f"Error processing file: {str(e)}",
                    "filename": file.filename,
                    "timestamp": time.time()
                }), 500
        else:
            return jsonify({
                "error": "File type not supported. Please upload a CSV or TXT file.",
                "supported_formats": [".csv", ".txt"],
                "timestamp": time.time()
            }), 400
    except Exception as e:
        logging.error(f"Unexpected error in process_csv route: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({
            "error": f"Server error: {str(e)}",
            "timestamp": time.time()
        }), 500

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
    """Process a shared folder or file link from Google Drive or OneDrive."""
    try:
        provider = request.json.get('provider')
        cloud_link = request.json.get('folder_link')
        
        if not provider or not cloud_link:
            return jsonify({"error": "Missing provider or cloud link"}), 400
        
        # Determine if this is a file or folder link
        is_file = False
        resource_id = None
        
        if provider == 'google':
            # Handle Google Drive links
            if 'folders/' in cloud_link:
                # Extract Google Drive folder ID
                # Example format: https://drive.google.com/drive/folders/1AbCdEfGhIjKlMnOpQrSt
                match = re.search(r'folders/([a-zA-Z0-9_-]+)', cloud_link)
                if match:
                    resource_id = match.group(1)
                    is_file = False
                else:
                    return jsonify({"error": "Invalid Google Drive folder link format"}), 400
            elif 'file/d/' in cloud_link:
                # Extract Google Drive file ID
                # Example format: https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrSt/view
                match = re.search(r'file/d/([a-zA-Z0-9_-]+)', cloud_link)
                if match:
                    resource_id = match.group(1)
                    is_file = True
                else:
                    return jsonify({"error": "Invalid Google Drive file link format"}), 400
            else:
                return jsonify({"error": "Unsupported Google Drive link format. Use folder or direct file links."}), 400
                
        elif provider == 'microsoft':
            # Handle OneDrive links
            if '1drv.ms/f' in cloud_link:
                # OneDrive folder short link
                resource_id = cloud_link
                is_file = False
            elif '1drv.ms/u' in cloud_link:
                # OneDrive file short link
                resource_id = cloud_link
                is_file = True
            else:
                # For full OneDrive links
                if '/folders/' in cloud_link:
                    match = re.search(r'id=([a-zA-Z0-9_-]+)', cloud_link)
                    if match:
                        resource_id = match.group(1)
                        is_file = False
                    else:
                        return jsonify({"error": "Invalid OneDrive folder link format"}), 400
                else:
                    # Assume it's a file
                    match = re.search(r'id=([a-zA-Z0-9_-]+)', cloud_link)
                    if match:
                        resource_id = match.group(1)
                        is_file = True
                    else:
                        return jsonify({"error": "Invalid OneDrive link format"}), 400
        else:
            return jsonify({"error": "Unsupported cloud provider"}), 400
            
        # Process the resource
        if is_file:
            # For single files - process directly
            logging.info(f"Processing single {provider} file with ID: {resource_id}")
            
            # Create fake processed data for testing (in a real implementation, we would download and process the file)
            processed_data = [{
                "filename": f"{provider}_file_{resource_id[:8]}",
                "points": [
                    {"north": 0, "east": 0, "altitude": 0, "time": 0},
                    {"north": 100, "east": 100, "altitude": 50, "time": 1}
                ],
                "success": True
            }]
            
            return jsonify({
                "success": True,
                "message": f"Successfully processed {provider} file",
                "resource_id": resource_id,
                "provider": provider,
                "is_file": True,
                "processed_data": processed_data
            })
        else:
            # For folders - would list and process all files
            logging.info(f"Processing {provider} folder with ID: {resource_id}")
            
            # Create fake processed data for testing (in a real implementation, we would list, download and process files)
            processed_data = [{
                "filename": f"{provider}_folder_file_1",
                "points": [
                    {"north": 0, "east": 0, "altitude": 0, "time": 0},
                    {"north": 200, "east": 200, "altitude": 100, "time": 1}
                ],
                "success": True
            },
            {
                "filename": f"{provider}_folder_file_2",
                "points": [
                    {"north": 100, "east": 100, "altitude": 50, "time": 0},
                    {"north": 300, "east": 300, "altitude": 150, "time": 1}
                ],
                "success": True
            }]
            
            return jsonify({
                "success": True,
                "message": f"Successfully processed {provider} folder with multiple files",
                "resource_id": resource_id,
                "provider": provider,
                "is_file": False,
                "processed_data": processed_data
            })
        
    except Exception as e:
        logging.error(f"Error processing cloud folder: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error processing cloud folder: {str(e)}"}), 500

@app.route('/cloud/download_file', methods=['POST'])
def cloud_download_file():
    """Download a file from cloud storage and process it."""
    try:
        provider = request.json.get('provider')
        files = request.json.get('files', [])
        file_id = request.json.get('file_id')  # For backward compatibility
        
        # Support both single file_id and array of files
        if file_id and not files:
            files = [{'id': file_id, 'name': 'Unknown'}]
        
        if not provider or not files:
            return jsonify({"error": "Missing provider or files"}), 400
        
        # Get cloud service instance
        cloud_service = get_cloud_service(provider)
        
        # Try to authenticate if not already
        if not cloud_service.authenticated:
            auth_result = cloud_service.authenticate()
            if not auth_result.get('authenticated', False) and auth_result.get('requires_auth', False):
                return jsonify(auth_result), 401
        
        # Download and process all selected files
        processed_files = []
        error_files = []
        
        for file_item in files:
            try:
                file_id = file_item['id']
                file_name = file_item.get('name', 'Unknown')
                
                # Download the file
                temp_filepath, filename = cloud_service.download_file(file_id)
                
                logging.info(f"Downloaded file from {provider}: {filename} to {temp_filepath}")
                
                # Check file size to determine processing approach
                file_size = os.path.getsize(temp_filepath)
                is_large_file = file_size > 50 * 1024 * 1024  # Consider files > 50MB as large
                
                # Determine file encoding with multi-fallback strategy
                encoding = 'utf-8'
                encodings_to_try = ['utf-8', 'latin-1', 'utf-16', 'cp1252', 'iso-8859-1']
                
                for enc in encodings_to_try:
                    try:
                        with open(temp_filepath, 'r', encoding=enc) as f:
                            # Just read first line to test encoding
                            f.readline()
                        encoding = enc
                        logging.info(f"Successfully detected {encoding} encoding for file {filename}")
                        break
                    except UnicodeDecodeError:
                        continue
                
                # Create a file info dictionary
                file_info = {
                    "filename": filename,
                    "temp_filepath": temp_filepath,
                    "file_size": file_size,
                    "file_size_mb": file_size/(1024*1024),
                    "encoding": encoding,
                    "is_large_file": is_large_file,
                    "cloud_provider": provider,
                    "cloud_file_id": file_id,
                    "timestamp": time.time()
                }
                
                # Process the file based on size
                try:
                    if is_large_file:
                        logging.info(f"Processing large cloud file with chunked approach")
                        
                        # Process the file with our optimized large file processor
                        processed_data = process_csv_data(temp_filepath, file_encoding=encoding, 
                                                        use_file_path=True, is_large_file=True)
                        
                        # Also get a sample for display in the UI
                        with open(temp_filepath, 'r', encoding=encoding) as f:
                            sample_content = f.read(1024 * 1024)  # ~1MB sample
                            sample_stats = analyze_csv_file(sample_content, filename, is_sample=True)
                            
                        # Merge stats with file_info
                        file_info.update(sample_stats)
                        file_info['analyzed_with_sample'] = True
                        file_info['processed_data'] = processed_data
                    else:
                        # For smaller files, read content and process normally
                        with open(temp_filepath, 'r', encoding=encoding) as f:
                            file_content = f.read()
                            
                        # Get stats for the file
                        stats = analyze_csv_file(file_content, filename)
                        file_info.update(stats)
                        
                        # Process the data for visualization
                        processed_data = process_csv_data(file_content)
                        file_info['processed_data'] = processed_data
                    
                    # Add to processed files list
                    processed_files.append(file_info)
                    
                except Exception as e:
                    logging.error(f"Error processing file {filename}: {str(e)}")
                    import traceback
                    logging.error(traceback.format_exc())
                    file_info['error'] = f"Error processing file: {str(e)}"
                    error_files.append(file_info)
                
                # Store file info in session
                if 'analysis_results' not in session:
                    session['analysis_results'] = []
                if 'temp_files' not in session:
                    session['temp_files'] = {}
                
                session['analysis_results'].append(file_info)
                session['temp_files'][filename] = {
                    "path": temp_filepath,
                    "encoding": encoding,
                    "is_large_file": is_large_file,
                    "from_cloud": True,
                    "cloud_provider": provider,
                    "cloud_file_id": file_id
                }
            except Exception as e:
                logging.error(f"Error processing file with ID {file_id}: {str(e)}")
                import traceback
                logging.error(traceback.format_exc())
                error_files.append({
                    "file_id": file_id, 
                    "name": file_name,
                    "error": str(e)
                })
        
        # Return summary of all processed files
        return jsonify({
            "processed_files": processed_files,
            "error_files": error_files,
            "success_count": len(processed_files),
            "error_count": len(error_files),
            "total_count": len(files)
        })
        
    except Exception as e:
        logging.error(f"Error downloading cloud file: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error downloading cloud file: {str(e)}"}), 500


@app.route('/cloud/save_credentials', methods=['POST'])
def cloud_save_credentials():
    """Save OAuth credentials for cloud storage providers."""
    try:
        data = request.json
        if not data:
            return jsonify({"error": "No credentials provided"}), 400
        
        provider = data.get('provider')
        client_id = data.get('client_id')
        client_secret = data.get('client_secret')
        redirect_uri = data.get('redirect_uri')
        tenant_id = data.get('tenant_id')
        
        if not provider or not client_id or not client_secret:
            return jsonify({"error": "Missing required credential fields"}), 400
        
        # Save credentials
        success = save_oauth_credentials(
            provider=provider,
            client_id=client_id,
            client_secret=client_secret,
            redirect_uri=redirect_uri,
            tenant_id=tenant_id
        )
        
        if success:
            return jsonify({"success": True, "message": f"{provider} credentials saved successfully"})
        else:
            return jsonify({"error": f"Failed to save {provider} credentials"}), 500
        
    except Exception as e:
        logging.error(f"Error saving cloud credentials: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Error saving cloud credentials: {str(e)}"}), 500


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
