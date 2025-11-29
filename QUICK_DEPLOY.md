# Quick EC2 Setup - Manual Steps

## Your EC2 Details:
- **IP**: 51.21.132.54
- **Region**: eu-north-1
- **Instance**: i-04dd6381bab81b3c7

## Step 1: Connect to EC2
```powershell
ssh -i "C:\Users\savaidkhan\Desktop\New folder\ubantu.pem" ubuntu@51.21.132.54
```

## Step 2: Install required packages
```bash
# Install unzip first
sudo apt-get install -y unzip

# Extract the uploaded files
cd ~
unzip -o connect.zip

# Fix line endings
sed -i 's/\r$//' setup-ec2.sh
chmod +x setup-ec2.sh
```

## Step 3: Run setup
```bash
./setup-ec2.sh
```

This will:
- Install Docker & Docker Compose
- Extract and build the application
- Start all containers

## Step 4: Access your application
```
http://51.21.132.54
```

## Alternative: Manual Docker Setup

If the script fails, run these commands manually:

```bash
# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh
sudo usermod -aG docker $USER

# Install Docker Compose
sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
sudo chmod +x /usr/local/bin/docker-compose

# Extract and setup application
cd ~
mkdir -p connect-chat
cd connect-chat
unzip -o ~/connect.zip
mkdir -p server/uploads server/logs

# Create environment file
echo "VITE_API_URL=http://51.21.132.54" > client/.env.production

# Build and run
sudo docker-compose build
sudo docker-compose up -d

# Check status
sudo docker-compose ps
sudo docker-compose logs -f
```

## Check if it's running
```bash
sudo docker-compose ps
curl http://localhost
```
