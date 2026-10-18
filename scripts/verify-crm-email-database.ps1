param([Parameter(Mandatory=$true)][string]$StatePath,
    [Parameter(Mandatory=$true)][string]$OutputPath,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r143')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Runtime=Join-Path $Root '.cloudflow-runtime/batch-g-integration'
$StateFile=(Resolve-Path -LiteralPath $StatePath).Path
$Directory=Split-Path -Parent $StateFile
if((Split-Path -Parent $Directory) -ne $Runtime -or (Split-Path -Leaf $Directory) -notmatch '^[a-f0-9]{32}$' -or (Split-Path -Leaf $Directory) -eq '9799534e1a3a47b5958330f14ae16dc7'){throw 'New independent E5 database server required'}
$State=Get-Content -LiteralPath $StateFile -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Directory){throw 'Independent runtime identity invalid'}
$Run=[IO.Path]::GetFullPath($OutputPath)
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
if(-not $Run.StartsWith($Evidence+[IO.Path]::DirectorySeparatorChar) -or (Test-Path -LiteralPath $Run)){throw 'New owned evidence directory required'}
[IO.Directory]::CreateDirectory((Join-Path $Run 'classes'))|Out-Null
if((Get-Item -LiteralPath $Run).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected evidence rejected'}
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Run 'original.ps1')
$Inputs=[Collections.Generic.List[object]]::new()
$BuildInputs=Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json"
foreach($Item in @(Get-Content -LiteralPath $BuildInputs -Raw|ConvertFrom-Json)){
    $File=[IO.Path]::GetFullPath($Item.Path,$Root)
    if((Get-FileHash -LiteralPath $File).Hash -ne $Item.Hash){throw 'Database verification requires the current built source'}
    $Inputs.Add([pscustomobject]@{Path=$File;Hash=$Item.Hash})
}
$Inputs.Add([pscustomobject]@{Path=$BuildInputs;Hash=(Get-FileHash -LiteralPath $BuildInputs).Hash})
$Inputs.Add([pscustomobject]@{Path=$PSCommandPath;Hash=(Get-FileHash -LiteralPath $PSCommandPath).Hash})
$Mysql=(Get-Command mysql.exe).Source
$Database='crm_email_'+[Guid]::NewGuid().ToString('N')
function Sql([string]$Statement){
    $Info=[Diagnostics.ProcessStartInfo]::new($Mysql)
    $Info.UseShellExecute=$false;$Info.CreateNoWindow=$true
    $Info.RedirectStandardInput=$true;$Info.RedirectStandardOutput=$true;$Info.RedirectStandardError=$true
    $Info.StandardInputEncoding=[Text.UTF8Encoding]::new($false);$Info.StandardOutputEncoding=[Text.UTF8Encoding]::new($false)
    $Info.Environment.Remove('MYSQL_PWD')|Out-Null
    foreach($Argument in @('--no-defaults','--protocol=TCP','--host=127.0.0.1',"--port=$($State.mysqlPort)",'--user=root','--skip-password','--batch','--skip-column-names','--default-character-set=utf8mb4')){$Info.ArgumentList.Add($Argument)}
    $Child=[Diagnostics.Process]::Start($Info)
    $Stdout=$Child.StandardOutput.ReadToEndAsync();$Stderr=$Child.StandardError.ReadToEndAsync()
    $Child.StandardInput.WriteLine($Statement);$Child.StandardInput.Close()
    if(-not $Child.WaitForExit(120000)){$Child.Kill();$Child.WaitForExit();throw 'Independent database client timed out'}
    if($Child.ExitCode -ne 0){throw 'Independent database statement failed; diagnostics withheld'}
    return $Stdout.GetAwaiter().GetResult().Trim()
}
if([IO.Path]::GetFullPath((Sql 'SELECT @@datadir;')).TrimEnd('\','/') -ne (Join-Path $Directory 'mysql-data')){throw 'Owned database datadir differs'}
function Quote-Java([string]$Value){
    if($Value.Contains('"') -or $Value.Contains([char]10) -or $Value.Contains([char]13)){throw 'Unsafe Java argument'}
    return '"'+$Value.Replace('\','/')+'"'
}
$ClassDirectories=[Collections.Generic.List[string]]::new()
$Libraries=@{};$Layers=@{}
. (Join-Path $Root 'scripts/owned-layered-artifact.ps1')
foreach($Name in @('crm','auth')){
    $ArgumentsFile=Join-Path $Directory "$Name/service.args"
    $Arguments=@(Get-Content -LiteralPath $ArgumentsFile)
    $Index=[Array]::IndexOf($Arguments,'-cp')
    if($Index -lt 0 -or $Arguments[$Index+2] -ne 'org.springframework.boot.loader.launch.JarLauncher'){throw 'Actual packaged classpath required'}
    $Layer=[IO.Path]::GetFullPath($Arguments[$Index+1].Trim('"'))
    $Artifacts=Join-Path $Directory "$Name/artifacts"
    if((Split-Path -Parent $Layer) -ne $Artifacts -or (Split-Path -Leaf $Layer) -notmatch '^([a-f0-9]{64})-layered$'){throw 'Owned layered package required'}
    $Hash=$Matches[1]
    $Proof=Get-OwnedLayeredArtifact (Join-Path $Artifacts ($Hash+'.jar')) $Artifacts $Hash
    $Layers[$Name]=$Proof.Path
    $ClassDirectories.Add((Join-Path $Layer 'BOOT-INF/classes'))
    foreach($File in $Proof.Files){$Inputs.Add([pscustomobject]@{Path=(Join-Path $Layer $File.Path);Hash=$File.Hash})}
    foreach($Jar in @(Get-ChildItem -LiteralPath (Join-Path $Layer 'BOOT-INF/lib') -File -Filter '*.jar')){
        if($Libraries.ContainsKey($Jar.Name)){
            if((Get-FileHash -LiteralPath $Libraries[$Jar.Name]).Hash -ne (Get-FileHash -LiteralPath $Jar.FullName).Hash){throw 'Packaged dependency versions differ'}
        }else{$Libraries[$Jar.Name]=$Jar.FullName}
    }
}
$ClassPath=(@($ClassDirectories.ToArray())+@($Libraries.Values|Sort-Object))-join [IO.Path]::PathSeparator
$Sources=@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/message-checks') -File -Filter 'Message*Checks.java'|ForEach-Object FullName)
$Sources+=Join-Path $Root 'scripts/message-checks/CrmEmailSmtpFixture.java'
$Sources+=@(Get-ChildItem -LiteralPath (Join-Path $Root 'scripts/crm-checks') -File -Filter 'CrmEmail*DatabaseChecks.java'|ForEach-Object FullName)
$Sources+=Join-Path $Root 'scripts/crm-checks/CrmEmailFoundationChecks.java'
foreach($File in $Sources){$Inputs.Add([pscustomobject]@{Path=$File;Hash=(Get-FileHash -LiteralPath $File).Hash})}
$Inputs|ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Run 'inputs.json') -Encoding utf8NoBOM
foreach($File in $Sources){
    $Copy=Join-Path $Run ('originals/'+[IO.Path]::GetRelativePath($Root,$File))
    [IO.Directory]::CreateDirectory((Split-Path -Parent $Copy))|Out-Null
    Copy-Item -LiteralPath $File -Destination $Copy
}
function Run-Java([string]$Name,[string]$Executable,[string[]]$Arguments){
    $ArgumentsPath=Join-Path $Run "$Name.args"
    [IO.File]::WriteAllLines($ArgumentsPath,$Arguments,[Text.UTF8Encoding]::new($false))
    $Child=Start-Process -FilePath $Executable -ArgumentList @('"@'+$ArgumentsPath+'"') -WorkingDirectory $Run -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $Run "$Name.stdout.log") -RedirectStandardError (Join-Path $Run "$Name.stderr.log")
    if(-not $Child.WaitForExit(300000)){$Child.Kill($true);$Child.WaitForExit();throw "E5 database $Name timed out"}
    $Child.Refresh()
    if($Child.ExitCode -ne 0){throw "E5 database $Name failed; original diagnostics retained privately"}
}
$PreviousPassword=$env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD
$Failure=$null;$Passed=$false;$Count=0;$ArchiveCount=0;$TableCount=0
try{
    $CompileArguments=@('-encoding','UTF-8','-parameters','-cp',(Quote-Java $ClassPath),'-d',(Quote-Java (Join-Path $Run 'classes')))+@($Sources|ForEach-Object{Quote-Java $_})
    Run-Java 'compile' (Join-Path $env:JAVA_HOME 'bin/javac.exe') $CompileArguments
    $RuntimeClassPath=(Join-Path $Run 'classes')+[IO.Path]::PathSeparator+$ClassPath
    Run-Java 'foundation' (Join-Path $env:JAVA_HOME 'bin/java.exe') @('-Dfile.encoding=UTF-8','-cp',(Quote-Java $RuntimeClassPath),'com.cloudflow.crm.service.email.CrmEmailFoundationChecks')
    $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD=[Convert]::ToHexString([Security.Cryptography.RandomNumberGenerator]::GetBytes(24))
    & (Join-Path $env:JAVA_HOME 'bin/keytool.exe') '-J-Dfile.encoding=UTF-8' -genkeypair -alias mail-test -dname 'CN=localhost' -ext 'SAN=dns:localhost' -validity 2 -keyalg RSA -keysize 2048 -storetype PKCS12 -keystore (Join-Path $Run 'tls.p12') -storepass:env CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD -noprompt *> (Join-Path $Run 'certificate.log')
    if($LASTEXITCODE -ne 0){throw 'Database test TLS identity failed'}
    Sql "CREATE DATABASE $Database CHARACTER SET utf8mb4;"|Out-Null
    foreach($File in @('01.cloudflow-common.sql','05.cloudflow-crm.sql')){
        $Schema=[IO.File]::ReadAllText((Join-Path $Root "cloudflow-backend/DB/$File"))
        $Definitions=[regex]::Matches($Schema,'(?ms)^CREATE TABLE '+[char]96+'?\w+'+[char]96+'?\s*\(.*?^\) ENGINE=.*?;')
        $TableCount+=$Definitions.Count
        Sql ("USE $Database;"+[Environment]::NewLine+(($Definitions|ForEach-Object Value)-join [Environment]::NewLine))|Out-Null
    }
    if($TableCount -ne 117 -or [int](Sql "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='$Database' AND table_type='BASE TABLE';") -ne 117){throw 'Current 72 common and 45 CRM tables required'}
    $Mappers=@(Get-ChildItem -LiteralPath (Join-Path $Layers.crm 'BOOT-INF/classes/mapper') -File -Filter '*.xml'|ForEach-Object FullName)
    $Mappers+=Join-Path $Layers.auth 'BOOT-INF/classes/mapper/SysMessageDeliveryMapper.xml'
    $CommonEvent=@($Libraries.Keys|Where-Object{$_ -like 'cloudflow-common-event-*.jar'})
    if($CommonEvent.Count -ne 1){throw 'Actual common event mapper package required'}
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Zip=[IO.Compression.ZipFile]::OpenRead($Libraries[$CommonEvent[0]])
    try{
        $Entry=$Zip.GetEntry('mapper/OutboxEventMapper.xml')
        if(-not $Entry){throw 'Packaged outbox mapper missing'}
        $MapperPath=Join-Path $Run 'OutboxEventMapper.xml'
        [IO.Compression.ZipFileExtensions]::ExtractToFile($Entry,$MapperPath,$false)
        $Mappers+=$MapperPath
    }finally{$Zip.Dispose()}
    [IO.File]::WriteAllLines((Join-Path $Run 'mappers.txt'),$Mappers,[Text.UTF8Encoding]::new($false))
    $Logback=Join-Path $Run 'logback.xml'
    [IO.File]::WriteAllText($Logback,'<configuration><root level="OFF"/></configuration>',[Text.UTF8Encoding]::new($false))
    $Url="jdbc:mysql://127.0.0.1:$($State.mysqlPort)/"+$Database+'?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=Asia/Shanghai'
    Run-Java 'database' (Join-Path $env:JAVA_HOME 'bin/java.exe') @('-Dfile.encoding=UTF-8','-Duser.timezone=Asia/Shanghai',('-Dlogback.configurationFile='+(Quote-Java $Logback)),
        '-cp',(Quote-Java $RuntimeClassPath),'com.cloudflow.crm.service.email.CrmEmailDatabaseChecks',(Quote-Java $Url),(Quote-Java (Join-Path $Run 'mappers.txt')),(Quote-Java (Join-Path $Run 'tls.p12')),(Quote-Java (Join-Path $Directory 'mysql-data')))
    $Raw=[IO.File]::ReadAllText((Join-Path $Run 'database.stdout.log'))
    $Summary=[regex]::Match($Raw,'E5_DATABASE_CHECKS: assertions=(\d+); failed=0;')
    $Archive=[regex]::Match($Raw,'E5_CAMPAIGN_ARCHIVE_DATABASE: assertions=(\d+);')
    if(-not $Summary.Success -or -not $Archive.Success){throw 'Explicit database and archival completion required'}
    $Count=[int]$Summary.Groups[1].Value;$ArchiveCount=[int]$Archive.Groups[1].Value
    if($Count -le $ArchiveCount -or $ArchiveCount -lt 1000){throw 'Expected complete database and archive assertions required'}
    foreach($Input in $Inputs){if((Get-FileHash -LiteralPath $Input.Path).Hash -ne $Input.Hash){throw 'Frozen database verification input changed'}}
    $Passed=$true
}catch{$Failure=$_.Exception.Message}
finally{
    $env:CLOUDFLOW_MAIL_FIXTURE_STORE_PASSWORD=$PreviousPassword
    @{passed=$Passed;failure=$Failure;backend=$BackendRound;assertions=$Count;archiveAssertions=$ArchiveCount;inputs=$Inputs.Count;tables=$TableCount;databaseRetained=$true;originalRuntimeWritten=$false;actualPackagedDependencies=$true}|
        ConvertTo-Json -Depth 4|Set-Content -LiteralPath (Join-Path $Run 'result.json') -Encoding utf8NoBOM
}
if(-not $Passed){throw $Failure}
"E5_DATABASE: passed=true; assertions=$Count; archive=$ArchiveCount; tables=$TableCount; packaged_dependencies=true; inputs_unchanged=true"
