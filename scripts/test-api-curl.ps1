# PowerShell-skript för att testa KoaLens API-endpoints
Write-Host "KoaLens API Endpoint Test" -ForegroundColor Cyan

$API_BASE = "http://localhost:3000/api"

# Testa health-endpoint först
Write-Host "`nTestar health endpoint..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "$API_BASE/health" -Method GET -UseBasicParsing
    $content = $response.Content | ConvertFrom-Json
    Write-Host "Health endpoint svarade med status:" -ForegroundColor Green
    $content | Format-List
} catch {
    Write-Host "Fel vid anrop till health endpoint: $_" -ForegroundColor Red
    Write-Host "Servern kanske inte körs? Starta med 'npm run dev'" -ForegroundColor Yellow
    exit
}

# Testa nya frontend-kompatibilitets-endpointen för bildanalys
Write-Host "`nTestar /api/ai/analyze-image endpoint (begränsat exempel)..." -ForegroundColor Yellow
$body = @{
    image = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"  # 1x1 pixelbild
    preferredLanguage = "en"
} | ConvertTo-Json

Write-Host "Skickar test-request till $API_BASE/ai/analyze-image..."
try {
    $response = Invoke-WebRequest -Uri "$API_BASE/ai/analyze-image" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    $content = $response.Content | ConvertFrom-Json
    
    Write-Host "Endpoint svarade med status $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Första egenskaperna i svaret:" -ForegroundColor Green
    
    # Visa första egenskaperna i svaret
    $properties = $content | Get-Member -MemberType NoteProperty | Select-Object -First 3 -ExpandProperty Name
    foreach ($prop in $properties) {
        Write-Host "$prop : $($content.$prop)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "Fel vid anrop till /api/ai/analyze-image: $_" -ForegroundColor Red
}

# Testa textanalys-endpointen
Write-Host "`nTestar /api/ai/analyze-text endpoint..." -ForegroundColor Yellow
$body = @{
    ingredients = @("milk", "sugar", "flour", "salt")
} | ConvertTo-Json

Write-Host "Skickar test-request till $API_BASE/ai/analyze-text..."
try {
    $response = Invoke-WebRequest -Uri "$API_BASE/ai/analyze-text" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    $content = $response.Content | ConvertFrom-Json
    
    Write-Host "Endpoint svarade med status $($response.StatusCode)" -ForegroundColor Green
    Write-Host "Första egenskaperna i svaret:" -ForegroundColor Green
    
    # Visa första egenskaperna i svaret
    $properties = $content | Get-Member -MemberType NoteProperty | Select-Object -First 3 -ExpandProperty Name
    foreach ($prop in $properties) {
        Write-Host "$prop : $($content.$prop)" -ForegroundColor Cyan
    }
} catch {
    Write-Host "Fel vid anrop till /api/ai/analyze-text: $_" -ForegroundColor Red
}

# Testa test-endpointen som inte anropar AI-tjänsten
Write-Host "`nTestar /api/ai/test-endpoint (inga AI-anrop)..." -ForegroundColor Yellow
$body = @{
    image = "test-image"
    ingredients = @("test-ingredient")
} | ConvertTo-Json

Write-Host "Skickar test-request till $API_BASE/ai/test-endpoint..."
try {
    $response = Invoke-WebRequest -Uri "$API_BASE/ai/test-endpoint" -Method POST -Body $body -ContentType "application/json" -UseBasicParsing
    $content = $response.Content | ConvertFrom-Json
    
    Write-Host "Endpoint svarade med status $($response.StatusCode)" -ForegroundColor Green
    $content | Format-List
} catch {
    Write-Host "Fel vid anrop till /api/ai/test-endpoint: $_" -ForegroundColor Red
}

Write-Host "`nTest genomfört!" -ForegroundColor Cyan 