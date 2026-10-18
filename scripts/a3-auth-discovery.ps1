function Get-A3AuthDiscoveryText([string]$Text,[int]$OriginalPort,[int]$PeerPort,[bool]$ReportClient) {
    if($OriginalPort -lt 1024 -or $PeerPort -lt 1024 -or $OriginalPort -eq $PeerPort){throw 'Two distinct owned auth ports required'}
    $Discovery='spring.cloud.discovery.client.simple.instances.cloudflow-auth'
    $Original="$Discovery[0].uri=http://127.0.0.1:$OriginalPort"
    $Entries=@(($Text -split '\r?\n')|Where-Object{$_.StartsWith($Discovery+'[')})
    if($Entries.Count -ne 1 -or $Entries[0] -ne $Original){throw 'One original auth discovery address required'}
    if($Text -match '(?m)^spring\.cloud\.loadbalancer\.(configurations|cache|health-check)'){throw 'Existing load balancer configuration must be reviewed'}
    if($Text -match '(?m)^spring\.main\.sources='){throw 'Existing additional application sources must be reviewed'}
    if($Text -match '(?m)^spring\.cloud\.discovery\.reactive\.enabled='){throw 'Existing discovery mode must be reviewed'}
    if($ReportClient){
        if([regex]::Matches($Text,'(?m)^cloudflow\.job\.auth-url=[^\r\n]*\r?$').Count -ne 1){throw 'One explicit original auth report address required'}
        if("cloudflow.job.auth-url=http://127.0.0.1:$OriginalPort" -notin ($Text -split '\r?\n')){throw 'Report address must match original owned auth'}
        $Text=[regex]::Replace($Text,'(?m)^cloudflow\.job\.auth-url=[^\r\n]*','cloudflow.job.auth-url=')
    }
    $Lines=@("$Discovery[1].uri=http://127.0.0.1:$PeerPort",
        'spring.cloud.loadbalancer.configurations=health-check',
        'spring.cloud.loadbalancer.cache.enabled=false',
        'spring.cloud.loadbalancer.health-check.path.cloudflow-auth=/legal/public/active',
        'spring.cloud.loadbalancer.health-check.interval=2s',
        'spring.cloud.loadbalancer.health-check.initial-delay=0s',
        'spring.cloud.loadbalancer.health-check.refetch-instances=false',
        'spring.cloud.loadbalancer.health-check.update-results-list=false')
    $Lines+='spring.main.sources=file:'+(Join-Path $PSScriptRoot 'a3-auth-health-client.xml').Replace('\','/')
    # Gateway's existing WebClient builder is load-balanced; native direct health
    # probes use the independent RestTemplate and blocking discovery adapter.
    if(-not $ReportClient){$Lines+='spring.cloud.discovery.reactive.enabled=false'}
    foreach($Name in @('hr','oa','crm','workflow')){$Lines+="spring.cloud.loadbalancer.health-check.path.cloudflow-service-$Name="}
    return $Text.TrimEnd()+"`n"+($Lines -join "`n")+"`n"
}
