# Retry temporary package-feed failures, but require a working OCR executable.
$ErrorActionPreference = "Stop"
$PSNativeCommandUseErrorActionPreference = $false
$ocr = "C:/Program Files/Tesseract-OCR"
for ($attempt = 1; $attempt -le 3; $attempt++) {
    choco install tesseract --yes --no-progress
    $installExitCode = $LASTEXITCODE
    if (($installExitCode -in @(0, 1641, 3010)) -and (Test-Path "$ocr/tesseract.exe")) {
        & "$ocr/tesseract.exe" --version
        if ($LASTEXITCODE -eq 0) {
            $ocr | Out-File -FilePath $env:GITHUB_PATH -Encoding utf8 -Append
            return
        }
    }
    if ($attempt -eq 3) {
        throw "Tesseract installation failed after $attempt attempts (installer exit $installExitCode)."
    }
    Write-Warning "Tesseract installation attempt $attempt failed; retrying in 15 seconds."
    Start-Sleep -Seconds 15
}
