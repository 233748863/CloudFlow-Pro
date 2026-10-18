param([switch]$SkipBuild)

$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if ([IO.Path]::GetPathRoot($Root) -eq ($env:SystemDrive + '\')) { throw 'Portal checks require a data-drive workspace' }
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Backend = Join-Path $Root 'cloudflow-backend'
$Module = Join-Path $Backend 'cloudflow-auth'
if (-not $SkipBuild) {
    Push-Location $Backend
    try {
        & mvn -q -pl cloudflow-auth -am '-DskipTests' compile dependency:build-classpath '-Dmdep.outputFile=target/portal-classpath.txt'
        if ($LASTEXITCODE -ne 0) { throw 'Portal identity compilation failed' }
    } finally { Pop-Location }
}
$Dependencies = (Get-Content -LiteralPath (Join-Path $Module 'target/portal-classpath.txt') -Raw).Trim()
$Modules = @($Module) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$ClassPath = (@($Classes) + @($Dependencies)) -join [IO.Path]::PathSeparator
$Output = Join-Path $Module 'target/portal-identity-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
$Source = Join-Path $PSScriptRoot 'portal-checks/PortalIdentityChecks.java'
$Compile = @('-encoding','UTF-8','-parameters','-cp',('"' + $ClassPath.Replace('\','/') + '"'),'-d',('"' + $Output.Replace('\','/') + '"'),('"' + $Source.Replace('\','/') + '"'))
[IO.File]::WriteAllLines((Join-Path $Output 'compile.args'), $Compile, [Text.UTF8Encoding]::new($false))
& javac ('@' + (Join-Path $Output 'compile.args'))
if ($LASTEXITCODE -ne 0) { throw 'Portal identity checks compilation failed' }
$Run = @('-Dfile.encoding=UTF-8','-cp',('"' + ($Output + [IO.Path]::PathSeparator + $ClassPath).Replace('\','/') + '"'),'com.cloudflow.auth.portal.PortalIdentityChecks')
[IO.File]::WriteAllLines((Join-Path $Output 'run.args'), $Run, [Text.UTF8Encoding]::new($false))
& java ('@' + (Join-Path $Output 'run.args'))
if ($LASTEXITCODE -ne 0) { throw 'Portal identity checks failed' }
