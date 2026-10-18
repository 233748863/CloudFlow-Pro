$ErrorActionPreference = 'Stop'
$Root = [IO.Path]::GetFullPath((Split-Path -Parent (Split-Path -Parent $PSScriptRoot)))
. (Join-Path $Root '.cloudflow-runtime/use-data-drive.ps1')
$ParserErrors = $null
$Tokens = $null
$Tree = [Management.Automation.Language.Parser]::ParseFile((Join-Path $Root 'scripts/resume-isolated-integration.ps1'), [ref]$Tokens, [ref]$ParserErrors)
if ($ParserErrors.Count -ne 0) { throw 'Resume script must parse' }
$Function = $Tree.Find({ param($Node) $Node -is [Management.Automation.Language.FunctionDefinitionAst] -and $Node.Name -eq 'Get-OwnedMysqlWorker' }, $true)
if (-not $Function) { throw 'Owned MySQL worker validation required' }
. ([scriptblock]::Create($Function.Extent.Text))
$Executable = 'D:\owned-mysql\mysqld.exe'
$Parent = [pscustomobject]@{ Name = 'mysqld.exe'; ProcessId = 101; ParentProcessId = 100; ExecutablePath = $Executable; CreationDate = [datetime]'2026-09-28T00:00:00' }
$Worker = [pscustomobject]@{ Name = 'mysqld.exe'; ProcessId = 102; ParentProcessId = 101; ExecutablePath = $Executable; CreationDate = [datetime]'2026-09-28T00:00:01' }
$Listener = [pscustomobject]@{ LocalAddress = '127.0.0.1'; OwningProcess = 102 }
$Assertions = 0
if ((Get-OwnedMysqlWorker @($Parent, $Worker) @($Listener) $Executable).ProcessId -ne 102) { throw 'Real parent-child identity should select the worker' }
$Assertions++
function Reject-Identity([string]$Label, [object[]]$Candidates, [object[]]$Listeners) {
    try { Get-OwnedMysqlWorker $Candidates $Listeners $Executable | Out-Null }
    catch { $script:Assertions++; Write-Output "PASS $Label"; return }
    throw "Unsafe MySQL process identity accepted: $Label"
}
Reject-Identity 'no candidates' @() @($Listener)
Reject-Identity 'single candidate is not watchdog pair' @($Worker) @($Listener)
Reject-Identity 'three matching candidates' @($Parent, $Worker, $Worker) @($Listener)
Reject-Identity 'listener missing' @($Parent, $Worker) @()
Reject-Identity 'duplicate listeners' @($Parent, $Worker) @($Listener, $Listener)
Reject-Identity 'external listener' @($Parent, $Worker) @([pscustomobject]@{ LocalAddress = '0.0.0.0'; OwningProcess = 102 })
Reject-Identity 'unrelated listener' @($Parent, $Worker) @([pscustomobject]@{ LocalAddress = '127.0.0.1'; OwningProcess = 999 })
$WrongWorker = $Worker.PSObject.Copy(); $WrongWorker.ParentProcessId = 999
Reject-Identity 'unrelated parent PID' @($Parent, $WrongWorker) @($Listener)
$WrongWorker = $Worker.PSObject.Copy(); $WrongWorker.ExecutablePath = 'D:\other\mysqld.exe'
Reject-Identity 'different executable' @($Parent, $WrongWorker) @($Listener)
$WrongWorker = $Worker.PSObject.Copy(); $WrongWorker.Name = 'java.exe'
Reject-Identity 'different process name' @($Parent, $WrongWorker) @($Listener)
$WrongParent = $Parent.PSObject.Copy(); $WrongParent.CreationDate = [datetime]'2026-09-28T00:00:02'
Reject-Identity 'reused parent PID newer than child' @($WrongParent, $Worker) @($Listener)
Write-Output "MYSQL_RESUME_IDENTITY_CHECKS: assertions=$Assertions; failed=0; real_process_changes=0"
