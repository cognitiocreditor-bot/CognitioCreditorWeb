<#
.SYNOPSIS
    Genera un nuevo archivo de Agente Personalizado (.agents/agents/<nombre>.md) para Antigravity.

.DESCRIPTION
    Crea la plantilla con frontmatter YAML validado y el esquema de instrucciones centrales
    de acuerdo con la especificación de Google Antigravity.

.PARAMETER Name
    Nombre identificador del agente en formato kebab-case (ej. test-runner, db-migrator).

.PARAMETER Description
    Descripción concisa del rol y criterios de invocación del agente.

.PARAMETER Model
    Modelo a utilizar (ej. 'flash', 'pro'). Por defecto 'flash'.

.PARAMETER Tools
    Herramientas autorizadas separadas por comas.

.EXAMPLE
    .\New-CustomAgent.ps1 -Name "doc-generator" -Description "Genera y actualiza documentación técnica del proyecto"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Name,

    [Parameter(Mandatory = $true)]
    [string]$Description,

    [string]$Model = "flash",

    [string[]]$Tools = @("view_file", "replace_file_content", "run_command"),

    [switch]$MainAgent = $true,
    [switch]$Subagent = $true,
    [string]$CommandExecutionPolicy = "auto",
    [string]$PermissionMode = "acceptEdits"
)

# Validar formato kebab-case
if ($Name -notmatch '^[a-z0-9]+(-[a-z0-9]+)*$') {
    Write-Warning "El nombre '$Name' debería estar en minúsculas y separado por guiones (kebab-case). Ajustando..."
    $Name = $Name.ToLower() -replace '[^a-z0-9]+', '-' -replace '^-|-$', ''
}

# Determinar directorio destino de agentes (.agents/agents)
$AgentsDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\..\..\agents"))

if (-not (Test-Path $AgentsDir)) {
    New-Item -ItemType Directory -Path $AgentsDir -Force | Out-Null
}

$FilePath = Join-Path $AgentsDir "$Name.md"

if (Test-Path $FilePath) {
    Write-Error "El agente '$Name' ya existe en $FilePath. Abortando para evitar sobreescritura accidental."
    return
}

$ToolsYaml = ($Tools | ForEach-Object { "  - $_" }) -join "`n"

$Content = @"
---
name: $Name
description: $Description
model: $Model
mainAgent: $($MainAgent.ToString().ToLower())
subagent: $($Subagent.ToString().ToLower())
permissionMode: $PermissionMode
commandExecutionPolicy: $CommandExecutionPolicy
tools:
$ToolsYaml
---

# Instrucciones Principales

Eres el agente especializado **$Name**.

## Misión
$Description

## Reglas Operativas
1. Mantén tus intervenciones acotadas a tu especialidad.
2. Utiliza únicamente las herramientas proporcionadas.
3. Verifica cada acción ejecutada antes de reportar el resultado.

## Procedimiento
1. Inspecciona los archivos y contexto relevante.
2. Aplica las modificaciones o ejecuciones requeridas.
3. Valida la integridad del proyecto.
4. Genera un resumen claro para el usuario o agente coordinador.
"@

Set-Content -Path $FilePath -Value $Content -Encoding UTF8

Write-Host " Agente personalizado creado con éxito en:" -ForegroundColor Green
Write-Host "   $FilePath" -ForegroundColor Cyan
Write-Host "Para usarlo desde la CLI:" -ForegroundColor Yellow
Write-Host "   agy --agent $Name" -ForegroundColor White
