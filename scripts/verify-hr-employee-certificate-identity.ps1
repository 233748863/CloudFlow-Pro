$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Module=Join-Path $Root 'cloudflow-backend/cloudflow-service-hr'
$Source=Join-Path $Root 'scripts/hr-checks/HrEmployeeCertificateIdentityChecks.java'
$Hash=(Get-FileHash -LiteralPath $Source).Hash
$Entries=@((Join-Path $Module 'target/classes'))+(Get-Content -LiteralPath (Join-Path $Module 'target/report-classpath.txt') -Raw).Trim().Split([IO.Path]::PathSeparator)
foreach($Entry in $Entries){if(-not (Test-Path -LiteralPath $Entry) -or [IO.Path]::GetPathRoot([IO.Path]::GetFullPath($Entry)) -ne 'D:\'){throw 'D-drive dependencies required'}}
$Output=Join-Path $Module 'target/employee-certificate-checks'
[IO.Directory]::CreateDirectory($Output)|Out-Null
$Compile=Join-Path $Output 'compile.args'
$Classpath=$Entries -join [IO.Path]::PathSeparator
[IO.File]::WriteAllLines($Compile,@('-encoding','UTF-8','-cp',('"'+$Classpath.Replace('\','/')+'"'),'-d',('"'+$Output.Replace('\','/')+'"'),('"'+$Source.Replace('\','/')+'"')),[Text.UTF8Encoding]::new($false))
& javac "@$Compile"
if($LASTEXITCODE -ne 0){throw 'Certificate identity compilation failed'}
$ArgsFile=Join-Path $Output 'run.args'
[IO.File]::WriteAllLines($ArgsFile,@('-Dfile.encoding=UTF-8','-cp',('"'+($Output+[IO.Path]::PathSeparator+$Classpath).Replace('\','/')+'"'),'com.cloudflow.hr.checks.HrEmployeeCertificateIdentityChecks'),[Text.UTF8Encoding]::new($false))
& java "@$ArgsFile"
if($LASTEXITCODE -ne 0){throw 'Certificate identity checks failed'}
if((Get-FileHash -LiteralPath $Source).Hash -ne $Hash){throw 'Identity source changed during validation'}
'EMPLOYEE_CERTIFICATE_IDENTITY_INPUT: changed=0'
