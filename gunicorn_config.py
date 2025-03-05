# Gunicorn configuration file for TEA Labs Flight Trajectory Visualization
# Optimized for handling gigabyte-scale file uploads with progress tracking

# Server socket
bind = '0.0.0.0:5000'
backlog = 2048

# Worker processes - configured for large file processing
workers = 2  # Number of worker processes for handling requests
threads = 4  # Number of threads per worker for processing requests
worker_class = 'sync'  # Synchronous worker model better for large file uploads
worker_connections = 1000  # Maximum number of connections for each worker

# Process naming
proc_name = 'tea_labs_flight_viz'

# Timeout configuration - extended for gigabyte-scale file uploads
timeout = 600  # Seconds to wait for a worker to process a request (10 minutes)
graceful_timeout = 180  # Seconds to gracefully wait for workers to finish
keep_alive = 120  # Seconds to keep idle connections open

# Request size limits - increased for large file handling
limit_request_line = 8190  # Max size of the HTTP request line
limit_request_fields = 100  # Max number of HTTP headers
limit_request_field_size = 8190  # Max size of HTTP header

# Disable request body size limit - important for gigabyte file uploads
# Note: Actual file size handling is managed by the application
limit_request_body = 0  # No limit to request body size (0 = unlimited)

# Logging configuration - enhanced for debugging large file uploads
loglevel = 'info'
accesslog = '-'  # Log to stdout
errorlog = '-'   # Log to stderr
access_log_format = '%({X-Forwarded-For}i)s %(l)s %(u)s %(t)s "%(r)s" %(s)s %(b)s "%(f)s" "%(a)s" %({X-Request-ID}i)s %({Content-Length}i)s %({X-RateLimit-Remaining}i)s'
capture_output = True  # Capture stdout/stderr from workers
enable_stdio_inheritance = True  # Inherit stdio file descriptors for better logging

# SSL Configuration - commented out for development
# keyfile = '/path/to/key.pem'
# certfile = '/path/to/cert.pem'

# Server mechanics - optimized for stability with large files
max_requests = 200  # Restart workers after this many requests to prevent memory leaks
max_requests_jitter = 50  # Add randomness to max_requests to prevent all workers restarting at once
preload_app = True  # Load application code before the worker processes are forked

# Performance tuning
worker_tmp_dir = '/tmp/tea_labs_gunicorn'  # Directory for temp files
forwarded_allow_ips = '*'  # Trust X-Forwarded-* headers
proxy_protocol = False  # Enable PROXY protocol
proxy_allow_ips = '*'  # Which addresses trusted from PROXY protocol

# User-specific configurations
chdir = '.'  # Path to application directory
daemon = False  # Don't daemonize the Gunicorn process (important for Replit)

# Memory management for large file processing
worker_abort_on_error = False  # Don't abort workers on error
reuse_port = True  # Reuse port for better connection distribution

# File upload performance optimizations
sendfile = True  # Use sendfile for faster file sending