# Gunicorn configuration file for TEA Labs Flight Trajectory Visualization
# Optimized for handling large file uploads

# Server socket
bind = '0.0.0.0:5000'
backlog = 2048

# Worker processes
workers = 2  # Number of worker processes for handling requests
threads = 4  # Number of threads per worker for processing requests
worker_class = 'sync'
worker_connections = 1000  # Maximum number of connections for each worker

# Process naming
proc_name = 'tea_labs_flight_viz'

# Timeout configuration - critical for large file uploads
timeout = 300  # Seconds to wait for a worker to process a request (5 minutes)
graceful_timeout = 120  # Seconds to gracefully wait for workers to finish
keep_alive = 120  # Seconds to keep idle connections open
limit_request_line = 8190  # Max size of the HTTP request line
limit_request_fields = 100  # Max number of HTTP headers
limit_request_field_size = 8190  # Max size of HTTP header

# Logging
loglevel = 'info'
accesslog = '-'  # Log to stdout
errorlog = '-'   # Log to stderr
access_log_format = '%({X-Forwarded-For}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s"'

# SSL Configuration
# keyfile = '/path/to/key.pem'
# certfile = '/path/to/cert.pem'

# Server mechanics
max_requests = 1000  # Restart workers after this many requests to prevent memory leaks
max_requests_jitter = 200  # Add randomness to max_requests to prevent all workers restarting at once
preload_app = True  # Load application code before the worker processes are forked

# Performance tuning
worker_tmp_dir = '/tmp/tea_labs_gunicorn'  # Directory for temp files
forwarded_allow_ips = '*'  # Trust X-Forwarded-* headers
proxy_protocol = False  # Enable PROXY protocol
proxy_allow_ips = '*'  # Which addresses trusted from PROXY protocol

# User-specific configurations
chdir = '.'  # Path to application directory
daemon = False  # Don't daemonize the Gunicorn process (important for Replit)