$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$Core = Join-Path $Root 'cloudflow-backend/cloudflow-common/cloudflow-common-core/target/classes'
$Output = Join-Path $Root '.cloudflow-runtime/file-preview-checks'
[IO.Directory]::CreateDirectory($Output) | Out-Null
& javac -encoding UTF-8 -cp $Core -d $Output (Join-Path $PSScriptRoot 'platform-checks/FilePreviewChecks.java')
if ($LASTEXITCODE -ne 0) { throw 'File preview rules compilation failed' }
& java -cp "$Output;$Core" FilePreviewChecks
if ($LASTEXITCODE -ne 0) { throw 'File preview rules verification failed' }
$DependencyFile = Join-Path $Root 'cloudflow-backend/cloudflow-auth/target/batch-g-classpath.txt'
$Dependencies = @((Get-Content -LiteralPath $DependencyFile -Raw).Trim().Split([IO.Path]::PathSeparator) | Where-Object { $_ -match '[\\/](hutool-all|spring-web|spring-core)-[\d.]+\.jar$' })
if ($Dependencies.Count -ne 3) { throw 'Build the existing Auth batch-g dependency classpath before checking uploads' }
$UploadClassPath = (@($Core) + $Dependencies) -join [IO.Path]::PathSeparator
& javac -encoding UTF-8 -cp $UploadClassPath -d $Output (Join-Path $PSScriptRoot 'platform-checks/FilePreviewUploadChecks.java')
if ($LASTEXITCODE -ne 0) { throw 'File preview upload checks compilation failed' }
& java -cp "$Output;$UploadClassPath" FilePreviewUploadChecks
if ($LASTEXITCODE -ne 0) { throw 'File preview upload verification failed' }
