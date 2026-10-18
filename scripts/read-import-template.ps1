param([Parameter(Mandatory=$true)][string]$TemplatePath,
    [Parameter(Mandatory=$true)][string]$RunDirectory)
$ErrorActionPreference='Stop'
. 'D:\CloudFlowPro\.cloudflow-runtime\use-data-drive.ps1'
$AllowedRoot=[IO.Path]::GetFullPath('D:\CloudFlowPro\.cloudflow-runtime\batch-g-integration').TrimEnd('\')+'\'
$ResolvedRun=(Resolve-Path -LiteralPath $RunDirectory).Path
$ResolvedTemplate=(Resolve-Path -LiteralPath $TemplatePath).Path
if(-not $ResolvedRun.StartsWith($AllowedRoot,[StringComparison]::OrdinalIgnoreCase) -or
    (Split-Path -Leaf $ResolvedRun) -notmatch '^[a-f0-9]{32}$' -or
    [IO.Path]::GetDirectoryName($ResolvedTemplate) -ne $ResolvedRun){throw 'Only this owned run template may be read'}
foreach($EntryPath in @($ResolvedRun,$ResolvedTemplate)){
    if((Get-Item -LiteralPath $EntryPath).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Redirected template refused'}
}
Add-Type -AssemblyName System.IO.Compression.FileSystem
$Archive=[IO.Compression.ZipFile]::OpenRead($ResolvedTemplate)
try {
    function Read-TemplateXml([string]$EntryName){
        $Entry=$Archive.GetEntry($EntryName)
        if(-not $Entry){return $null}
        $Stream=$Entry.Open()
        $Settings=[Xml.XmlReaderSettings]::new()
        $Settings.DtdProcessing=[Xml.DtdProcessing]::Prohibit
        $Settings.XmlResolver=$null
        $XmlReader=[Xml.XmlReader]::Create($Stream,$Settings)
        try{$Document=[Xml.XmlDocument]::new();$Document.XmlResolver=$null;$Document.Load($XmlReader);return ,$Document}
        finally{$XmlReader.Dispose();$Stream.Dispose()}
    }
    $Shared=Read-TemplateXml 'xl/sharedStrings.xml'
    $SharedValues=@(if($Shared){foreach($Item in $Shared.GetElementsByTagName('si')){$Item.InnerText}})
    $Workbook=Read-TemplateXml 'xl/workbook.xml'
    $Relations=Read-TemplateXml 'xl/_rels/workbook.xml.rels'
    $Sheets=@{}
    foreach($Sheet in $Workbook.GetElementsByTagName('sheet')){
        if($Sheet.name -notin @('导入数据','填写说明')){continue}
        $RelationId=$Sheet.GetAttribute('id','http://schemas.openxmlformats.org/officeDocument/2006/relationships')
        $Relation=@($Relations.GetElementsByTagName('Relationship')|Where-Object Id -EQ $RelationId)
        if($Relation.Count -ne 1){throw 'Template worksheet relationship missing'}
        $Target=[string]$Relation[0].Target
        if($Target.Contains('..') -or $Target.Contains('\')){throw 'Template worksheet path refused'}
        $SheetXml=Read-TemplateXml $(if($Target.StartsWith('/')){$Target.TrimStart('/')}else{'xl/'+$Target})
        $SheetRows=@(foreach($SheetRow in $SheetXml.GetElementsByTagName('row')){
            $Cells=@(foreach($Cell in $SheetRow.GetElementsByTagName('c')){
                $CellValue=if($Cell.t -eq 'inlineStr'){$Cell.is.InnerText}elseif($Cell.t -eq 's'){$SharedValues[[int]$Cell.v]}else{[string]$Cell.v}
                [pscustomobject]@{cell=[string]$Cell.r;value=[string]$CellValue}
            })
            [pscustomobject]@{row=[int]$SheetRow.r;cells=$Cells}
        })
        $Sheets[[string]$Sheet.name]=$SheetRows
    }
    if(-not $Sheets.ContainsKey('导入数据')){throw 'Actual template data sheet missing'}
    ConvertTo-Json -InputObject $Sheets -Depth 8 -Compress
} finally {$Archive.Dispose()}
