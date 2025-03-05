import os
import logging
import tempfile
from flask import Flask, render_template, request, jsonify
from utils.data_processor import process_csv_data

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default_secret_key_for_development")

# Configure Flask for file uploads
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max upload size

@app.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html')

@app.route('/process_csv', methods=['POST'])
def process_csv():
    """Process uploaded CSV file and return processed data."""
    try:
        if 'file' not in request.files:
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
        
        # Accept more file extensions to improve compatibility
        valid_extensions = ('.csv', '.txt', '.data', '.dat', '.tsv', '.tab', '.log', '.xls', '.xlsx')
        
        if file and (file.filename.lower().endswith(valid_extensions) or '.' not in file.filename):
            # Save the file temporarily for more robust processing
            temp_file_path = None
            
            try:
                # First try with UTF-8 encoding which is most common
                logging.info(f"Processing file {file.filename}")
                file_content = file.read()
                
                # Try decoding with various encodings in order of likelihood
                encodings_to_try = ['utf-8', 'latin-1', 'cp1252', 'iso-8859-1', 'utf-16']
                decoded_content = None
                
                for encoding in encodings_to_try:
                    try:
                        decoded_content = file_content.decode(encoding)
                        logging.info(f"Successfully decoded file {file.filename} with {encoding} encoding")
                        break
                    except UnicodeDecodeError:
                        continue
                
                if decoded_content is None:
                    # If all encodings fail, use latin-1 as a fallback that should never fail
                    logging.warning(f"All encodings failed for {file.filename}, using latin-1 as binary fallback")
                    decoded_content = file_content.decode('latin-1', errors='replace')
                
                # Process the CSV data
                processed_data = process_csv_data(decoded_content)
                
                if 'error' in processed_data:
                    logging.error(f"Error in process_csv_data: {processed_data['error']}")
                    if 'message' in processed_data:
                        logging.error(f"Error message: {processed_data['message']}")
                    
                    # If there's an error in processing, try with file path approach for large files
                    import tempfile
                    import os
                    
                    logging.info(f"Trying alternative processing approach for {file.filename}")
                    
                    # Create a temporary file
                    temp_fd, temp_file_path = tempfile.mkstemp(suffix='.csv')
                    os.close(temp_fd)
                    
                    # Save the content to the temporary file
                    with open(temp_file_path, 'wb') as f:
                        file.seek(0)
                        f.write(file.read())
                    
                    # Try processing with the file path approach
                    processed_data = process_csv_data(temp_file_path, use_file_path=True)
                else:
                    logging.info(f"Successfully processed file {file.filename} with {processed_data.get('metadata', {}).get('points_count', 0)} points")
                
                return jsonify(processed_data)
            
            except Exception as e:
                logging.error(f"Error processing file: {str(e)}")
                import traceback
                logging.error(traceback.format_exc())
                
                # Try one more fallback method using file path
                try:
                    if temp_file_path is None:
                        import tempfile
                        import os
                        
                        # Create a temporary file
                        temp_fd, temp_file_path = tempfile.mkstemp(suffix='.csv')
                        os.close(temp_fd)
                        
                        # Save the content to the temporary file
                        with open(temp_file_path, 'wb') as f:
                            file.seek(0)
                            f.write(file.read())
                    
                    # Try processing with pandas direct file reading with guessed encoding
                    logging.info(f"Using final fallback method for {file.filename}")
                    processed_data = process_csv_data(temp_file_path, use_file_path=True, is_large_file=True)
                    
                    if 'error' not in processed_data:
                        logging.info(f"Successfully processed file {file.filename} with fallback method")
                        return jsonify(processed_data)
                    else:
                        return jsonify({"error": f"Failed to process file after multiple attempts: {processed_data.get('message', 'Unknown error')}"}), 400
                
                except Exception as fallback_error:
                    logging.error(f"Fallback processing failed: {str(fallback_error)}")
                    return jsonify({"error": f"Error processing file: {str(e)}. Fallback also failed: {str(fallback_error)}"}), 500
                
                finally:
                    # Clean up temporary file if it exists
                    if temp_file_path and os.path.exists(temp_file_path):
                        try:
                            os.remove(temp_file_path)
                        except:
                            pass
            
            finally:
                # Clean up temporary file if it exists
                if temp_file_path:
                    import os
                    if os.path.exists(temp_file_path):
                        try:
                            os.remove(temp_file_path)
                        except:
                            pass
        else:
            return jsonify({"error": f"File type not supported. Please upload a supported file type ({', '.join(valid_extensions)})."}), 400
    
    except Exception as e:
        logging.error(f"Unexpected error in process_csv route: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Server error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)