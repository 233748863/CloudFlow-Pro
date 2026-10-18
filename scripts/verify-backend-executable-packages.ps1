param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round,
    [ValidatePattern('^r[1-9][0-9]*$')][string]$BackendRound='r111')
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "backend-executable-verification-20261006-$Round"
if(Test-Path -LiteralPath $Output){throw 'Evidence occupied; retain the original verification'}
[IO.Directory]::CreateDirectory($Output)|Out-Null
Copy-Item -LiteralPath $PSCommandPath -Destination (Join-Path $Output 'original.ps1')
$Inputs=@(Get-Content -LiteralPath (Join-Path $Evidence "h3-portal-finance-20261002-backend-$BackendRound-inputs.json") -Raw|ConvertFrom-Json)
$Inputs+=[pscustomobject]@{Path='scripts/verify-backend-executable-packages.ps1';Hash=(Get-FileHash -LiteralPath $PSCommandPath).Hash}
function Assert-Inputs {foreach($Item in $Inputs){if((Get-FileHash -LiteralPath (Join-Path $Root $Item.Path)).Hash -ne $Item.Hash){throw 'Package verification input changed'}}}
Assert-Inputs
$Inputs|ConvertTo-Json|Set-Content -LiteralPath (Join-Path $Output 'inputs.json') -Encoding utf8NoBOM
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Java=(Resolve-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin/java.exe')).Path
$Definitions=@(
    @{Name='auth';Module='cloudflow-auth';Main='com.cloudflow.auth.AuthApplication'},
    @{Name='gateway';Module='cloudflow-gateway';Main='com.cloudflow.gateway.GatewayApplication'},
    @{Name='oa';Module='cloudflow-service-oa';Main='com.cloudflow.oa.OaApplication'},
    @{Name='crm';Module='cloudflow-service-crm';Main='com.cloudflow.crm.CrmApplication'},
    @{Name='workflow';Module='cloudflow-service-workflow';Main='com.cloudflow.workflow.WorkflowApplication'},
    @{Name='hr';Module='cloudflow-service-hr';Main='com.cloudflow.hr.HrServiceApplication'}
)
$Results=[Collections.Generic.List[object]]::new()
foreach($Definition in $Definitions){
    $Target=Join-Path $Root "cloudflow-backend/$($Definition.Module)/target"
    $Jars=@(Get-ChildItem -LiteralPath $Target -Filter '*.jar' -File)
    if($Jars.Count -ne 1){throw 'Exactly one service artifact required'}
    $Jar=$Jars[0]
    $Hash=(Get-FileHash -LiteralPath $Jar.FullName).Hash
    $Directory=Join-Path $Output $Definition.Name
    [IO.Directory]::CreateDirectory($Directory)|Out-Null
    Copy-Item -LiteralPath $Jar.FullName -Destination (Join-Path $Directory $Jar.Name)
    if((Get-FileHash -LiteralPath (Join-Path $Directory $Jar.Name)).Hash -ne $Hash){throw 'Retained artifact hash mismatch'}
    $Zip=[IO.Compression.ZipFile]::OpenRead($Jar.FullName)
    try{
        $Reader=[IO.StreamReader]::new($Zip.GetEntry('META-INF/MANIFEST.MF').Open())
        try{$Manifest=$Reader.ReadToEnd()}finally{$Reader.Dispose()}
        if($Manifest -notmatch '(?m)^Main-Class: org\.springframework\.boot\.loader\.launch\.JarLauncher\r?$' -or $Manifest -notmatch ('(?m)^Start-Class: '+[regex]::Escape($Definition.Main)+'\r?$')){throw 'Executable manifest mismatch'}
        $Libs=@($Zip.Entries|Where-Object{$_.FullName -like 'BOOT-INF/lib/*.jar'}).Count
        if($Libs -eq 0 -or $null -eq $Zip.GetEntry('BOOT-INF/layers.idx') -or $null -eq $Zip.GetEntry('BOOT-INF/classes/'+$Definition.Main.Replace('.','/')+'.class')){throw 'Executable classes, libraries and layers required'}
        [IO.File]::WriteAllText((Join-Path $Directory 'MANIFEST.MF'),$Manifest)
    }finally{$Zip.Dispose()}
    $Process=Start-Process -FilePath $Java -WindowStyle Hidden -PassThru -WorkingDirectory $Directory -ArgumentList @('-Djarmode=layertools','-jar',('"'+$Jar.FullName+'"'),'list') -RedirectStandardOutput (Join-Path $Directory 'layers.log') -RedirectStandardError (Join-Path $Directory 'layers.err')
    $Process.WaitForExit();$Process.Refresh()
    if($Process.ExitCode -ne 0){throw 'Layer listing failed'}
    $Layers=@(Get-Content -LiteralPath (Join-Path $Directory 'layers.log')|Where-Object{$_})
    if(($Layers -join ',') -ne 'dependencies,spring-boot-loader,snapshot-dependencies,application'){throw 'Unexpected Docker layer layout'}
    if($Definition.Name -eq 'hr'){
        $Extract=Join-Path $Directory 'extracted'
        [IO.Directory]::CreateDirectory($Extract)|Out-Null
        $Process=Start-Process -FilePath $Java -WindowStyle Hidden -PassThru -WorkingDirectory $Extract -ArgumentList @('-Djarmode=layertools','-jar',('"'+$Jar.FullName+'"'),'extract') -RedirectStandardOutput (Join-Path $Directory 'extract.log') -RedirectStandardError (Join-Path $Directory 'extract.err')
        $Process.WaitForExit();$Process.Refresh()
        if($Process.ExitCode -ne 0 -or -not (Test-Path -LiteralPath (Join-Path $Extract 'spring-boot-loader/org/springframework/boot/loader/launch/JarLauncher.class')) -or -not (Test-Path -LiteralPath (Join-Path $Extract 'application/BOOT-INF/classes/com/cloudflow/hr/HrServiceApplication.class'))){throw 'Docker-compatible HR layer extraction failed'}
        $ExtractedLibs=0
        foreach($Layer in $Layers){
            $LibraryPath=Join-Path $Extract "$Layer/BOOT-INF/lib"
            if(Test-Path -LiteralPath $LibraryPath){$ExtractedLibs+=@(Get-ChildItem -LiteralPath $LibraryPath -Filter '*.jar' -File).Count}
        }
        if($ExtractedLibs -ne $Libs){throw 'Extracted dependency count mismatch'}
    }
    if((Get-FileHash -LiteralPath $Jar.FullName).Hash -ne $Hash){throw 'Service artifact changed during validation'}
    $Results.Add([pscustomobject]@{Name=$Definition.Name;Path=$Jar.FullName.Substring($Root.Length+1);Hash=$Hash;Bytes=$Jar.Length;Main=$Definition.Main;Libraries=$Libs;Layers=$Layers;LayerListExit=0;Extracted=($Definition.Name -eq 'hr')})
    Write-Output "EXECUTABLE_PACKAGE: service=$($Definition.Name); manifest=true; dependencies=$Libs; layers=4; exit=0"
}
$Common=@(Get-ChildItem -LiteralPath (Join-Path $Root 'cloudflow-backend/cloudflow-common') -Directory -Filter 'cloudflow-common-*'|ForEach-Object{Get-ChildItem -LiteralPath (Join-Path $_.FullName 'target') -Filter '*.jar' -File -ErrorAction Stop})
if($Common.Count -eq 0){throw 'Common artifacts missing'}
$CommonResults=@(foreach($Jar in $Common){
    $Zip=[IO.Compression.ZipFile]::OpenRead($Jar.FullName)
    try{
        if(@($Zip.Entries|Where-Object{$_.FullName.StartsWith('BOOT-INF/')}).Count -ne 0){throw 'Common library was repackaged unexpectedly'}
        [pscustomobject]@{Path=$Jar.FullName.Substring($Root.Length+1);Hash=(Get-FileHash -LiteralPath $Jar.FullName).Hash;OrdinaryJar=$true}
    }finally{$Zip.Dispose()}
})
Assert-Inputs
[pscustomobject]@{Passed=$true;BackendRound=$BackendRound;Inputs=$Inputs.Count;InputChanges=0;Services=@($Results);CommonLibraries=$CommonResults;DockerImageExecuted=$false;ActualServicesStarted=$false;GlobalComplete=$false}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $Output 'result.json') -Encoding utf8NoBOM
"EXECUTABLE_PACKAGE_SUMMARY: services=$($Results.Count); ordinary_common=$($Common.Count); inputs=$($Inputs.Count); changed=0; docker_image_executed=false"
