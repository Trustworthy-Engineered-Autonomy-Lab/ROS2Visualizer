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