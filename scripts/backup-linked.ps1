# Read-only hosted dump; encrypted artifacts stay in the ignored local directory.
# No restore, upload, scheduled task or change of hosted settings.
$ErrorActionPreference = 'Stop'
$projectRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$privateRoot = Join-Path $projectRoot 'docs\no_visible_en_github\backups'
$temporaryRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$stageName = 'lexora-backup-' + [Guid]::NewGuid().ToString('N')
$stageRoot = Join-Path $temporaryRoot $stageName
$stamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ') + '-' + [Guid]::NewGuid().ToString('N').Substring(0,8)
$archive = Join-Path $privateRoot ('lexora-' + $stamp + '.lexorabak')
$keyFile = Join-Path $privateRoot ('lexora-' + $stamp + '.key')
$previousKey = $env:LEXORA_BACKUP_PASSPHRASE
$keyCreated = $false
$completed = $false
$archiveCreated = $false
$phase = 'preflight'
function Invoke-SupabaseDump([string[]]$DumpArguments,[string]$LogPath) {
  $savedPreference = $ErrorActionPreference
  try { $ErrorActionPreference = 'Continue'; & corepack pnpm exec supabase db dump @DumpArguments *> $LogPath; $dumpExit = $LASTEXITCODE }
  finally { $ErrorActionPreference = $savedPreference }
  if ($dumpExit -ne 0) { throw 'The read-only Supabase dump command failed.' }
}
function Set-PrivateBackupDirectory([string]$Path) {
  $item = Get-Item -LiteralPath $Path
  if ($item.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'Backup directory must not be a reparse point.' }
  $user = [Security.Principal.WindowsIdentity]::GetCurrent().User
  $system = [Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $permissions = [Security.AccessControl.DirectorySecurity]::new()
  $permissions.SetAccessRuleProtection($true,$false)
  $permissions.SetOwner($user)
  foreach ($identity in @($user,$system)) {
    $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity,[Security.AccessControl.FileSystemRights]::FullControl,([Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [Security.AccessControl.InheritanceFlags]::ObjectInherit),[Security.AccessControl.PropagationFlags]::None,[Security.AccessControl.AccessControlType]::Allow)
    $permissions.AddAccessRule($rule)
  }
  Set-Acl -LiteralPath $Path -AclObject $permissions
}
Push-Location -LiteralPath $projectRoot
try {
  $projectRef = (Get-Content -LiteralPath 'supabase/.temp/project-ref' -Raw -Encoding UTF8).Trim()
  if ($projectRef -ne 'goivohplnfhfkrgqlzgt') { throw 'The linked project is not Lexora production.' }
  $poolerMetadata = Get-Content -LiteralPath 'supabase/.temp/pooler-url' -Raw -Encoding UTF8
  if (-not $poolerMetadata.Contains($projectRef)) { throw 'The linked pooler metadata does not match Lexora.' }
  & git check-ignore --quiet -- $archive
  if ($LASTEXITCODE -ne 0) { throw 'Backup destination must be ignored by Git.' }
  [IO.Directory]::CreateDirectory($privateRoot) | Out-Null
  Set-PrivateBackupDirectory $privateRoot
  [IO.Directory]::CreateDirectory($stageRoot) | Out-Null
  Set-PrivateBackupDirectory $stageRoot
  $schemas = 'public,auth,supabase_migrations'
  $phase = 'roles'
  Invoke-SupabaseDump -DumpArguments @('--linked','--role-only','--file',(Join-Path $stageRoot 'roles.sql')) -LogPath (Join-Path $stageRoot 'roles.log')
  $phase = 'migration snapshot before schema'
  Invoke-SupabaseDump -DumpArguments @('--linked','--schema','supabase_migrations','--data-only','--use-copy','--file',(Join-Path $stageRoot 'before-migrations.sql')) -LogPath (Join-Path $stageRoot 'before-migrations.log')
  $beforeJson = & node scripts/backup-cli.mjs schema-version (Join-Path $stageRoot 'before-migrations.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Could not read the initial migration snapshot.' }
  $beforeHistory = $beforeJson | ConvertFrom-Json
  $phase = 'schema'
  Invoke-SupabaseDump -DumpArguments @('--linked','--schema',$schemas,'--file',(Join-Path $stageRoot 'schema.sql')) -LogPath (Join-Path $stageRoot 'schema.log')
  $phase = 'data'
  Invoke-SupabaseDump -DumpArguments @('--linked','--schema',$schemas,'--data-only','--use-copy','--file',(Join-Path $stageRoot 'data.sql')) -LogPath (Join-Path $stageRoot 'data.log')
  $phase = 'version validation'
  $historyJson = & node scripts/backup-cli.mjs schema-version (Join-Path $stageRoot 'data.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Could not validate the dumped migration history.' }
  $history = $historyJson | ConvertFrom-Json
  if ($history.sha256 -ne $beforeHistory.sha256 -or $history.count -ne $beforeHistory.count -or $history.version -ne $beforeHistory.version) { throw 'Migration history changed during backup; retry with deployments paused.' }
  $localMigration = Get-ChildItem -LiteralPath 'supabase/migrations' -File -Filter '*.sql' | Sort-Object Name | Select-Object -Last 1
  $supportedVersion = [Int64]$localMigration.Name.Substring(0,14)
  if ([Int64]$history.version -gt $supportedVersion) { throw 'The hosted database is newer than this checkout.' }
  $commit = (& git rev-parse HEAD).Trim()
  $manifest = [ordered]@{
    format = 'lexora-operational-postgres-dump'
    formatVersion = 1
    sourceProject = $projectRef
    exportedAtUtc = [DateTime]::UtcNow.ToString('o')
    schemaVersion = [Int64]$history.version
    migrationCount = [Int32]$history.count
    migrationHistorySha256 = $history.sha256
    toolCommit = $commit
    files = @('roles.sql','schema.sql','data.sql')
    excludes = @('provider secrets','JWT signing keys','SMTP configuration','Storage objects','Vercel settings','private design documents')
  }
  [IO.File]::WriteAllText((Join-Path $stageRoot 'manifest.json'),($manifest | ConvertTo-Json -Depth 4),[Text.UTF8Encoding]::new($false))
  $payload = Join-Path $stageRoot 'payload.tar.gz'
  & tar -czf $payload -C $stageRoot roles.sql schema.sql data.sql manifest.json
  if ($LASTEXITCODE -ne 0) { throw 'Could not package the dump.' }
  $phase = 'encryption'
  $keyBytes = New-Object byte[] 48
  $generator = [Security.Cryptography.RandomNumberGenerator]::Create()
  try { $generator.GetBytes($keyBytes) } finally { $generator.Dispose() }
  $env:LEXORA_BACKUP_PASSPHRASE = [Convert]::ToBase64String($keyBytes)
  [Array]::Clear($keyBytes,0,$keyBytes.Length)
  $keyHandle = [IO.File]::Open($keyFile,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None)
  $keyCreated = $true
  $writer = [IO.StreamWriter]::new($keyHandle,[Text.UTF8Encoding]::new($false))
  try { $writer.Write($env:LEXORA_BACKUP_PASSPHRASE); $writer.Flush(); $keyHandle.Flush($true) } finally { $writer.Dispose() }
  & node scripts/backup-cli.mjs seal $payload $archive ([string]$history.version)
  if ($LASTEXITCODE -ne 0) { throw 'Could not encrypt the dump.' }
  $archiveCreated = $true
  $phase = 'integrity validation'
  & node scripts/backup-cli.mjs open $archive (Join-Path $stageRoot 'verified.tar.gz') ([string]$history.version)
  if ($LASTEXITCODE -ne 0) { throw 'The encrypted dump did not pass integrity validation.' }
  $completed = $true
  Write-Output ('Encrypted backup: ' + $archive)
  Write-Output ('Separate recovery key: ' + $keyFile)
  Write-Output ('Verified schema: ' + $history.version + '; migrations: ' + $history.count)
} catch {
  Write-Error ('Backup failed during ' + $phase + ': ' + $_.Exception.Message)
} finally {
  $env:LEXORA_BACKUP_PASSPHRASE = $previousKey
  if (-not $completed -and $archiveCreated) { Remove-Item -LiteralPath $archive -Force }
  if (-not $completed -and $keyCreated -and -not (Test-Path -LiteralPath $archive)) { Remove-Item -LiteralPath $keyFile -Force }
  if (Test-Path -LiteralPath $stageRoot) {
    $resolvedStage = [IO.Path]::GetFullPath((Get-Item -LiteralPath $stageRoot).FullName)
    $stageItem = Get-Item -LiteralPath $stageRoot
    if ([IO.Path]::GetDirectoryName($resolvedStage).TrimEnd('\') -ne $temporaryRoot.TrimEnd('\') -or [IO.Path]::GetFileName($resolvedStage) -ne $stageName -or $stageItem.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint)) { throw 'Refusing unsafe temporary cleanup.' }
    foreach ($entry in Get-ChildItem -LiteralPath $resolvedStage -Force) { if ($entry.Attributes.HasFlag([IO.FileAttributes]::ReparsePoint) -or $entry.PSIsContainer) { throw 'Unexpected entry in backup staging directory.' } }
    Remove-Item -LiteralPath $resolvedStage -Recurse -Force
  }
  Pop-Location
}
if (-not $completed) { exit 1 }
