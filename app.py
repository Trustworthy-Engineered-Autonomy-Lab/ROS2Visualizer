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
    """Analyze uploaded CSV files and return basic statistics."""
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
                    # For large files, save to a temporary file first to avoid memory issues
                    temp_filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"temp_{file.filename}")
                    file.save(temp_filepath)
                    logging.info(f"Saved file {file.filename} to temporary location: {temp_filepath}")
                    
                    # Check file size to determine approach
                    file_size = os.path.getsize(temp_filepath)
                    is_large_file = file_size > 50 * 1024 * 1024  # Consider files > 50MB as large
                    
                    if is_large_file:
                        logging.info(f"Processing large file {file.filename} ({file_size/(1024*1024):.2f} MB) with optimized approach")
                        
                        # For large files, read in chunks
                        # First, try to determine encoding
                        encoding = 'utf-8'
                        try:
                            with open(temp_filepath, 'r', encoding=encoding) as f:
                                # Just read first line to test encoding
                                f.readline()
                        except UnicodeDecodeError:
                            encoding = 'latin-1'
                            logging.info(f"Switching to {encoding} encoding for file {file.filename}")
                        
                        # Keep just the file reference and path for large files
                        # The actual processing will be done on-demand with chunking
                        file_stats = {
                            "filename": file.filename,
                            "temp_filepath": temp_filepath,
                            "file_size": file_size,
                            "file_size_mb": file_size/(1024*1024),
                            "encoding": encoding,
                            "is_large_file": True
                        }
                        
                        # Analyze just the first part of the file for immediate feedback
                        with open(temp_filepath, 'r', encoding=encoding) as f:
                            # Read just first ~1MB for quick analysis
                            sample_content = f.read(1024 * 1024)
                            sample_stats = analyze_csv_file(sample_content, file.filename, is_sample=True)
                            
                            # Merge sample stats with file info
                            file_stats.update(sample_stats)
                            
                        # Store the temporary file path in session
                        temp_files[file.filename] = {
                            "path": temp_filepath,
                            "encoding": encoding
                        }
                    else:
                        # For smaller files, process the whole file immediately
                        with open(temp_filepath, 'r', encoding='utf-8') as f:
                            try:
                                file_content = f.read()
                                file_stats = analyze_csv_file(file_content, file.filename)
                            except UnicodeDecodeError:
                                # Try with different encoding
                                with open(temp_filepath, 'r', encoding='latin-1') as f2:
                                    file_content = f2.read()
                                    file_stats = analyze_csv_file(file_content, file.filename)
                                    file_stats['note'] = 'File was decoded using latin-1 encoding'
                                    temp_files[file.filename] = {
                                        "path": temp_filepath,
                                        "encoding": 'latin-1'
                                    }
                            else:
                                temp_files[file.filename] = {
                                    "path": temp_filepath,
                                    "encoding": 'utf-8'
                                }
                                
                    analysis_results.append(file_stats)
                except Exception as e:
                    logging.error(f"Error analyzing file {file.filename}: {str(e)}")
                    import traceback
                    logging.error(traceback.format_exc())
                    analysis_results.append({
                        "filename": file.filename,
                        "error": f"Error analyzing file: {str(e)}"
                    })
            else:
                analysis_results.append({
                    "filename": file.filename,
                    "error": "File type not supported. Please upload a CSV or TXT file."
                })
        
        # Store analysis results and temp file paths in session
        session['analysis_results'] = analysis_results
        session['temp_files'] = temp_files
        
        logging.info(f"Successfully analyzed {len(analysis_results)} files")
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
    """Process uploaded CSV file and return processed data."""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        if file and file.filename.endswith(('.csv', '.txt')):
            try:
                # Read file content with UTF-8 encoding
                file_content = file.read().decode('utf-8')
                
                # Process the CSV data
                processed_data = process_csv_data(file_content)
                
                if 'error' in processed_data:
                    logging.error(f"Error in process_csv_data: {processed_data['error']}")
                    if 'message' in processed_data:
                        logging.error(f"Error message: {processed_data['message']}")
                else:
                    logging.info(f"Successfully processed file {file.filename} with {processed_data.get('metadata', {}).get('points_count', 0)} points")
                
                return jsonify(processed_data)
            except UnicodeDecodeError:
                # Try with different encoding if UTF-8 fails
                file.seek(0)
                try:
                    file_content = file.read().decode('latin-1')
                    processed_data = process_csv_data(file_content)
                    
                    if 'error' not in processed_data:
                        logging.info(f"Successfully processed file {file.filename} with latin-1 encoding")
                    
                    return jsonify(processed_data)
                except Exception as e:
                    logging.error(f"Error processing file with alternative encoding: {str(e)}")
                    import traceback
                    logging.error(traceback.format_exc())
                    return jsonify({"error": f"Encoding error: {str(e)}"}), 500
            except Exception as e:
                logging.error(f"Error processing file: {str(e)}")
                import traceback
                logging.error(traceback.format_exc())
                return jsonify({"error": f"Error processing file: {str(e)}"}), 500
        else:
            return jsonify({"error": "File type not supported. Please upload a CSV or TXT file."}), 400
    except Exception as e:
        logging.error(f"Unexpected error in process_csv route: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Server error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
