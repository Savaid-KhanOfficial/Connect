# FINAL DEPLOYMENT STEPS

## ✅ Files Already Uploaded to EC2
- Application files: ~/connect.zip (extracted)
- Setup script: ~/setup-ec2.sh

## 🔧 Security Groups - DO THIS FIRST!

Go to AWS Console → EC2 → Security Groups → Edit Inbound Rules:

### Add These Rules:
1. **HTTP** - Port 80 - Source: 0.0.0.0/0 (Anywhere IPv4)
2. **SSH** - Port 22 - Source: Your IP or 0.0.0.0/0

## 🚀 Manual Deployment Commands

### Step 1: Connect to EC2
```powershell
ssh -i "C:\Users\savaidkhan\Desktop\New folder\ubantu.pem" ubuntu@51.21.132.54
```

### Step 2: Install Docker
```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Verify installation
docker --version
docker-compose --version
```

### Step 3: Setup Application
```bash
# Create app directory
mkdir -p ~/connect-chat
cd ~

# Extract files (if not already done)
unzip -o connect.zip -d connect-chat
cd connect-chat

# Create directories
mkdir -p server/uploads server/logs

# Set environment
echo "VITE_API_URL=http://51.21.132.54" > client/.env.production
```

### Step 4: Build and Run
```bash
# Build containers
sudo docker-compose build

# Start application
sudo docker-compose up -d

# Check status
sudo docker-compose ps

# View logs
sudo docker-compose logs -f
```

## 🌐 Access Your Application

Once running, visit:
**http://51.21.132.54**

## 🔍 Troubleshooting Commands

```bash
# Check if containers are running
sudo docker-compose ps

# View all logs
sudo docker-compose logs -f

# View only server logs
sudo docker-compose logs -f server

# View only client logs
sudo docker-compose logs -f client

# Restart services
sudo docker-compose restart

# Stop services
sudo docker-compose down

# Rebuild and restart
sudo docker-compose down
sudo docker-compose build
sudo docker-compose up -d
```

## 📝 Quick Reference

- **EC2 IP**: 51.21.132.54
- **Region**: eu-north-1
- **Instance ID**: i-04dd6381bab81b3c7
- **PEM File**: C:\Users\savaidkhan\Desktop\New folder\ubantu.pem

## ⚠️ Important Notes

1. **Security Groups**: Make sure port 80 is open BEFORE accessing the app
2. **First Time**: May take 5-10 minutes to build Docker images
3. **Logout/Login**: After installing Docker, you may need to logout and login again for docker commands to work without sudo
4. **Database**: SQLite database will be created automatically on first run

## 🎉 Success Indicators

If everything is working:
- `sudo docker-compose ps` shows both containers as "Up"
- Visiting http://51.21.132.54 shows the Connect login page
- No errors in `sudo docker-compose logs`
