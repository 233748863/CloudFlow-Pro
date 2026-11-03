param([Parameter(Mandatory=$true)][string]$ConnectionFile, [string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
$ProjectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$Backend = Join-Path $ProjectRoot 'cloudflow-backend'
$Connection = Get-Content -LiteralPath $ConnectionFile -Raw | ConvertFrom-Json
if ($Connection.host -ne '127.0.0.1' -or $Connection.port -lt 1025 -or $Connection.port -gt 65535) { throw 'Dedicated loopback MySQL connection required.' }
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $ProjectRoot ('.cloudflow-runtime/quality-message-mysql-' + [Guid]::NewGuid().ToString('N')) }
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)
[IO.Directory]::CreateDirectory($OutputDirectory) | Out-Null
$Modules = @((Join-Path $Backend 'cloudflow-auth')) + @(Get-ChildItem -LiteralPath (Join-Path $Backend 'cloudflow-common') -Directory | Select-Object -ExpandProperty FullName)
$Classes = @($Modules | ForEach-Object { Join-Path $_ 'target/classes' } | Where-Object { Test-Path -LiteralPath $_ })
$DependencyFile = Join-Path $Backend 'cloudflow-auth/target/quality-platform-classpath.txt'
$ClassPath = (@($Classes) + @((Get-Content -LiteralPath $DependencyFile -Raw).Trim())) -join [IO.Path]::PathSeparator
$CompileFile = Join-Path $OutputDirectory 'compile.args'
[IO.File]::WriteAllLines($CompileFile, @('-encoding', 'UTF-8', '-parameters', '-cp', ('"' + $ClassPath.Replace('\', '/') + '"'),
    '-d', ('"' + $OutputDirectory.Replace('\', '/') + '"'), ('"' + (Join-Path $PSScriptRoot 'MessageAttemptDatabaseChecks.java').Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
& javac '-J-Dfile.encoding=UTF-8' ('@' + $CompileFile)
if ($LASTEXITCODE -ne 0) { throw 'Message attempt MySQL check compilation failed.' }
$RunFile = Join-Path $OutputDirectory 'run.args'
[IO.File]::WriteAllLines($RunFile, @('-Dfile.encoding=UTF-8', '-Dsun.stdout.encoding=UTF-8', '-Dsun.stderr.encoding=UTF-8', '-cp',
    ('"' + ($OutputDirectory + [IO.Path]::PathSeparator + $ClassPath).Replace('\', '/') + '"'),
    'com.cloudflow.auth.message.MessageAttemptDatabaseChecks', ('"' + (Join-Path $Backend 'DB/01.cloudflow-common.sql').Replace('\', '/') + '"'),
    ('"' + (Join-Path $Backend 'cloudflow-auth/src/main/resources/mapper/SysMessageDeliveryMapper.xml').Replace('\', '/') + '"')), [Text.UTF8Encoding]::new($false))
$PreviousUrl = $env:MESSAGE_QUALITY_JDBC_URL
$PreviousUser = $env:MESSAGE_QUALITY_JDBC_USER
$PreviousPassword = $env:MESSAGE_QUALITY_JDBC_PASSWORD
try {
    $Schema = 'quality_message_' + [Guid]::NewGuid().ToString('N')
    $env:MESSAGE_QUALITY_JDBC_URL = "jdbc:mysql://127.0.0.1:$($Connection.port)/${Schema}?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai&characterEncoding=UTF-8"
    $env:MESSAGE_QUALITY_JDBC_USER = $Connection.user
    $env:MESSAGE_QUALITY_JDBC_PASSWORD = $Connection.password
    & java ('@' + $RunFile)
    if ($LASTEXITCODE -ne 0) { throw 'Message attempt MySQL checks failed.' }
} finally {
    $env:MESSAGE_QUALITY_JDBC_URL = $PreviousUrl
    $env:MESSAGE_QUALITY_JDBC_USER = $PreviousUser
    $env:MESSAGE_QUALITY_JDBC_PASSWORD = $PreviousPassword
}
Write-Output "MESSAGE_ATTEMPT_MYSQL_OUTPUT=$OutputDirectory"
