$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
Set-Location -LiteralPath $Root
$Output = Join-Path $Root ('.cloudflow-runtime/hr-referral-foundation/' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/src/main/java/com/cloudflow/hr/service/HrRecruitmentContacts.java'
$ContactChecks = Join-Path $Root 'scripts/hr-checks/HrRecruitmentContactChecks.java'
& javac -encoding UTF-8 -d $Output $Source $ContactChecks
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
& java '-Dfile.encoding=UTF-8' -cp $Output com.cloudflow.hr.checks.HrRecruitmentContactChecks
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$Dependencies = (Get-Content -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-service-hr/target/batch-d-classpath.txt') -Raw).Trim()
$ClassPath = $Output + [IO.Path]::PathSeparator + $Dependencies
function Quote-JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}
$CompileArguments = Join-Path $Output 'storage-compile.args'
[IO.File]::WriteAllLines($CompileArguments, @('-encoding','UTF-8','-cp',(Quote-JavaArgument $ClassPath),'-d',(Quote-JavaArgument $Output),(Quote-JavaArgument (Join-Path $Root 'scripts/hr-checks/HrReferralStorageChecks.java'))),[Text.UTF8Encoding]::new($false))
& javac ('@' + $CompileArguments)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$RunArguments = Join-Path $Output 'storage-run.args'
[IO.File]::WriteAllLines($RunArguments, @('-Dfile.encoding=UTF-8','-cp',(Quote-JavaArgument $ClassPath),'com.cloudflow.hr.checks.HrReferralStorageChecks'),[Text.UTF8Encoding]::new($false))
& java ('@' + $RunArguments)
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Write-Output 'H2_REFERRAL_FOUNDATION_EXIT=0; scope=contact_normalization_extraction_encryption; database_writes=0; production_modified=false'
