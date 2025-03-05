import os
import logging
from app import app

# Set up custom logging for gunicorn
if os.environ.get('RUNNING_GUNICORN', '0') == '1':
    gunicorn_logger = logging.getLogger('gunicorn.error')
    app.logger.handlers = gunicorn_logger.handlers
    app.logger.setLevel(gunicorn_logger.level)
    app.logger.info("Running with Gunicorn")
else:
    # For direct Flask runs
    logging.basicConfig(level=logging.INFO)
    app.logger.info("Running with Flask development server")

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
