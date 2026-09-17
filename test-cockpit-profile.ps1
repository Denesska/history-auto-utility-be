<#
.SYNOPSIS
    Exercises the car profile backup end to end, without a car.

.DESCRIPTION
    GETs /p/<slug> to show what is stored, PUTs a small sample profile at a revision one higher,
    reads it back, and then checks that a stale revision is refused with 409. Use it right after a
    deploy to confirm the endpoint, the Prisma model and the revision rule all work.

    Nothing here touches a real head unit: the sample profile uses the same envelope the car sends
    (version/revision/updatedAt/prefs/files) with one recognisable favourite in it.

.EXAMPLE
    ./test-cockpit-profile.ps1 -BaseUrl https://dev.denhau.ro/api -Slug <profile slug>

.EXAMPLE
    ./test-cockpit-profile.ps1 -BaseUrl https://dev.denhau.ro/api -Slug <slug> -ReadOnly
    # just prints what the server is holding, changes nothing
#>
param(
    [Parameter(Mandatory = $true)][string]$BaseUrl,
    [Parameter(Mandatory = $true)][string]$Slug,
    [switch]$ReadOnly
)

$BaseUrl = $BaseUrl.TrimEnd('/')
$url = "$BaseUrl/p/$Slug"

function Show-Profile($profile, $label) {
    if (-not $profile.revision) {
        Write-Host "  $label : (empty — nothing stored on this channel yet)" -ForegroundColor Yellow
        return
    }
    $favCount = 0
    if ($profile.files.'favorites.json') {
        $favCount = (ConvertFrom-Json $profile.files.'favorites.json').favorites.Count
    }
    Write-Host "  $label : revision $($profile.revision), $favCount favourite(s)" -ForegroundColor Green
}

Write-Host "GET $url" -ForegroundColor Cyan
try {
    $current = Invoke-RestMethod -Method Get -Uri $url
    Show-Profile $current 'stored'
} catch {
    Write-Host "  GET failed: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

if ($ReadOnly) { exit 0 }

$nextRevision = 1
if ($current.revision) { $nextRevision = [int]$current.revision + 1 }

$favorites = @{ favorites = @(@{ id = 'test-run'; name = 'Test from PowerShell'; lat = 45.6427; lon = 25.5887 }) } |
    ConvertTo-Json -Compress -Depth 5
$sample = @{
    version   = 1
    revision  = $nextRevision
    updatedAt = [int][double]::Parse((Get-Date -UFormat %s))
    prefs     = @{ nav_settings = @{ route_preference = @{ t = 's'; v = 'FASTEST' } } }
    files     = @{ 'favorites.json' = $favorites }
} | ConvertTo-Json -Compress -Depth 8

Write-Host ""
Write-Host "PUT $url  (revision $nextRevision)" -ForegroundColor Cyan
try {
    $saved = Invoke-RestMethod -Method Put -Uri $url -ContentType 'application/json' -Body $sample
    Show-Profile $saved 'saved '
} catch {
    Write-Host "  PUT failed: $($_.Exception.Message)" -ForegroundColor Red
    if ($_.ErrorDetails.Message) { Write-Host "  $($_.ErrorDetails.Message)" -ForegroundColor Red }
    exit 1
}

Write-Host ""
Write-Host "PUT $url  (stale revision 0 — must be refused)" -ForegroundColor Cyan
$stale = $sample | ConvertFrom-Json
$stale.revision = 0
try {
    Invoke-RestMethod -Method Put -Uri $url -ContentType 'application/json' -Body ($stale | ConvertTo-Json -Compress -Depth 8) | Out-Null
    Write-Host "  accepted a stale revision — the revision guard is NOT working" -ForegroundColor Red
    exit 1
} catch {
    if ($_.Exception.Response.StatusCode.value__ -eq 409) {
        Write-Host "  refused with 409, as it should be" -ForegroundColor Green
    } else {
        Write-Host "  refused, but with $($_.Exception.Response.StatusCode.value__) instead of 409" -ForegroundColor Yellow
    }
}

Write-Host ""
Write-Host "Done. Remember this left a test profile on the channel — push from the car (Setup ->" -ForegroundColor Cyan
Write-Host "Profile and backup -> Last saved) to overwrite it with the real one." -ForegroundColor Cyan
