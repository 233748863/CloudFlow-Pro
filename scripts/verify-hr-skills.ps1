param([string]$JdbcUrl = '', [string]$DataDirectory = '')

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Module = Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/report-classpath.txt') -Raw).Trim()
foreach($Dependency in $Dependencies.Split([IO.Path]::PathSeparator)){if([IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Dependency)) -ne 'D:\'){throw 'Current skill dependencies must remain on data drive'}}
$ClassPath = (Join-Path $Module 'target/classes') + [IO.Path]::PathSeparator + $Dependencies
$Output = Join-Path $Root ('.cloudflow-runtime/hr-skill-checks/' + [guid]::NewGuid().ToString('N'))
[IO.Directory]::CreateDirectory($Output) | Out-Null
function JavaArgument([string]$Value) {
    if ($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)) { throw 'Unsafe Java argument' }
    return '"' + $Value.Replace('\', '/') + '"'
}
if ($JdbcUrl) {
    if ($JdbcUrl -notmatch '^jdbc:mysql://127\.0\.0\.1:(\d{4,5})/cloud_flow_db\?') { throw 'Only a loopback verification database is allowed' }
    $Port = [int]$Matches[1]
    $ResolvedData = (Resolve-Path -LiteralPath $DataDirectory).ProviderPath
    if (-not $ResolvedData.StartsWith($Root + '\', [StringComparison]::OrdinalIgnoreCase) -or $ResolvedData -notmatch '\\batch-e-mysql-[a-f0-9]{32}\\data$') { throw 'Unexpected isolated data directory' }
    $Listeners = @(Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop)
    if ($Listeners.Count -ne 1 -or $Listeners[0].LocalAddress -ne '127.0.0.1') { throw 'Database must listen only on loopback' }
    $Owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($Listeners[0].OwningProcess)"
    if ($Owner.Name -ne 'mysqld.exe' -or -not $Owner.CommandLine.Contains($ResolvedData)) { throw 'Database process ownership mismatch' }
}
$Source = Join-Path $Root 'scripts/hr-checks/HrSkillChecks.java'
$CompileFile = Join-Path $Output 'compile.args'
[IO.File]::WriteAllLines($CompileFile, @('-encoding','UTF-8','-cp',(JavaArgument $ClassPath),'-d',(JavaArgument $Output),(JavaArgument $Source)), [Text.UTF8Encoding]::new($false))
& javac "@$CompileFile"
if ($LASTEXITCODE -ne 0) { throw 'Skill checks compilation failed' }
$RunArguments = @('-Dfile.encoding=UTF-8','-Duser.language=en','-Duser.country=US','-Duser.timezone=Asia/Shanghai','-cp',(JavaArgument ($Output + [IO.Path]::PathSeparator + $ClassPath)),'com.cloudflow.hr.service.HrSkillChecks')
if ($JdbcUrl) { $RunArguments += @((JavaArgument $JdbcUrl),(JavaArgument $ResolvedData),(JavaArgument $Module)) }
$RunFile = Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($RunFile, $RunArguments, [Text.UTF8Encoding]::new($false))
& java "@$RunFile" | Tee-Object -FilePath (Join-Path $Output 'console.log')
if ($LASTEXITCODE -ne 0) { throw 'Skill checks failed; evidence retained' }
"H2_SKILL_CHECK_EVIDENCE=$Output"
