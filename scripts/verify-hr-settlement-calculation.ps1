$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Output = Join-Path $Root ('.cloudflow-runtime/hr-settlement-calculation/' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrSettlementCalculation.java'
$Checks = Join-Path $Root 'scripts/hr-checks/HrSettlementCalculationChecks.java'
$Hashes = @($Source, $Checks) | ForEach-Object { [PSCustomObject]@{ Path = $_; Hash = (Get-FileHash -LiteralPath $_).Hash } }
& javac -encoding UTF-8 -d $Output $Source $Checks
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java '-Dfile.encoding=UTF-8' -cp $Output com.cloudflow.hr.checks.HrSettlementCalculationChecks | Tee-Object -FilePath (Join-Path $Output 'console.log')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (@($Hashes | Where-Object { (Get-FileHash -LiteralPath $_.Path).Hash -ne $_.Hash }).Count -ne 0) { throw 'Calculation inputs changed during validation' }
Write-Output "H2_SETTLEMENT_CALCULATION_EVIDENCE=$Output"
