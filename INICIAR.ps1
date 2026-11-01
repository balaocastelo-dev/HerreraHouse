# ==========================================================
#  HERRERA HOUSE IA - iniciar (um clique)
#  - confere o Node.js, instala dependências na 1a vez
#  - cria o .env com chave secreta aleatória
#  - faz backup diário do banco
#  - sobe o sistema e abre o navegador
# ==========================================================
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'Herrera HOUSE IA - servidor (feche para parar)'
Set-Location -LiteralPath $PSScriptRoot

function Linha($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
Linha ''
Linha '  =========================================' DarkYellow
Linha '    HERRERA HOUSE IA  -  iniciando...' Yellow
Linha '  =========================================' DarkYellow

# 1) Node.js 22.13 ou mais novo
try { $v = (node -v) -replace 'v', '' } catch { $v = $null }
if (-not $v) {
  Linha '  [ERRO] Node.js não encontrado. Instale com:  winget install OpenJS.NodeJS.LTS' Red
  Read-Host '  Enter para sair'; exit 1
}
$p = $v.Split('.') | ForEach-Object { [int]$_ }
if ($p[0] -lt 22 -or ($p[0] -eq 22 -and $p[1] -lt 13)) {
  Linha "  [ERRO] Node.js $v é antigo. Precisa da versão 22.13 ou mais nova (winget upgrade OpenJS.NodeJS.LTS)." Red
  Read-Host '  Enter para sair'; exit 1
}
Linha "  [ok] Node.js $v" Green

# 2) Dependências
$faltam = @((Get-Content 'package.json' -Raw | ConvertFrom-Json).dependencies.PSObject.Properties.Name | Where-Object { -not (Test-Path "node_modules\$_") })
if ($faltam.Count -gt 0) {
  Linha '  [..] Instalando componentes novos...' Cyan
  npm install --omit=dev --no-audit --no-fund
  if ($LASTEXITCODE -ne 0) { Linha '  [ERRO] Falha no npm install.' Red; Read-Host '  Enter para sair'; exit 1 }
}
Linha '  [ok] Componentes instalados' Green

# 3) Configuração
if (-not (Test-Path '.env')) {
  $bytes = New-Object byte[] 48; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  $secret = [Convert]::ToBase64String($bytes)
  $bytes2 = New-Object byte[] 18; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes2)
  $verify = ([Convert]::ToBase64String($bytes2)) -replace '[+/=]', ''
  $conf = Get-Content '.env.example' -Raw -Encoding UTF8
  $conf = $conf -replace '(?m)^SECRET_KEY=.*$', "SECRET_KEY=$secret"
  $conf = $conf -replace '(?m)^WA_VERIFY_TOKEN=.*$', "WA_VERIFY_TOKEN=$verify"
  [IO.File]::WriteAllText((Join-Path $PSScriptRoot '.env'), $conf, (New-Object Text.UTF8Encoding($false)))
  Linha '  [ok] Configuração criada (.env com chave secreta nova)' Green
} else { Linha '  [ok] Configuração encontrada' Green }

# porta
$porta = 3333
$m = Select-String -Path '.env' -Pattern '^PORT=(\d+)' | Select-Object -First 1
if ($m) { $porta = [int]$m.Matches[0].Groups[1].Value }
$url = "http://localhost:$porta"

# já está rodando? só abre o navegador
$emUso = Get-NetTCPConnection -LocalPort $porta -State Listen -ErrorAction SilentlyContinue
if ($emUso) {
  Linha "  [ok] O sistema já está aberto. Abrindo $url" Green
  Start-Process $url; Start-Sleep 2; exit 0
}

# 4) Backup diário do banco (guarda 14 dias).
# O resolvedor é o mesmo do sistema: data/house.db, ou o arquivo anterior se o novo ainda não existir.
$banco = 'data\house.db'
try {
  $resolvido = node -e "const fs=require('fs');const path=require('path');const a=require('./src/db-arquivo');process.stdout.write(a.caminhoDoBanco(path.resolve('data'),{existe:(p)=>fs.existsSync(p)}));"
  if ($resolvido) { $banco = $resolvido }
} catch {}
if (Test-Path -LiteralPath $banco) {
  $dia = Get-Date -Format 'yyyy-MM-dd'
  $dest = Join-Path 'data\backups' $dia
  if (-not (Test-Path $dest)) {
    New-Item -ItemType Directory -Force -Path $dest | Out-Null
    Copy-Item (Join-Path (Split-Path -Parent $banco) ((Split-Path -Leaf $banco) + '*')) $dest -Force
    Get-ChildItem 'data\backups' -Directory | Sort-Object Name -Descending | Select-Object -Skip 14 | Remove-Item -Recurse -Force
    Linha "  [ok] Backup do banco: data\backups\$dia" Green
  }
}

# 5) Atalho na Área de Trabalho
$desktop = [Environment]::GetFolderPath('Desktop')
$atalho = Join-Path $desktop 'Herrera HOUSE IA.lnk'
if (-not (Test-Path $atalho)) {
  $ws = New-Object -ComObject WScript.Shell
  $s = $ws.CreateShortcut($atalho)
  $s.TargetPath = "$env:WINDIR\System32\WindowsPowerShell\v1.0\powershell.exe"
  $s.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$PSScriptRoot\INICIAR.ps1`""
  $s.WorkingDirectory = $PSScriptRoot
  $s.IconLocation = "$env:WINDIR\System32\shell32.dll,19"
  $s.Save()
  Linha '  [ok] Atalho "Herrera HOUSE IA" criado na Área de Trabalho' Green
}

# 6) Ollama (IA local) - só avisa
try { Invoke-RestMethod 'http://127.0.0.1:11434/api/tags' -TimeoutSec 2 | Out-Null; Linha '  [ok] IA local (Ollama) ativa' Green }
catch { Linha '  [!] Ollama fechado: o sistema funciona, mas sem sugestões da IA no WhatsApp.' Yellow }

# 7) Sobe o servidor e abre o navegador
Start-Job -ScriptBlock { param($u) Start-Sleep 3; Start-Process $u } -ArgumentList $url | Out-Null
node --disable-warning=ExperimentalWarning server.js
Linha ''
Linha '  O sistema parou. Se apareceu erro acima, tire um print e envie ao suporte.' Yellow
Read-Host '  Enter para fechar'
