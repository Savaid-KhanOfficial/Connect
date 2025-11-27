# Connect Chat - EC2 Deployment Guide

## Prerequisites
- AWS EC2 Ubuntu instance running
- PEM file for SSH access
- Security Group configured with:
  - Port 22 (SSH) - Your IP
  - Port 80 (HTTP) - 0.0.0.0/0
  - Port 443 (HTTPS) - 0.0.0.0/0 (optional, for SSL)

## Quick Deployment

### Option 1: Automated Deployment (Recommended)

1. **Update EC2 IP in the deployment script:**
   - Open `deploy.ps1`
   - The script will prompt for your EC2 IP address

2. **Run the deployment script:**
   ```powershell
   .\deploy.ps1
   ```

3. **Enter your EC2 Public IP when prompted**

The script will:
- ✓ Test SSH connection
- ✓ Package the application
- ✓ Upload to EC2
- ✓ Install Docker & Docker Compose
- ✓ Build and start containers
- ✓ Configure environment

### Option 2: Manual Deployment

1. **Create deployment package:**
   ```powershell
   Compress-Archive -Path .\* -DestinationPath connect.zip -Force
   ```

2. **Upload to EC2:**
   ```powershell
   scp -i "C:\Users\savaidkhan\Desktop\New folder\ubantu.pem" connect.zip ubuntu@YOUR_EC2_IP:~/
   scp -i "C:\Users\savaidkhan\Desktop\New folder\ubantu.pem" setup-ec2.sh ubuntu@YOUR_EC2_IP:~/
   ```

3. **Connect to EC2:**
   ```powershell
   ssh -i "C:\Users\savaidkhan\Desktop\New folder\ubantu.pem" ubuntu@YOUR_EC2_IP
   ```

4. **Run setup on EC2:**
   ```bash
   chmod +x ~/setup-ec2.sh
   ./setup-ec2.sh
   ```

## Post-Deployment

### Access Your Application
```
http://YOUR_EC2_PUBLIC_IP
```

### Useful Commands

**Check container status:**
```bash
sudo docker-compose ps
```

**View logs:**
```bash
# All services
sudo docker-compose logs -f

# Server only
sudo docker-compose logs -f server

# Client only
sudo docker-compose logs -f client
```

**Restart application:**
```bash
sudo docker-compose restart
```

**Stop application:**
```bash
sudo docker-compose down
```

**Start application:**
```bash
sudo docker-compose up -d
```

**Rebuild after changes:**
```bash
sudo docker-compose down
sudo docker-compose build
sudo docker-compose up -d
```

### Configure Domain (Optional)

1. **Point your domain to EC2 IP:**
   - Add an A record in your DNS settings

2. **Update production environment:**
   ```bash
   nano ~/connect-chat/client/.env.production
   ```
   Change:
   ```
   VITE_API_URL=http://YOUR_DOMAIN.com
   ```

3. **Rebuild client:**
   ```bash
   cd ~/connect-chat
   sudo docker-compose build client
   sudo docker-compose up -d
   ```

### Install SSL Certificate (Optional)

1. **Install Certbot:**
   ```bash
   sudo apt-get install certbot python3-certbot-nginx -y
   ```

2. **Get certificate:**
   ```bash
   sudo certbot --nginx -d yourdomain.com
   ```

3. **Update docker-compose.yml to expose port 443**

## Troubleshooting

### Can't connect to EC2
- Check Security Group allows SSH (port 22) from your IP
- Verify PEM file path is correct
- Ensure EC2 instance is running

### Application not accessible
- Check Security Group allows HTTP (port 80) from 0.0.0.0/0
- Verify containers are running: `sudo docker-compose ps`
- Check logs: `sudo docker-compose logs -f`

### Database issues
- Database is persistent via Docker volume
- To reset: `sudo docker-compose down -v` (WARNING: Deletes all data)

### Upload/Avatar issues
- Uploads are stored in `server/uploads` directory
- Persistent via Docker volume

### Check EC2 public IP
```bash
curl http://169.254.169.254/latest/meta-data/public-ipv4
```

## Monitoring

### Check disk space
```bash
df -h
```

### Check memory usage
```bash
free -h
```

### Check Docker resources
```bash
sudo docker stats
```

## Backup

### Backup database and uploads
```bash
cd ~/connect-chat
tar -czf backup-$(date +%Y%m%d).tar.gz server/uploads server/*.db
```

### Download backup
```powershell
scp -i "C:\Users\savaidkhan\Desktop\New folder\ubantu.pem" ubuntu@YOUR_EC2_IP:~/connect-chat/backup-*.tar.gz ./
```

## Updates

### Deploy updates
1. Make changes to your local code
2. Run `.\deploy.ps1` again
3. It will automatically rebuild and restart

## Support

For issues, check:
1. Docker logs: `sudo docker-compose logs -f`
2. System logs: `sudo journalctl -u docker`
3. EC2 instance status in AWS Console
