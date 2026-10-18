param([Parameter(Mandatory=$true)][ValidatePattern('^r[1-9][0-9]*$')][string]$Round)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$Root='D:\CloudFlowPro'
$Run=Join-Path $Root '.cloudflow-runtime/batch-g-integration/9799534e1a3a47b5958330f14ae16dc7'
$Evidence=Join-Path $Root '.cloudflow-runtime/full-prd-20260915/approved-runtime'
$Output=Join-Path $Evidence "d2-redis-pools-20261005-$Round"
$State=Get-Content -LiteralPath (Join-Path $Run 'state.json') -Raw|ConvertFrom-Json
if($State.status -ne 'RUNNING' -or [IO.Path]::GetFullPath($State.run) -ne $Run){throw 'Owned running fixture required'}
foreach($Entry in $State.processes){
    $Observed=Get-CimInstance Win32_Process -Filter "ProcessId=$($Entry.id)"
    if(-not $Observed -or -not $Observed.CommandLine.Contains($Entry.marker)){throw 'Owned process identity mismatch'}
}
$RedisOwner=@($State.processes|Where-Object name -EQ redis)
if($RedisOwner.Count -ne 1 -or $State.redisPort -lt 1024 -or $State.redisPort -gt 65535){throw 'Owned Redis required'}
$RedisConfig=[IO.Path]::GetFullPath((Join-Path $Run $RedisOwner[0].marker))
if((Split-Path -Parent $RedisConfig) -ne $Run){throw 'Redis configuration outside fixture'}
$RedisLines=[IO.File]::ReadAllLines($RedisConfig)
if('bind 127.0.0.1' -notin $RedisLines -or "port $($State.redisPort)" -notin $RedisLines){throw 'Owned loopback Redis required'}
$Secrets=@($RedisLines|Where-Object {$_ -match '^requirepass '})
if($Secrets.Count -ne 1){throw 'One existing Redis credential required'}
$Secret=$Secrets[0].Substring('requirepass '.Length)
$Private=Join-Path $Run "private/d2-redis-pools-$Round"
$Timeouts=@{auth=3000;hr=10000;oa=3000;crm=10000;workflow=5000;gateway=3000}
foreach($Candidate in @($Root,$Run,(Join-Path $Run 'private'),$RedisConfig)){
    if((Get-Item -LiteralPath $Candidate).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected fixture path rejected'}
}
if((Test-Path -LiteralPath $Output) -or (Test-Path -LiteralPath $Private)){throw 'Retain existing pool evidence'}
$Files=@()
foreach($Service in $State.services){
    $File=Join-Path $Run "$($Service.name)/integration.properties"
    if((Get-Item -LiteralPath $File).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected service settings rejected'}
    $Lines=[IO.File]::ReadAllLines($File)
    foreach($Required in @('spring.data.redis.host=127.0.0.1',"spring.data.redis.port=$($State.redisPort)",'spring.data.redis.database=0',"spring.data.redis.password=$Secret")){
        if($Required -notin $Lines){throw 'Existing Redis connection settings differ from owned fixture'}
    }
    if(@($Lines|Where-Object {$_ -match '^spring\.redis\.redisson\.(file|config)='}).Count){throw 'Existing explicit Redisson settings require separate review'}
    $Files+=[pscustomobject]@{Service=$Service.name;Path=$File;OriginalHash=(Get-FileHash -LiteralPath $File).Hash;AppliedHash=$null;Backup=(Join-Path $Private "$($Service.name).properties.original");Config=(Join-Path $Private "$($Service.name).redisson.yml");ConfigHash=$null;Timeout=$Timeouts[$Service.name]}
}
[IO.Directory]::CreateDirectory($Output)|Out-Null
[IO.Directory]::CreateDirectory($Private)|Out-Null
foreach($File in $Files){
    Copy-Item -LiteralPath $File.Path -Destination $File.Backup
    if((Get-FileHash -LiteralPath $File.Backup).Hash -ne $File.OriginalHash){throw 'Settings backup mismatch'}
}
# Use the already configured connection, password and database; retain Redisson's pool maxima.
$QuotedSecret=ConvertTo-Json -InputObject $Secret -Compress
foreach($File in $Files){
    [IO.File]::WriteAllLines($File.Config,@('singleServerConfig:',"  address: `"redis://127.0.0.1:$($State.redisPort)`"","  password: $QuotedSecret",'  database: 0',"  timeout: $($File.Timeout)",'  connectionMinimumIdleSize: 4','  connectionPoolSize: 64','  subscriptionConnectionMinimumIdleSize: 1','  subscriptionConnectionPoolSize: 50'),[Text.UTF8Encoding]::new($false))
    $File.ConfigHash=(Get-FileHash -LiteralPath $File.Config).Hash
}
$Manifest=[ordered]@{Round=$Round;Files=$Files;MinimumIdle=4;PoolMaximum=64;SubscriptionMinimumIdle=1;SubscriptionPoolMaximum=50;Applied=$false;Loaded=$false;ExistingRedisRestarted=$false;KeysDeleted=0;ProductionModified=$false}
$ManifestPath=Join-Path $Output 'manifest.json'
$Manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $ManifestPath -Encoding utf8NoBOM
foreach($File in $Files){
    if((Get-FileHash -LiteralPath $File.Path).Hash -ne $File.OriginalHash){throw 'Concurrent service settings change'}
    $Lines=[IO.File]::ReadAllLines($File.Path)
    [IO.File]::WriteAllLines($File.Path,@($Lines)+@('spring.redis.redisson.file=file:'+$File.Config.Replace('\','/')),[Text.UTF8Encoding]::new($false))
    $File.AppliedHash=(Get-FileHash -LiteralPath $File.Path).Hash
    $Manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $ManifestPath -Encoding utf8NoBOM
}
$Manifest.Applied=$true
$Manifest|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $ManifestPath -Encoding utf8NoBOM
"D2_OWNED_REDIS_POOLS_CONFIGURED: services=$($Files.Count); minimum_idle=4; maximum=64; subscription_minimum_idle=1; subscription_maximum=50; loaded=false; redis_restarted=false; keys_deleted=0"
