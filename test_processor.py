import sys
import logging
from utils.data_processor import process_csv_data

# Set up logging
logging.basicConfig(level=logging.DEBUG)

def test_process_csv():
    # Read the test file
    with open('test_data/test_flight.csv', 'r') as file:
        csv_content = file.read()
    
    # Process the CSV data
    result = process_csv_data(csv_content)
    
    # Print the result structure (not all data)
    if isinstance(result, dict):
        print("Result keys:", list(result.keys()))
        
        if 'data' in result and isinstance(result['data'], list):
            print(f"Number of data points: {len(result['data'])}")
            if len(result['data']) > 0 and isinstance(result['data'][0], dict):
                print("First data point structure:", list(result['data'][0].keys()))
                # Get the first few items safely
                first_few = {}
                for i, (k, v) in enumerate(result['data'][0].items()):
                    if i < 5:
                        first_few[k] = v
                    else:
                        break
                print("First data point sample:", first_few)
        elif 'error' in result:
            print("Error processing data:", result.get('error', 'Unknown error'))
            print("Error message:", result.get('message', 'No detailed message'))
    else:
        print("Result is not a dictionary:", type(result))
    
    if 'metadata' in result:
        print("Metadata:", result['metadata'])

if __name__ == "__main__":
    test_process_csv()