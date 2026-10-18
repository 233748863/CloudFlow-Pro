. (Join-Path $PSScriptRoot 'a3-auth-discovery.ps1')

function Get-A3ClusterDiscoveryText([string]$Text,[int]$AuthPort,[int]$AuthPeerPort,[int]$HrPort,[int]$HrPeerPort,[bool]$ReportClient) {
    $Discovery='spring.cloud.discovery.client.simple.instances.cloudflow-service-hr'
    $Entries=@(($Text -split '\r?\n')|Where-Object{$_.StartsWith($Discovery+'[')})
    if($HrPort -lt 1024 -or $HrPeerPort -lt 1024 -or $HrPort -eq $HrPeerPort -or $Entries.Count -ne 1 -or $Entries[0] -ne "$Discovery[0].uri=http://127.0.0.1:$HrPort"){throw 'One original HR address and distinct owned peer ports required'}
    $Text=Get-A3AuthDiscoveryText $Text $AuthPort $AuthPeerPort $ReportClient
    return $Text+"$Discovery[1].uri=http://127.0.0.1:$HrPeerPort`n"
}
