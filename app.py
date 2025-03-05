import os
import logging
import tempfile
import time
import uuid
from werkzeug.middleware.proxy_fix import ProxyFix
from flask import Flask, render_template, request, jsonify, session, Response, stream_with_context
from utils.data_processor import process_csv_data
from utils.data_cleaner import analyze_csv_file, apply_cleaning_operations

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
            
        # Ensure sample_rate is properly handled (default to 1 if not provided)
        if 'sample_rate' not in config:
            config['sample_rate'] = 1
        else:
            # Ensure sample_rate is an integer and at least 1
            try:
                config['sample_rate'] = max(1, int(config['sample_rate']))
            except (ValueError, TypeError):
                config['sample_rate'] = 1
                logging.warning("Invalid sample_rate value, defaulting to 1")
        
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
                        
                        # Get sample rate from the config (default to 50 if not provided)
                        sample_rate = int(config.get('sample_rate', 50))
                        logging.info(f"Using sample rate of 1/{sample_rate} datapoints for cleaning")
                        
                        # Apply cleaning operations with temp file info and sample rate
                        cleaned_data = apply_cleaning_operations(file_info, config, use_temp_file=True)
                        
                        # Pass the sample rate to the data processor after cleaning
                        if 'sample_rate' not in config:
                            config['sample_rate'] = sample_rate
                    else:
                        # For smaller files, read the whole content and process normally
                        with open(temp_filepath, 'r', encoding=encoding) as f:
                            file_content = f.read()
                            file_info['content'] = file_content
                            
                            # Get sample rate from the config (default to 50 if not provided)
                            sample_rate = int(config.get('sample_rate', 50))
                            logging.info(f"Using sample rate of 1/{sample_rate} datapoints for cleaning")
                            
                            # Pass the sample rate to the config
                            if 'sample_rate' not in config:
                                config['sample_rate'] = sample_rate
                                
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
                # Get sample rate from request (default to 50 if not provided)
                sample_rate = int(request.form.get('sample_rate', 50))
                logging.info(f"Using sample rate of 1/{sample_rate} datapoints")
                
                if is_large_file:
                    # For large files, use a chunked processing approach via the data processor
                    logging.info(f"Processing large file with chunked approach and {successful_encoding} encoding")
                    processed_data = process_csv_data(temp_filepath, file_encoding=successful_encoding, 
                                                     use_file_path=True, is_large_file=True,
                                                     sample_rate=sample_rate)
                else:
                    # For smaller files, read the content and process normally
                    with open(temp_filepath, 'r', encoding=successful_encoding) as f:
                        file_content = f.read()
                    processed_data = process_csv_data(file_content, sample_rate=sample_rate)
                
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

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
