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
    print("Result keys:", result.keys())
    
    if 'data' in result:
        print(f"Number of data points: {len(result['data'])}")
        if len(result['data']) > 0:
            print("First data point structure:", result['data'][0].keys())
            print("First data point sample:", {k: v for k, v in list(result['data'][0].items())[:5]})
    
    if 'metadata' in result:
        print("Metadata:", result['metadata'])

if __name__ == "__main__":
    test_process_csv()