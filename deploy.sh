#!/bin/bash
# Flight Trajectory Visualizer Deployment Script
# Run this script on your server without root access

# Configuration - change these variables as needed
APP_DIR="$HOME/apps/flight-visualizer"
PORT=8080
WORKERS=3
SESSION_SECRET=$(python -c "import secrets; print(secrets.token_hex(16))")

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Flight Trajectory Visualizer Deployment${NC}"
echo -e "This script will deploy the application to: ${YELLOW}$APP_DIR${NC}"

# Create application directory
echo -e "\n${GREEN}Step 1:${NC} Creating application directory..."
mkdir -p "$APP_DIR"
cd "$APP_DIR" || { echo "Failed to create/access directory"; exit 1; }

# Extract files (assuming they are already transferred)
if [ -f "flight_visualizer.zip" ]; then
    echo -e "\n${GREEN}Step 2:${NC} Extracting application files..."
    unzip -o flight_visualizer.zip
fi

# Create and activate virtual environment
echo -e "\n${GREEN}Step 3:${NC} Setting up Python virtual environment..."
python3 -m venv venv
source venv/bin/activate || { echo "Failed to activate virtual environment"; exit 1; }

# Install dependencies
echo -e "\n${GREEN}Step 4:${NC} Installing dependencies..."
if [ -f "deployment_requirements.txt" ]; then
    pip install -r deployment_requirements.txt
elif [ -f "requirements.txt" ]; then
    pip install -r requirements.txt
else
    echo "No requirements file found. Installing minimal requirements..."
    pip install flask flask-sqlalchemy gunicorn pandas numpy
fi

# Set up environment variables
echo -e "\n${GREEN}Step 5:${NC} Configuring environment variables..."
echo "SESSION_SECRET=$SESSION_SECRET" > .env
echo "PORT=$PORT" >> .env

# Create startup script
echo -e "\n${GREEN}Step 6:${NC} Creating startup script..."
cat > start_server.sh << EOF
#!/bin/bash
cd "$APP_DIR"
source venv/bin/activate
export SESSION_SECRET=\$(grep SESSION_SECRET .env | cut -d '=' -f2)
export PORT=\$(grep PORT .env | cut -d '=' -f2)
nohup gunicorn --bind 0.0.0.0:\$PORT --workers $WORKERS main:app > app.log 2>&1 &
echo \$! > app.pid
echo "Server started on port \$PORT with PID \$(cat app.pid)"
EOF

chmod +x start_server.sh

# Create stop script
echo -e "\n${GREEN}Step 7:${NC} Creating stop script..."
cat > stop_server.sh << EOF
#!/bin/bash
cd "$APP_DIR"
if [ -f app.pid ]; then
    kill \$(cat app.pid) 2>/dev/null
    rm app.pid
    echo "Server stopped"
else
    echo "No PID file found. Trying to find and kill the process..."
    pkill -f "gunicorn.*main:app"
fi
EOF

chmod +x stop_server.sh

# Create logs directory
mkdir -p logs

echo -e "\n${GREEN}Deployment complete!${NC}"
echo -e "Your application is ready to be started."
echo -e "To start the server: ${YELLOW}$APP_DIR/start_server.sh${NC}"
echo -e "To stop the server: ${YELLOW}$APP_DIR/stop_server.sh${NC}"
echo -e "Application logs will be available at: ${YELLOW}$APP_DIR/app.log${NC}"
echo -e "Access your application at: ${YELLOW}http://your-server-address:$PORT${NC}"
echo -e "\n${GREEN}Session secret:${NC} $SESSION_SECRET"
echo -e "${YELLOW}Note:${NC} Keep this secret secure and consistent between restarts"