$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Output = Join-Path $Root ('.cloudflow-runtime/hr-advance-amounts/' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrAdvanceAmounts.java'
$Checks = Join-Path $Root 'scripts/hr-checks/HrAdvanceAmountChecks.java'
& javac -encoding UTF-8 -d $Output $Source $Checks
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java '-Dfile.encoding=UTF-8' -cp $Output com.cloudflow.hr.checks.HrAdvanceAmountChecks | Tee-Object -FilePath (Join-Path $Output 'console.log')
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output "H2_ADVANCE_AMOUNT_EVIDENCE=$Output"
