<#
.SYNOPSIS
    Exercises the phone -> car nav relay end to end, without a car or a phone.

.DESCRIPTION
    POSTs a Google Maps link to /n/<slug>/set (the server resolves it to coordinates / a name),
    then GETs /n/<slug>/latest and prints what the car would receive. Use it right after a deploy
    to confirm both the endpoint and the link resolver work.

.EXAMPLE
    ./test-nav-relay.ps1 -BaseUrl https://dev.denhau.ro/api -Slug abc123...
    # uses the built-in Brașov sample link

.EXAMPLE
    ./test-nav-relay.ps1 -BaseUrl https://dev.denhau.ro/api -Slug abc123... -Url "https://maps.app.goo.gl/xxxx"
    # tests a real shared short link (redirect-following)
#>
param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$Slug,
    # A coordinate query link that resolves with no external redirect, so the default run always works.
    [string]$Url = "https://www.google.com/maps/search/?api=1&query=45.6427,25.5887"
)

$BaseUrl = $BaseUrl.TrimEnd('/')
$setUrl = "$BaseUrl/n/$Slug/set"
$latestUrl = "$BaseUrl/n/$Slug/latest"

Write-Host "POST $setUrl" -ForegroundColor Cyan
Write-Host "  url = $Url"
try {
    $body = @{ url = $Url } | ConvertTo-Json -Compress
    $setResponse = Invoke-RestMethod -Method Post -Uri $setUrl -ContentType 'application/json' -Body $body
    Write-Host "  -> resolved:" -ForegroundColor Green
    $setResponse | ConvertTo-Json -Compress | Write-Host
} catch {
    Write-Host "  POST failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red }
    exit 1
}

Write-Host ""
Write-Host "GET $latestUrl" -ForegroundColor Cyan
try {
    $latest = Invoke-RestMethod -Method Get -Uri $latestUrl
    Write-Host "  -> car would receive:" -ForegroundColor Green
    $latest | ConvertTo-Json -Compress | Write-Host
    if (-not $latest.id) {
        Write-Host "  (empty — nothing stored; the link may not have resolved to coordinates or a name)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "  GET failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
