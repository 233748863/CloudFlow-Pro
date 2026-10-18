param(
    [string]$ClasspathFile,
    [string]$ClassesDirectory
)

$ErrorActionPreference = 'Stop'
$repository = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$module = Join-Path $repository 'cloudflow-backend/cloudflow-service-oa'
if (-not $ClasspathFile) { $ClasspathFile = Join-Path $module 'target/batch-f-classpath.txt' }
if (-not $ClassesDirectory) { $ClassesDirectory = Join-Path $module 'target/classes' }
if (-not (Test-Path -LiteralPath $ClasspathFile -PathType Leaf)) {
    throw 'An existing OA dependency classpath file is required; this check does not run Maven.'
}
if (-not (Test-Path -LiteralPath $ClassesDirectory -PathType Container)) {
    throw 'Existing compiled OA classes are required; this check does not run Maven.'
}

$temporary = Join-Path ([System.IO.Path]::GetTempPath()) ('cloudflow-oa08-checks-' + [guid]::NewGuid().ToString('N'))
$compiled = Join-Path $temporary 'checks'
$snapshot = Join-Path $temporary 'production'
New-Item -ItemType Directory -Path $temporary, $compiled | Out-Null
Copy-Item -LiteralPath $ClassesDirectory -Destination $snapshot -Recurse
$classpath = $snapshot + ';' + (Get-Content -LiteralPath $ClasspathFile -Raw).Trim()
$utf8 = New-Object System.Text.UTF8Encoding($false)
$argumentsFile = Join-Path $temporary 'javac.args'
$arguments = @('-encoding', 'UTF-8', '-source', '17', '-target', '17', '-processor', 'lombok.launch.AnnotationProcessorHider$AnnotationProcessor', '-classpath', ('"' + $classpath.Replace('\', '/') + '"'), '-d', ('"' + $compiled.Replace('\', '/') + '"'))
$productionSources = @(Get-ChildItem -LiteralPath (Join-Path $module 'src/main/java') -Recurse -Filter '*Consumable*.java' | Select-Object -ExpandProperty FullName)
$productionSources += Join-Path $module 'src/main/java/com/cloudflow/oa/domain/dto/PurchaseReceiptDTO.java'
$productionSources += Join-Path $module 'src/main/java/com/cloudflow/oa/controller/PurchaseRequestController.java'
foreach ($source in $productionSources) { $arguments += '"' + $source.Replace('\', '/') + '"' }
foreach ($source in @('OaConsumableChecks.java', 'OaConsumableFlowChecks.java', 'OaConsumableMapperChecks.java')) {
    $arguments += '"' + (Join-Path $PSScriptRoot $source).Replace('\', '/') + '"'
}
[System.IO.File]::WriteAllLines($argumentsFile, $arguments, $utf8)
& javac ('@' + $argumentsFile)
if ($LASTEXITCODE -ne 0) { throw "OA-08 check compilation failed; artifacts: $temporary" }

$runtimeArguments = Join-Path $temporary 'java.args'
Push-Location $module
try {
    foreach ($checkClass in @('OaConsumableChecks', 'OaConsumableMapperChecks')) {
        [System.IO.File]::WriteAllLines($runtimeArguments, @('-classpath', ('"' + ($compiled + ';' + $classpath).Replace('\', '/') + '"'), ('com.cloudflow.oa.service.impl.' + $checkClass)), $utf8)
        & java ('@' + $runtimeArguments)
        if ($LASTEXITCODE -ne 0) { throw "OA-08 checks failed; artifacts: $temporary" }
    }
}
finally { Pop-Location }
Write-Host "OA-08 isolated check artifacts: $temporary"
