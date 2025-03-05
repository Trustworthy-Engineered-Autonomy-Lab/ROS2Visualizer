import os
import logging
from flask import Flask, render_template, request, jsonify, session
from utils.data_processor import process_csv_data
from utils.data_cleaner import analyze_csv_file, apply_cleaning_operations

# Set up logging
logging.basicConfig(level=logging.DEBUG)

# Initialize Flask app
app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", "default_secret_key_for_development")

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
        for file in files:
            if file and file.filename.endswith(('.csv', '.txt')):
                try:
                    # Read file content with UTF-8 encoding
                    file_content = file.read().decode('utf-8')
                    file.seek(0)  # Reset file pointer for potential reuse
                    
                    # Analyze the CSV data
                    file_stats = analyze_csv_file(file_content, file.filename)
                    analysis_results.append(file_stats)
                except UnicodeDecodeError:
                    # Try with different encoding if UTF-8 fails
                    file.seek(0)
                    try:
                        file_content = file.read().decode('latin-1')
                        file_stats = analyze_csv_file(file_content, file.filename)
                        file_stats['note'] = 'File was decoded using latin-1 encoding'
                        analysis_results.append(file_stats)
                    except Exception as e:
                        logging.error(f"Error analyzing file {file.filename} with alternative encoding: {str(e)}")
                        import traceback
                        logging.error(traceback.format_exc())
                        analysis_results.append({
                            "filename": file.filename,
                            "error": f"Encoding error: {str(e)}"
                        })
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
        
        # Store analysis results in session for later use
        session['analysis_results'] = analysis_results
        
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
    if 'analysis_results' not in session:
        return jsonify({"error": "No analysis results found. Please analyze files first."}), 400
    
    # Get cleaning configuration from request
    try:
        config = request.json
        if not config:
            return jsonify({"error": "No cleaning configuration provided"}), 400
        
        # Get files from session
        analysis_results = session['analysis_results']
        
        # Process files with the given configuration
        cleaning_results = []
        for file_info in analysis_results:
            if 'error' not in file_info:
                # Apply cleaning operations (implement in utils/data_cleaner.py)
                cleaned_data = apply_cleaning_operations(file_info, config)
                cleaning_results.append(cleaned_data)
            else:
                cleaning_results.append(file_info)  # Pass through files with errors
        
        return jsonify({"results": cleaning_results})
    except Exception as e:
        logging.error(f"Error during data cleaning: {str(e)}")
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
