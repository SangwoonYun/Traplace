# Gunicorn configuration file

# Maximum size of HTTP request line in bytes (0-8190, or 0 for unlimited)
# Set to maximum allowed value to handle longer URLs
limit_request_line = 8190

# Bind address
bind = '0.0.0.0:8000'

# Number of worker processes
workers = 4

# Worker class
worker_class = 'sync'

# Timeout in seconds
timeout = 30
