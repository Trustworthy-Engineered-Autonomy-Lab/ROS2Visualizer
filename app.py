import os
import logging
from flask import Flask, render_template, request, jsonify
from utils.data_processor import process_csv_data

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default_secret_key_for_development")

@app.route('/')
def index():
    """Render the main application page."""
    return render_template('index.html')

@app.route('/process_csv', methods=['POST'])
def process_csv():
    """Process uploaded CSV file and return processed data."""
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    
    if file and file.filename.endswith(('.csv', '.txt')):
        try:
            # Read file content
            file_content = file.read().decode('utf-8')
            
            # Process the CSV data
            processed_data = process_csv_data(file_content)
            
            return jsonify(processed_data)
        except Exception as e:
            logging.error(f"Error processing file: {str(e)}")
            return jsonify({"error": f"Error processing file: {str(e)}"}), 500
    else:
        return jsonify({"error": "File type not supported. Please upload a CSV or TXT file."}), 400

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
