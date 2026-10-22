# REGLAS DEL PROYECTO: CÍRCULO DE ESTUDIOS COGNITIO CREDITOR
# Sistema Multiagente de Desarrollo de Software

Este documento define la gobernanza, las directrices obligatorias y el protocolo de colaboración para el equipo multiagente en Google Antigravity.

---

## 1. Reglas Generales del Equipo

Todos los agentes que operen en este espacio de trabajo deben cumplir estrictamente las siguientes reglas:

1. **Delimitación de Alcance**: Cada especialista debe trabajar exclusivamente dentro del alcance de sus responsabilidades asignadas.
2. **Cero Invención de Datos**: No inventar información sobre el proyecto, negocio o requisitos. Si falta información, formular preguntas directas o registrar el supuesto como pendiente de validación.
3. **Distinción Rigurosa**: Distinguir siempre de forma explícita entre:
   - Hechos comprobados y verificados.
   - Requisitos confirmados por el propietario.
   - Recomendaciones técnicas de especialistas.
   - Supuestos o hipótesis pendientes de validación.
   - Decisiones aprobadas.
   - Decisiones críticas que requieren autorización del propietario.
4. **Seguridad y Confidencialidad**:
   - No exponer credenciales, API keys, tokens ni datos personales o académicos.
   - No instalar servicios de pago ni generar compromisos económicos sin autorización previa del propietario.
   - No realizar acciones destructivas ni publicar/desplegar servicios sin autorización expresa.
5. **Veracidad de Evidencias**: No afirmar que se han ejecutado pruebas, validaciones, escaneos o inspecciones sin contar con la evidencia real correspondiente.

---

## 2. Protocolo de Comunicación y Entrega de Resultados

Cuando un especialista entregue un resultado al Agente Orquestador (`cognitio-orchestrator`), debe estructurar su respuesta con el siguiente estándar:

```markdown
### [ENTREGABLE] <Nombre de la Tarea / Especialidad>
1. **Objetivo de la tarea**: Propósito específico analizado.
2. **Análisis realizado**: Metodología, opciones evaluadas y consideraciones técnicas.
3. **Resultado o recomendación técnica**: Propuesta concreta y fundamentada.
4. **Supuestos y limitaciones**: Condiciones asumidas y alcance de la recomendación.
5. **Riesgos detectados**: Amenazas operativas, técnicas, de seguridad o de negocio.
6. **Dependencias con otros agentes**: Áreas que requieren coordinación (ej. backend con seguridad).
7. **Decisiones que necesitan aprobación**: Puntos bloqueantes que requieren la decisión del propietario.
8. **Evidencias y referencias**: Archivos, estándares o especificaciones consultadas.
```

---

## 3. Prevención de Conflictos y Concurrencia

1. **Aislamiento de Cambios**: Dos o más agentes no deben modificar los mismos archivos o configuraciones en paralelo sin la previa validación y secuenciación por parte del Orquestador.
2. **Discrepancias Técnicas**: Cuando surja un desacuerdo técnico entre especialistas (ej. arquitectura vs. seguridad), los agentes deben exponer las alternativas con sus pros, contras y riesgos. El Orquestador consolidará las opciones y las elevará al propietario para su decisión final.
3. **Revisión Cruzada Obligatoria**: Toda decisión que involucre persistencia o manipulación de datos debe contar con la validación concurrente del Arquitecto, Especialista de Backend y Especialista de Seguridad.

---

## 4. Directorio del Equipo de Agentes

| Identificador | Nombre del Rol | Frontmatter | Archivo de Configuración |
| :--- | :--- | :--- | :--- |
| `cognitio-orchestrator` | Director General y Orquestador | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-orchestrator.md` |
| `cognitio-requirements` | Analista Funcional y de Requisitos | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-requirements.md` |
| `cognitio-architect` | Arquitecto de Software y Diseño Técnico | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-architect.md` |
| `cognitio-frontend-ux` | Especialista en Frontend y Experiencia de Usuario | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-frontend-ux.md` |
| `cognitio-backend-data` | Especialista en Backend, Datos e Integraciones | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-backend-data.md` |
| `cognitio-security` | Especialista en Ciberseguridad, Privacidad y Control de Acceso | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-security.md` |
| `cognitio-documents` | Especialista en Documentos, PDF y Certificados | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-documents.md` |
| `cognitio-qa` | Especialista en Calidad, Pruebas y Documentación Técnica | `mainAgent: true, subagent: true` | `.agents/agents/cognitio-qa.md` |
