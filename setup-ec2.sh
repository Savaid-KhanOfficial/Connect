#!/bin/bash

# Connect Chat Application - EC2 Setup Script
# This script installs Docker, Docker Compose, and sets up the application

set -e

echo "=================================="
echo "Connect Chat - EC2 Setup Script"
echo "=================================="
echo ""

# Update system
echo "Updating system packages..."
sudo apt-get update -y
sudo apt-get upgrade -y

# Install required packages
echo "Installing required packages..."
sudo apt-get install -y \
    apt-transport-https \
    ca-certificates \
    curl \
    gnupg \
    lsb-release \
    git

# Install Docker
echo "Installing Docker..."
if ! command -v docker &> /dev/null; then
    curl -fsSL https://get.docker.com -o get-docker.sh
    sudo sh get-docker.sh
    sudo usermod -aG docker $USER
    rm get-docker.sh
    echo "Docker installed successfully!"
else
    echo "Docker is already installed."
fi

# Install Docker Compose
echo "Installing Docker Compose..."
if ! command -v docker-compose &> /dev/null; then
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    sudo chmod +x /usr/local/bin/docker-compose
    echo "Docker Compose installed successfully!"
else
    echo "Docker Compose is already installed."
fi

# Create application directory
echo "Creating application directory..."
mkdir -p ~/connect-chat
cd ~/connect-chat

# Extract the application (if uploaded as zip)
if [ -f "connect.zip" ]; then
    echo "Extracting application files..."
    sudo apt-get install -y unzip
    unzip -o connect.zip
    rm connect.zip
fi

# Create necessary directories
echo "Creating necessary directories..."
mkdir -p server/uploads server/logs

# Set correct permissions
echo "Setting permissions..."
chmod -R 755 .

# Create environment file if it doesn't exist
if [ ! -f "client/.env.production" ]; then
    echo "Creating production environment file..."
    echo "VITE_API_URL=http://$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)" > client/.env.production
fi

# Build and start the application
echo "Building and starting the application..."
sudo docker-compose down 2>/dev/null || true
sudo docker-compose build
sudo docker-compose up -d

# Wait for services to start
echo "Waiting for services to start..."
sleep 10

# Check if containers are running
echo ""
echo "Checking container status..."
sudo docker-compose ps

# Get public IP
PUBLIC_IP=$(curl -s http://169.254.169.254/latest/meta-data/public-ipv4)

echo ""
echo "=================================="
echo "Setup Complete!"
echo "=================================="
echo ""
echo "Your Connect Chat application is now running!"
echo ""
echo "Access your application at:"
echo "http://$PUBLIC_IP"
echo ""
echo "Useful commands:"
echo "  View logs:           sudo docker-compose logs -f"
echo "  Restart application: sudo docker-compose restart"
echo "  Stop application:    sudo docker-compose down"
echo "  Start application:   sudo docker-compose up -d"
echo ""
echo "Make sure to:"
echo "1. Open port 80 in your EC2 Security Group"
echo "2. Update client/.env.production with your domain if using one"
echo ""
