---
name: Agentes_personalizados
description: >-
  Guía integral y herramientas para diseñar, configurar, validar y orquestar Agentes Personalizados (Custom Agents) en Google Antigravity y Antigravity CLI.
  Activa esta habilidad cuando el usuario desee crear agentes especializados en .agents/agents/, configurar simetría (mainAgent/subagent),
  establecer políticas de ejecución segura (commandExecutionPolicy: auto), delimitar herramientas (tools) y habilidades (skills) por agente, o coordinar flujos multi-agente.
---

# Habilidad: Agentes Personalizados (Custom Agents) en Antigravity

Esta habilidad proporciona el protocolo estandarizado, directrices de diseño y herramientas para crear, configurar y operar **Agentes Personalizados** en proyectos gobernados por Google Antigravity, basándose en la especificación oficial introducida en Antigravity 2.0 y Antigravity CLI ([Introducing Custom Agents](https://antigravity.google/blog/introducing-custom-agents/)).

---

## 1. ¿Qué es un Agente Personalizado?

Un Agente Personalizado es una configuración declarativa basada en un archivo Markdown (`.md`) con encabezado YAML frontmatter. A diferencia de un asistente de propósito general monolítico, un agente personalizado define:
- Un **rol especializado** delimitado.
- Un conjunto restringido de **herramientas** (`tools`) y **habilidades** (`skills`).
- Políticas de permisos y ejecución granular de comandos (`commandExecutionPolicy`).
- Simetría de ejecución: capacidad de actuar como agente primario en la interfaz/CLI o como subagente en segundo plano.

---

## 2. Ubicación de los Agentes

Los archivos de agentes se almacenan en:

| Ámbito | Ruta | Propósito |
| :--- | :--- | :--- |
| **Proyecto / Workspace** | `.agents/agents/<nombre-agente>.md` | Versionado en Git. Compartido automáticamente con todo el equipo. |
| **Global del Usuario** | `~/.gemini/config/agents/<nombre-agente>.md` | Disponible en cualquier proyecto dentro de la máquina local. |

---

## 3. Estructura de un Agente (`.agents/agents/<nombre>.md`)

Cada agente consta de dos partes:
1. **Frontmatter YAML**: Metadatos, modelo, herramientas, permisos y modos de ejecución.
2. **Cuerpo Markdown**: Las instrucciones centrales del sistema (*System Prompt*) que asume el agente.

```markdown
---
name: mi-agente-especializado
description: Explica brevemente el rol del agente y cuándo debe ser invocado por el coordinador.
model: flash
mainAgent: true
subagent: true
permissionMode: acceptEdits
commandExecutionPolicy: auto
tools:
  - view_file
  - replace_file_content
  - run_command
skills:
  - skills/mi-habilidad-relevante
---

# Instrucciones Principales
Eres un agente especializado en... Tu objetivo es...
```

---

## 4. Campos Soportados en el Frontmatter

- **`name`** *(string, requerido)*: Identificador único en minúsculas y separado por guiones (kebab-case).
- **`description`** *(string, requerido)*: Descripción clara para que el agente coordinador decida delegarle tareas automáticamente.
- **`model`** *(string, opcional)*: Modelo de lenguaje a utilizar (ej. `flash`, `pro`).
- **`mainAgent`** *(boolean, opcional)*: Si es `true`, aparece en el selector de la GUI de Antigravity 2.0 y se puede invocar desde la terminal (`agy --agent <nombre>`).
- **`subagent`** *(boolean, opcional)*: Si es `true`, puede ser invocado dinámicamente como subagente por un coordinador.
- **`commandExecutionPolicy`** *(string, opcional)*:
  - `auto`: Ejecuta autónomamente comandos seguros (tests, compilación, linters) en segundo plano sin pedir confirmación continua, reservando las autorizaciones para comandos de alto riesgo (como borrado).
- **`permissionMode`** *(string, opcional)*: Nivel de permisos (`acceptEdits`, `bypassPermissions`, etc.).
- **`tools`** *(lista, opcional)*: Lista restrictiva de herramientas autorizadas (ej. `view_file`, `replace_file_content`, `run_command`, `manage_task`). Evita confusión de herramientas.
- **`skills`** *(lista, opcional)*: Habilidades precargadas disponibles para este agente específico.

---

## 5. Procedimiento para Crear un Agente

1. **Diseñar el alcance**:
   - Definir si el agente necesita interactuar con el usuario (`mainAgent: true`), trabajar en segundo plano (`subagent: true`) o ambos.
   - Listar únicamente las herramientas estrictamente necesarias.
2. **Generar el archivo Markdown**:
   - Crear el archivo en `.agents/agents/<nombre>.md`.
   - Puedes usar el script automatizado:
     [`scripts/New-CustomAgent.ps1`](./scripts/New-CustomAgent.ps1)
3. **Redactar el Prompt Central**:
   - Incluir rol, reglas operativas, pasos de verificación y formato de salida esperado.
4. **Validar la ejecución**:
   - Probar vía CLI: `agy --agent <nombre>`
   - O verificar en Antigravity 2.0 en el menú desplegable de agentes.

---

## 6. Recursos y Documentación de Referencia

- [Manual Técnico Detallado de Agentes Personalizados](./references/manual_agentes_personalizados.md)
- [Ejemplo: Dependency Modernizer](./examples/dependency_modernizer.md)
- [Ejemplo: QA & Test Runner](./examples/qa_tester.md)
- [Ejemplo: Code Reviewer & Auditor](./examples/code_reviewer.md)
