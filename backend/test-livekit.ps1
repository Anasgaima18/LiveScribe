# LiveKit Connection Test Script
# Run this to test your LiveKit configuration

Write-Host "🔍 Testing LiveKit Configuration..." -ForegroundColor Cyan
Write-Host ""

# Load .env file
$envFile = ".env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
            $name = $matches[1].Trim()
            $value = $matches[2].Trim()
            [Environment]::SetEnvironmentVariable($name, $value, 'Process')
        }
    }
}

$LIVEKIT_URL = $env:LIVEKIT_URL
$LIVEKIT_API_KEY = $env:LIVEKIT_API_KEY
$LIVEKIT_API_SECRET = $env:LIVEKIT_API_SECRET

Write-Host "📋 Configuration:" -ForegroundColor Yellow
Write-Host "  LiveKit URL: $LIVEKIT_URL"
Write-Host "  API Key: $($LIVEKIT_API_KEY.Substring(0, [Math]::Min(10, $LIVEKIT_API_KEY.Length)))..."
Write-Host "  API Secret: $($LIVEKIT_API_SECRET.Substring(0, [Math]::Min(10, $LIVEKIT_API_SECRET.Length)))..."
Write-Host ""

if (!$LIVEKIT_URL -or !$LIVEKIT_API_KEY -or !$LIVEKIT_API_SECRET) {
    Write-Host "❌ ERROR: Missing LiveKit configuration in .env file" -ForegroundColor Red
    exit 1
}

Write-Host "🌐 Testing WebSocket Connection..." -ForegroundColor Yellow
$wsUrl = $LIVEKIT_URL -replace 'wss://', '' -replace 'ws://', ''
Write-Host "  Connecting to: wss://$wsUrl"

try {
    $ws = New-Object System.Net.WebSockets.ClientWebSocket
    $ct = New-Object System.Threading.CancellationTokenSource
    $ct.CancelAfter(5000)  # 5 second timeout
    
    $uri = [System.Uri]::new("wss://$wsUrl")
    $task = $ws.ConnectAsync($uri, $ct.Token)
    $task.Wait()
    
    if ($ws.State -eq 'Open') {
        Write-Host "  ✅ WebSocket connection successful!" -ForegroundColor Green
        $ws.CloseAsync([System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure, '', $ct.Token).Wait()
    } else {
        Write-Host "  ❌ WebSocket connection failed: State=$($ws.State)" -ForegroundColor Red
    }
} catch {
    Write-Host "  ❌ WebSocket connection error: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Possible issues:" -ForegroundColor Yellow
    Write-Host "  • LiveKit server may be down"
    Write-Host "  • Incorrect LIVEKIT_URL"
    Write-Host "  • Firewall blocking WebSocket connections"
    Write-Host "  • Network connectivity issues"
}

Write-Host ""
Write-Host "🔑 Testing API Credentials..." -ForegroundColor Yellow
Write-Host "  This requires the backend server to be running."
Write-Host "  Run 'npm run dev' in the backend folder first."
Write-Host ""

try {
    $response = Invoke-RestMethod -Uri "http://localhost:5000/api/admin/livekit/test" `
        -Method Get `
        -Headers @{"Authorization" = "Bearer YOUR_ADMIN_TOKEN"} `
        -ErrorAction Stop
    
    Write-Host "  ✅ API credentials test successful!" -ForegroundColor Green
    $response | ConvertTo-Json -Depth 10
} catch {
    Write-Host "  ⚠️  Could not test API credentials (backend may not be running)" -ForegroundColor Yellow
    Write-Host "  Run the backend server and use the /api/admin/livekit/test endpoint"
}

Write-Host ""
Write-Host "📝 Summary:" -ForegroundColor Cyan
Write-Host "  If WebSocket connection failed, your LiveKit server may be:"
Write-Host "    1. Down or unreachable"
Write-Host "    2. Configured with incorrect URL"
Write-Host "    3. Blocking your IP address"
Write-Host ""
Write-Host "  If API credentials are invalid:"
Write-Host "    1. Check LIVEKIT_API_KEY in .env"
Write-Host "    2. Check LIVEKIT_API_SECRET in .env"
Write-Host "    3. Verify credentials in LiveKit Cloud dashboard"
Write-Host ""
Write-Host "🔗 LiveKit Cloud: https://cloud.livekit.io/projects" -ForegroundColor Cyan
