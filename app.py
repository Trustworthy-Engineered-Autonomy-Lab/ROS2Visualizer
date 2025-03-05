import os
import logging
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
        # Check if file was included in the request
        if 'file' not in request.files:
            logging.warning("No file part in the request")
            return jsonify({"error": "No file part"}), 400
        
        file = request.files['file']
        if file.filename == '':
            logging.warning("Empty filename submitted")
            return jsonify({"error": "No selected file"}), 400
        
        # Check file type
        if not file.filename.endswith(('.csv', '.txt')):
            logging.warning(f"Unsupported file type: {file.filename}")
            return jsonify({"error": "File type not supported. Please upload a CSV or TXT file."}), 400
        
        try:
            # Read file in chunks to avoid memory issues with large files
            logging.info(f"Starting to process {file.filename}")
            
            # First try UTF-8 encoding
            try:
                # For smaller files, read the whole content
                if file.content_length and file.content_length < 10 * 1024 * 1024:  # Less than 10MB
                    file_content = file.read().decode('utf-8')
                    processed_data = process_csv_data(file_content)
                else:
                    # For larger files, use the file path approach
                    # Save to a temporary file first
                    import tempfile
                    import os
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as temp:
                        file.save(temp.name)
                        temp_path = temp.name
                    
                    try:
                        # Process the file using the file path option
                        processed_data = process_csv_data("", use_file_path=True, file_encoding='utf-8', 
                                                        is_large_file=True, csv_content_path=temp_path)
                    finally:
                        # Always clean up the temporary file
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
                
            except UnicodeDecodeError:
                # If UTF-8 fails, try with Latin-1 encoding
                logging.info(f"UTF-8 encoding failed for {file.filename}, trying Latin-1")
                file.seek(0)
                
                if file.content_length and file.content_length < 10 * 1024 * 1024:
                    file_content = file.read().decode('latin-1')
                    processed_data = process_csv_data(file_content)
                else:
                    import tempfile
                    import os
                    
                    with tempfile.NamedTemporaryFile(delete=False, suffix='.csv') as temp:
                        file.save(temp.name)
                        temp_path = temp.name
                    
                    try:
                        processed_data = process_csv_data("", use_file_path=True, file_encoding='latin-1', 
                                                        is_large_file=True, csv_content_path=temp_path)
                    finally:
                        if os.path.exists(temp_path):
                            os.remove(temp_path)
            
            # Check for errors in processing
            if 'error' in processed_data:
                logging.error(f"Error processing {file.filename}: {processed_data.get('error')}")
                return jsonify(processed_data), 400
            
            # Log success
            logging.info(f"Successfully processed file {file.filename} with {processed_data.get('metadata', {}).get('points_count', 0)} points")
            return jsonify(processed_data)
            
        except Exception as e:
            logging.error(f"Error processing file {file.filename}: {str(e)}")
            import traceback
            logging.error(traceback.format_exc())
            return jsonify({"error": f"Error processing file: {str(e)}"}), 500
            
    except Exception as e:
        logging.error(f"Unexpected error in process_csv route: {str(e)}")
        import traceback
        logging.error(traceback.format_exc())
        return jsonify({"error": f"Server error: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)