# Connect Chat - AWS EC2 Deployment Script
# This script deploys the application to your EC2 instance

param(
    [Parameter(Mandatory=$false)]
    [string]$EC2_IP = "",
    
    [Parameter(Mandatory=$false)]
    [string]$PEM_FILE = "C:\Users\savaidkhan\Desktop\New folder\ubantu.pem",
    
    [Parameter(Mandatory=$false)]
    [string]$EC2_USER = "ubuntu"
)

$ErrorActionPreference = "Stop"

Write-Host "=================================="
Write-Host "Connect Chat - EC2 Deployment"
Write-Host "=================================="
Write-Host ""

# Check if PEM file exists
if (-not (Test-Path $PEM_FILE)) {
    Write-Host "ERROR: PEM file not found at: $PEM_FILE" -ForegroundColor Red
    Write-Host "Please update the PEM_FILE path in the script." -ForegroundColor Yellow
    exit 1
}

# Prompt for EC2 IP if not provided
if ([string]::IsNullOrEmpty($EC2_IP)) {
    $EC2_IP = Read-Host "Enter your EC2 instance Public IP address"
}

Write-Host "EC2 Instance: $EC2_USER@$EC2_IP"
Write-Host "PEM File: $PEM_FILE"
Write-Host ""

# Test SSH connection
Write-Host "Testing SSH connection..." -ForegroundColor Cyan
$testConnection = ssh -i $PEM_FILE -o StrictHostKeyChecking=no -o ConnectTimeout=10 "$EC2_USER@$EC2_IP" "echo 'Connection successful'"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Cannot connect to EC2 instance. Please check:" -ForegroundColor Red
    Write-Host "  1. EC2 instance is running" -ForegroundColor Yellow
    Write-Host "  2. Security Group allows SSH (port 22) from your IP" -ForegroundColor Yellow
    Write-Host "  3. PEM file path is correct" -ForegroundColor Yellow
    Write-Host "  4. EC2 IP address is correct" -ForegroundColor Yellow
    exit 1
}
Write-Host "[OK] SSH connection successful!" -ForegroundColor Green
Write-Host ""

# Create deployment package
Write-Host "Creating deployment package..." -ForegroundColor Cyan
$timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$zipFile = "connect-deploy-$timestamp.zip"

# Compress the project (excluding node_modules, uploads, logs, etc.)
$excludeItems = @(
    "node_modules",
    "client\node_modules",
    "server\node_modules",
    "client\dist",
    "server\uploads",
    "server\logs",
    ".git",
    "*.db",
    "*.db-shm",
    "*.db-wal"
)

Write-Host "Compressing project files..."
Compress-Archive -Path ".\*" -DestinationPath $zipFile -Force -CompressionLevel Optimal

$zipSize = [math]::Round((Get-Item $zipFile).Length / 1MB, 2)
Write-Host "[OK] Package created: $zipFile ($zipSize MB)" -ForegroundColor Green
Write-Host ""

# Upload to EC2
Write-Host "Uploading to EC2..." -ForegroundColor Cyan
scp -i $PEM_FILE -o StrictHostKeyChecking=no $zipFile "$EC2_USER@$EC2_IP`:~/connect.zip"
if ($LASTEXITCODE -ne 0) {
    Write-Host "ERROR: Failed to upload package to EC2" -ForegroundColor Red
    Remove-Item $zipFile -Force
    exit 1
}
Write-Host "[OK] Upload complete!" -ForegroundColor Green
Write-Host ""

# Upload setup script
Write-Host "Uploading setup script..." -ForegroundColor Cyan
scp -i $PEM_FILE -o StrictHostKeyChecking=no ".\setup-ec2.sh" "$EC2_USER@$EC2_IP`:~/setup-ec2.sh"
Write-Host "[OK] Setup script uploaded!" -ForegroundColor Green
Write-Host ""

# Execute setup on EC2
Write-Host "Running setup on EC2..." -ForegroundColor Cyan
Write-Host "This may take several minutes..." -ForegroundColor Yellow
Write-Host ""

ssh -i $PEM_FILE -o StrictHostKeyChecking=no "$EC2_USER@$EC2_IP" @"
chmod +x ~/setup-ec2.sh
cd ~
./setup-ec2.sh
"@

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=================================="
    Write-Host "Deployment Successful!" -ForegroundColor Green
    Write-Host "=================================="
    Write-Host ""
    Write-Host "Your Connect Chat application is now live!"
    Write-Host ""
    Write-Host "Access at: http://$EC2_IP" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Important: Make sure port 80 is open in Security Group!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "To check logs, run:" -ForegroundColor Cyan
    Write-Host "  ssh -i `"$PEM_FILE`" $EC2_USER@$EC2_IP"
    Write-Host "  cd ~/connect-chat"
    Write-Host "  sudo docker-compose logs -f"
    Write-Host ""
} else {
    Write-Host "ERROR: Deployment failed!" -ForegroundColor Red
    Write-Host "Check the output above for errors." -ForegroundColor Yellow
}

# Cleanup
Write-Host "Cleaning up local files..."
Remove-Item $zipFile -Force
Write-Host "[OK] Cleanup complete!" -ForegroundColor Green
