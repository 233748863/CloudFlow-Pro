$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime/use-data-drive.ps1'
$Run='D:\CloudFlowPro\.cloudflow-runtime\batch-g-integration\9799534e1a3a47b5958330f14ae16dc7'
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned runtime required'}
$Services=@($State.services|Where-Object name -In @('auth','hr','oa','crm','workflow'))
if($Services.Count -ne 5){throw 'Five job services required'}
foreach($Service in $Services){
    $Directory=Join-Path $Run $Service.name
    $Config=Join-Path $Directory 'integration.properties'
    foreach($Candidate in @($Run,$Directory,$Config)){
        if((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected runtime rejected'}
    }
    $Owner=@($State.processes|Where-Object name -EQ $Service.name)
    if($Owner.Count -ne 1 -or $Owner[0].marker -ne (Join-Path $Directory 'service.args')){throw 'Owned marker mismatch'}
    $Process=Get-CimInstance Win32_Process -Filter "ProcessId=$($Owner[0].id)"
    if(!$Process -or $Process.Name -ne 'java.exe' -or !$Process.CommandLine.Contains($Owner[0].marker)){throw 'Owned Java process required'}
    $Lines=Get-Content -LiteralPath $Config
    if('server.address=127.0.0.1' -notin $Lines -or "server.port=$($Service.port)" -notin $Lines){throw 'Loopback configuration required'}
}
function Protect-OwnedFile([string]$Path){
    $Acl=Get-Acl -LiteralPath $Path
    $Acl.SetAccessRuleProtection($true,$false)
    $Identity=[Security.Principal.WindowsIdentity]::GetCurrent().User
    $Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new($Identity,'FullControl','Allow'))
    $Acl.AddAccessRule([Security.AccessControl.FileSystemAccessRule]::new([Security.Principal.SecurityIdentifier]::new('S-1-5-18'),'FullControl','Allow'))
    Set-Acl -LiteralPath $Path -AclObject $Acl
}
$KeyPath=Join-Path $Run 'job-credentials.dpapi'
$Names=@('cloudflow-auth','cloudflow-service-hr','cloudflow-service-oa','cloudflow-service-crm','cloudflow-service-workflow')
if(Test-Path -LiteralPath $KeyPath){
    if((Get-Item -LiteralPath $KeyPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected credentials rejected'}
    $Plain=[Security.Cryptography.ProtectedData]::Unprotect([IO.File]::ReadAllBytes($KeyPath),$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    $Keys=[Text.Encoding]::UTF8.GetString($Plain)|ConvertFrom-Json -AsHashtable
} else {
    $Keys=@{}
    foreach($Name in $Names){$Keys[$Name]=[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))}
    $Plain=[Text.Encoding]::UTF8.GetBytes(($Keys|ConvertTo-Json -Compress))
    $Cipher=[Security.Cryptography.ProtectedData]::Protect($Plain,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser)
    [IO.File]::WriteAllBytes($KeyPath,$Cipher)
}
Protect-OwnedFile $KeyPath
if($Keys.Count -ne 5 -or @($Keys.Values|Select-Object -Unique).Count -ne 5){throw 'Independent service credentials required'}
foreach($Name in $Names){if([Convert]::FromBase64String($Keys[$Name]).Length -ne 32){throw 'Invalid key length'}}
foreach($Service in $Services){
    $Config=Join-Path (Join-Path $Run $Service.name) 'integration.properties'
    $Current=@(Get-Content -LiteralPath $Config)
    $Own=if($Service.name -eq 'auth'){'cloudflow-auth'}else{"cloudflow-service-$($Service.name)"}
    $Required=if($Service.name -eq 'auth'){$Names}else{@('cloudflow-auth',$Own)}
    $Existing=@($Current|Where-Object{$_ -match '^cloudflow\.job\.internal-auth\.keys\.'})
    $Expected=@($Required|ForEach-Object{"cloudflow.job.internal-auth.keys.$_=$($Keys[$_])"})
    if($Existing.Count -gt 0 -and (@(Compare-Object $Existing $Expected).Count -gt 0)){throw 'Existing credential configuration differs; retain it'}
    Protect-OwnedFile $Config
    if($Existing.Count -eq 0){[IO.File]::WriteAllLines($Config,(@($Current)+@($Expected)),[Text.UTF8Encoding]::new($false))}
}
[Array]::Clear($Plain,0,$Plain.Length)
'OWNED_JOB_CREDENTIALS: services=5; independent_keys=5; bytes_per_key=32; stored_master=CurrentUserDPAPI; file_acl_restricted=true; values_printed=0; production_modified=false'
