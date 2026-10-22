---
trigger: always_on
description: Protocolo operativo de colaboración multiagente para el Círculo de Estudios COGNITIO CREDITOR.
---

# PROTOCOLO DE COLABORACIÓN Y FLUJO MULTIAGENTE

Este documento rige la dinámica de trabajo entre el Agente Orquestador (`cognitio-orchestrator`) y los 7 agentes especialistas del proyecto **COGNITIO CREDITOR**.

## 1. Ciclo de Coordinación Centralizada

```
[ Propietario del Proyecto ]
            │
            ▼
┌───────────────────────────┐
│   COGNITIO_ORCHESTRATOR   │ ◄─── Consolida, audita y eleva decisiones críticas
└───────────┬───────────────┘
            │ Delegación estructurada
            ├──────────────────────┬──────────────────────┐
            ▼                      ▼                      ▼
  [ cognitio-requirements ]  [ cognitio-architect ]  [ cognitio-security ]
            │                      │                      │
            ├──────────────────────┼──────────────────────┤
            ▼                      ▼                      ▼
  [ cognitio-frontend-ux ]  [ cognitio-backend-data ] [ cognitio-documents ]
            │                      │                      │
            └──────────────────────┴──────────────────────┘
                                   │
                                   ▼
                         [ cognitio-qa ]
```

## 2. Flujo de Trabajo en Fases Posteriores

1. **Fase de Requisitos**: `cognitio-orchestrator` comisiona a `cognitio-requirements` el desglose de los requerimientos funcionales y perfiles de usuario.
2. **Fase de Arquitectura y Seguridad**: `cognitio-architect`, `cognitio-backend-data` y `cognitio-security` diseñan la topología, los esquemas de datos y los controles de protección.
3. **Fase de Diseño e Interfaz**: `cognitio-frontend-ux` y `cognitio-documents` definen los componentes web y los formatos de certificados/constancias.
4. **Fase de Calidad y Verificación**: `cognitio-qa` audita los criterios de aceptación y diseña la matriz de pruebas.
5. **Aprobación del Propietario**: `cognitio-orchestrator` presenta el plan consolidado y solicita autorización para iniciar la construcción.

## 3. Matriz de Entregables Obligatorios

Todo especialista que responda a una asignación debe utilizar el formato de 8 puntos definido en [AGENTS.md](file:///c:/Users/USUARIO/PROYECTO%20COGNITIO/AGENTS.md):
1. Objetivo de la tarea.
2. Análisis realizado.
3. Resultado o recomendación.
4. Supuestos y limitaciones.
5. Riesgos detectados.
6. Dependencias con otros agentes.
7. Decisiones que necesitan aprobación.
8. Evidencias o referencias utilizadas.
