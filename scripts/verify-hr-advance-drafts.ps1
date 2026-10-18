$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Module = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Run = Join-Path $Root ('.cloudflow-runtime/hr-advance-drafts/' + [guid]::NewGuid().ToString('N'))
$Classes = Join-Path $Run 'classes'
[IO.Directory]::CreateDirectory($Classes) | Out-Null
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/batch-d-classpath.txt') -Raw).Trim()
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
function JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}
$Sources = @(
    'src/main/java/com/cloudflow/hr/service/HrAdvanceAmounts.java',
    'src/main/java/com/cloudflow/hr/service/HrAdvanceDraftRules.java',
    'src/main/java/com/cloudflow/hr/service/HrAdvanceApplicationRules.java',
    'src/main/java/com/cloudflow/hr/domain/dto/HrAdvanceRequests.java'
) | ForEach-Object { JavaArgument (Join-Path $Module $_) }
$Sources += JavaArgument (Join-Path $Root 'scripts/hr-checks/HrAdvanceDraftChecks.java')
$Sources += JavaArgument (Join-Path $Root 'scripts/hr-checks/HrAdvanceApplicationRuleChecks.java')
$Compile = Join-Path $Run 'compile.args'
[IO.File]::WriteAllLines($Compile, @('-encoding','UTF-8','-cp',(JavaArgument $ClassPath),'-d',(JavaArgument $Classes)) + $Sources, [Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if ($LASTEXITCODE -ne 0) { throw 'Advance draft rules compilation failed' }
$RunArguments = Join-Path $Run 'run.args'
[IO.File]::WriteAllLines($RunArguments, @('-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai','-cp',
    (JavaArgument ($Classes + [IO.Path]::PathSeparator + $ClassPath)), 'com.cloudflow.hr.checks.HrAdvanceDraftChecks'), [Text.UTF8Encoding]::new($false))
& java "@$RunArguments" 2>&1 | Tee-Object -FilePath (Join-Path $Run 'console.log')
if ($LASTEXITCODE -ne 0) { throw 'Advance draft rules checks failed' }
$ApplicationArguments = Join-Path $Run 'application.args'
[IO.File]::WriteAllLines($ApplicationArguments, @('-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai','-cp',
    (JavaArgument ($Classes + [IO.Path]::PathSeparator + $ClassPath)), 'com.cloudflow.hr.checks.HrAdvanceApplicationRuleChecks'), [Text.UTF8Encoding]::new($false))
& java "@$ApplicationArguments" 2>&1 | Tee-Object -FilePath (Join-Path $Run 'application-console.log')
if ($LASTEXITCODE -ne 0) { throw 'Advance application rules checks failed' }
Write-Output "H2_ADVANCE_DRAFT_EVIDENCE=$Run"
