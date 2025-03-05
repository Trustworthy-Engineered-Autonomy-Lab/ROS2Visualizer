# Flight Trajectory Visualizer Deployment Guide

This guide provides step-by-step instructions for deploying the Flight Trajectory Visualizer application on a server where you don't have root access.

## Prerequisites

- Python 3.8 or higher installed on the server
- Access to a terminal/SSH on the server
- Ability to create directories and run Python in your user space

## Step 1: Prepare Your Environment

```bash
# Log in to your server
ssh username@your-server.com

# Create a directory for your application
mkdir -p ~/apps/flight-visualizer
cd ~/apps/flight-visualizer

# Create a virtual environment
python3 -m venv venv
source venv/bin/activate
```

## Step 2: Transfer Files to Your Server

Option 1: Using SCP (from your local machine):
```bash
# Compress your project files
zip -r flight_visualizer.zip .

# Transfer to your server
scp flight_visualizer.zip username@your-server.com:~/apps/flight-visualizer/
```

Option 2: Using Git (if your project is in a Git repository):
```bash
# On your server
git clone https://github.com/yourusername/flight-visualizer.git .
```

Option 3: Manual file upload (using SFTP or your hosting provider's file manager)

## Step 3: Extract Files (if using zip)

```bash
# On your server
cd ~/apps/flight-visualizer
unzip flight_visualizer.zip
```

## Step 4: Install Dependencies

```bash
# Ensure your virtual environment is activated
source venv/bin/activate

# Install all required packages
pip install -r deployment_requirements.txt
```

## Step 5: Configure Environment Variables

```bash
# Create a .env file or export variables
touch .env
echo "SESSION_SECRET=your_secure_random_string" >> .env
echo "PORT=8080" >> .env

# Load environment variables
export SESSION_SECRET=$(grep SESSION_SECRET .env | cut -d '=' -f2)
export PORT=$(grep PORT .env | cut -d '=' -f2)
```

## Step 6: Test Your Application

```bash
# Run the application with gunicorn
gunicorn --bind 0.0.0.0:$PORT main:app
```

Visit `http://your-server.com:8080` to test if your application is running correctly.

## Step 7: Set Up for Production

For long-running deployment, you can use one of these methods:

### Option A: Using Screen

```bash
# Install screen if not already available
pip install screen --user  # If allowed

# Start a new screen session
screen -S flight-visualizer

# Start your application
gunicorn --bind 0.0.0.0:$PORT --workers 3 main:app

# Detach from screen by pressing Ctrl+A, then D
```

### Option B: Using nohup

```bash
# Start the application in the background
nohup gunicorn --bind 0.0.0.0:$PORT --workers 3 main:app > app.log 2>&1 &

# Note the process ID
echo $! > app.pid
```

### Option C: Using Supervisor (if available)

If supervisor is installed and accessible without root:

1. Create a configuration file `~/supervisor/flight-visualizer.conf`:
```
[program:flight-visualizer]
command=/home/username/apps/flight-visualizer/venv/bin/gunicorn --bind 0.0.0.0:8080 --workers 3 main:app
directory=/home/username/apps/flight-visualizer
user=username
autostart=true
autorestart=true
stderr_logfile=/home/username/apps/flight-visualizer/logs/supervisor.err.log
stdout_logfile=/home/username/apps/flight-visualizer/logs/supervisor.out.log
```

2. Create the logs directory:
```bash
mkdir -p ~/apps/flight-visualizer/logs
```

3. Start with supervisor:
```bash
supervisorctl -c ~/supervisor/supervisord.conf start flight-visualizer
```

## Troubleshooting

1. **Port already in use**: Try a different port number
2. **Memory issues**: Adjust the number of gunicorn workers
3. **Permission denied**: Check file permissions with `chmod`
4. **Module not found errors**: Ensure all dependencies are installed
5. **Application errors**: Check logs with `tail -f app.log`

## Useful Commands

- Check if your application is running: `ps aux | grep gunicorn`
- Kill the application: `kill $(cat app.pid)` or `pkill -f "gunicorn.*main:app"`
- View logs: `tail -f app.log`
- Reattach to screen: `screen -r flight-visualizer`

## Security Considerations

1. Never expose debugging mode in production
2. Generate a strong random string for SESSION_SECRET
3. Don't store sensitive credentials in your code
4. Consider using HTTPS if possible (may require your hosting provider's support)