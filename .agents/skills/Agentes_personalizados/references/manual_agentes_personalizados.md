# Manual Técnico: Agentes Personalizados en Google Antigravity

Fuente oficial: [Introducing Custom Agents - Google Antigravity Blog](https://antigravity.google/blog/introducing-custom-agents/)

---

## 1. El Cambio de Paradigma: De Escribir Código a Orquestar Agentes

El desarrollo de software moderno ha evolucionado desde la escritura manual de líneas de código hacia la orquestación coordinada de agentes de IA. Para desbloquear un salto real en la productividad, el trabajo complejo debe descomponerse en una **división del trabajo**: agentes especializados que actúan, verifican y ejecutan tareas en paralelo.

### Limitaciones de los Asistentes Monolíticos de Propósito General
1. **Falta de especialización**: Un asistente general no conoce las convenciones de pruebas, arquitecturas o gestión de dependencias de tu proyecto sin recordárselo en cada interacción.
2. **Saturación del contexto (*Context Window Bloat*)**: Inyectar un prompt gigantesco con guías de estilo, reglas de linter, manuales y herramientas en cada sesión consume tokens innecesarios y degrada la precisión del modelo.

---

## 2. Diferenciación: Agentes Personalizados vs. Habilidades (Skills) vs. Subagentes Dinámicos

| Concepto | Qué hace | Cómo optimiza el contexto |
| :--- | :--- | :--- |
| **Habilidades (*Skills*)** | Proporcionan instrucciones de dominio y procedimientos paso a paso. | Utilizan descubrimiento progresivo: no se inyectan en el prompt hasta que el agente determina que las necesita. |
| **Subagentes Dinámicos** | Instancias temporales creadas al vuelo por el agente principal. | Aíslan la ejecución de tareas secundarias (búsqueda, compilación) para no contaminar la memoria del agente principal. |
| **Agentes Personalizados (*Custom Agents*)** | Entidades configuradas estáticamente con rol, herramientas, habilidades y políticas de seguridad propias. | Permiten restringir el subconjunto exacto de herramientas, habilidades, modelo y permisos de sistema desde el inicio. |

Los agentes personalizados **no reemplazan** a las habilidades ni a los subagentes dinámicos; se combinan con ellos para proporcionar la máxima optimización y previsibilidad.

---

## 3. Características Distintivas en Google Antigravity

### A. Simetría Real: Agente Principal vs. Subagente
A diferencia de otros entornos donde los agentes personalizados solo pueden ser subagentes subordinados invisibles, en Antigravity se ofrece **simetría de ejecución completa**:

```yaml
mainAgent: true
subagent: true
```

- **Como Agente Principal (`mainAgent: true`)**:
  - Seleccionable directamente en la interfaz gráfica de Antigravity 2.0 (menú desplegable de agentes).
  - Ejecutable desde la consola mediante CLI:
    ```bash
    agy --agent nombre-del-agente
    ```
  - Sus instrucciones centrales se compilan como el prompt del sistema y adopta los parámetros definidos en el frontmatter.
- **Como Subagente (`subagent: true`)**:
  - Un agente coordinador puede delegarle subtareas de forma desatendida.

---

### B. Políticas de Ejecución Segura (`commandExecutionPolicy`)

Uno de los mayores dolores al ejecutar agentes con herramientas de consola (`run_command`) es lidiar con permisos:
- Si la política es demasiado estricta, el usuario sufre una saturación de solicitudes de aprobación manual.
- Si es demasiado laxa, existe riesgo de ejecutar código destructivo o inseguro.

Antigravity resuelve esto con el filtro de ejecución granular:

```yaml
permissionMode: acceptEdits
commandExecutionPolicy: auto
```

Con `commandExecutionPolicy: auto`:
- Se ejecutan automáticamente comandos estándar de compilación, ejecución de tests y validaciones en segundo plano sin interrumpir al usuario.
- Operaciones de alto riesgo (ej. eliminación de archivos críticos, cambios de red o comandos destructivos) permanecen bloqueadas requiriendo confirmación manual explícita.

---

### C. Herramientas Curadas y Habilidades Acotadas (`tools` y `skills`)

Para evitar la confusión de herramientas (*tool confusion*) y el consumo excesivo de tokens:

```yaml
tools:
  - view_file
  - replace_file_content
  - run_command
skills:
  - skills/reglas-actualizacion-paquetes
```

El agente solo recibe el conjunto estricto de herramientas y habilidades necesarias para su misión, omitiendo herramientas irrelevantes como automatización de navegador, clientes SQL o utilidades externas si no las precisa.

---

## 4. Ubicaciones y Trabajo en Equipo

1. **Nivel de Proyecto (`.agents/agents/`)**:
   - Al guardar los agentes en `.agents/agents/` dentro del repositorio del proyecto y subirlos a Git, cualquier miembro del equipo que clone el repositorio tiene acceso inmediato a los mismos asistentes estandarizados sin requerir configuración manual.
2. **Nivel de Usuario Global (`~/.gemini/config/agents/`)**:
   - Disponibles globalmente en cualquier proyecto de la máquina local.
