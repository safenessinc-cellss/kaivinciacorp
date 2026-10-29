# Kaivincia — Reclutamiento, Data y RBAC granular

## Decisión
Monolito modular sobre React/Vite + Firebase Auth/Firestore en la primera etapa. Cada módulo tiene límites y colecciones propias. La autorización real se aplica en reglas de Firestore y endpoints de servidor, nunca solo ocultando botones o filtrando el frontend. El alcance (global, región, campaña, asignados) es independiente del permiso de acción.

## Reclutamiento: flujo de extremo a extremo
1. Importar PDF/DOCX por carga explícita y almacenar original en Firebase Storage privado. Guardar metadatos CV: candidateId, storagePath, MIME real, tamaño, SHA-256, uploadedBy, uploadedAt y retentionUntil.
2. Escanear archivos, limitar tamaño/MIME, extraer texto en worker con timeout/reintentos y registrar errores de parseo.
3. Guardar perfil del candidato y evaluaciones IA versionadas: habilidades, etiquetas, puntuaciones por criterio, evidencias, versión del modelo/prompt, fecha y revisor. La puntuación cultural no debe decidir por sí sola contratación o rechazo.
4. Guardar cada transición del pipeline en candidateStageHistory con actor, motivo, fecha y etapa anterior/nueva; emitir candidate.stage_changed.v1.
5. El visor/descarga de CV usa endpoint autenticado o URL firmada de corta duración; cada acceso se audita. No usar URLs públicas permanentes.
6. candidate.hired.v1 inicia un onboarding idempotente: validar datos y documentos, vacante, área, manager, presupuesto, centro de coste y rol propuesto. Revisión humana de RRHH/administración; crear colaboradora y después invitar a autenticación. Contratar no concede privilegios automáticamente.
7. Colaboradora activa: nómina recibe solo datos contractuales necesarios; Finanzas recibe centro de coste y presupuesto; reportes recibe métricas minimizadas. Comisiones, ventas y Data reciben únicamente asignaciones laborales necesarias.

## Data: flujo de extremo a extremo
1. Importar CSV/XLSX o API autenticada con Idempotency-Key. Crear lote con actor, origen, hash y conteos.
2. Mapear columnas, normalizar teléfono a E.164, validar país/longitud, consentimiento/base legal, horarios de contacto y lista de exclusión.
3. Deduplicar por tenant + teléfono normalizado; email y clave de proveedor como secundarios. Registrar duplicados/conflictos, no borrarlos silenciosamente.
4. Asignar por país/región/ciudad/zona, campaña, capacidad diaria, round robin, carga, horario o modo manual. La asignación final debe ejecutarse en servidor/transacción para evitar dobles asignaciones.
5. El operador solo accede a assignedToUid = uid y al ámbito territorial autorizado. Firestore Rules/API debe hacer cumplir lo mismo en consultas directas.
6. El softphone recibe dataRecordId como contexto. Al finalizar, la llamada guarda dataRecordId, agentUid, campaignId, disposition, providerCallId y evento Telnyx validado y deduplicado.
7. Interesado crea/actualiza lead; cita crea cita vinculada; venta enlaza cliente y venta confirmada. Cobros y comisiones nacen de eventos confirmados de venta/pago, nunca de una simple disposición telefónica.
8. Respetar opt-out, consentimiento, DNC, zona horaria y ventanas legales de contacto.

## Modelo de datos
- Candidato 1:N CV/Documento, EvaluaciónIA y Aplicación; Aplicación N:1 Vacante; Aplicación 1:N PipelineStageHistory.
- Candidato 0..1:1 Colaboradora mediante un proceso de contratación idempotente.
- Colaboradora 1:N RoleAssignment y PayrollItem.
- Región 1:N RegistroData; BaseData 1:N RegistroData; RegistroData 1:N Asignación y Llamada.
- Llamada puede generar Lead; Lead 1:N Venta; Venta 1:N Comisión y Factura; Factura 1:N Cobro; Cobro 1:N MovimientoFinanciero.
- CustomRole 1:N RolePermission; Usuario 1:N RoleAssignment; Asignación incluye ámbito y expiración.

## Colecciones Firebase iniciales
candidates, candidateApplications, candidateStageHistory, candidateDocuments, aiEvaluations, jobs, collaborators, customRoles, roleAssignments, auditLogs, dataBatches, dataRecords, dataAssignments, regions, campaigns y calls.
Cada registro debe tener tenantId, createdAt, createdBy, updatedAt y updatedBy. Las operaciones externas deben llevar idempotencyKey/sourceEventId. No guardar CV como base64 en Firestore. Importes financieros como unidades menores enteras y moneda ISO, no floats.

## Eventos de dominio
Ejemplo de envelope:
    {
      "id": "evt_01J...",
      "type": "data.assigned.v1",
      "schemaVersion": 1,
      "occurredAt": "2026-10-29T20:00:00Z",
      "actorUid": "uid_admin",
      "aggregate": {"type": "dataRecord", "id": "record_123"},
      "idempotencyKey": "assignment:record_123:uid_agent:policy_v1",
      "data": {"regionId": "south", "campaignId": "campaign_q4", "assignedToUid": "uid_agent"}
    }

Eventos iniciales: candidate.created.v1, cv.uploaded.v1, candidate.stage_changed.v1, candidate.hired.v1, collaborator.activated.v1, data.batch.uploaded.v1, data.record.validated.v1, data.assigned.v1, call.completed.v1, lead.created.v1, sale.created.v1, payment.received.v1, commission.calculated.v1, payroll.approved.v1, financial.movement.posted.v1 y permission.changed.v1. Los eventos contienen IDs y métricas mínimas, nunca CV, tokens, grabaciones ni documentos sensibles.

## Contratos API recomendados
- POST /api/recruitment/candidates — crear candidato con idempotencia.
- POST /api/recruitment/candidates/:id/cv — carga privada mediante URL temporal.
- GET /api/recruitment/candidates/:id/cv/:documentId — visor/descarga autenticada y auditada.
- POST /api/recruitment/candidates/:id/hire — orden idempotente de contratación con aprobación.
- POST /api/data/batches; POST /api/data/batches/:id/validate; POST /api/data/batches/:id/assign.
- GET /api/data/records?regionId=&campaignId=&status=&cursor= — ámbito aplicado por backend.
- PATCH /api/data/records/:id/disposition — validar asignación y estado permitido.
- POST /api/calls/:id/complete — comando protegido; webhooks Telnyx verificados aparte.
- POST /api/admin/roles; PUT /api/admin/users/:uid/role-assignments; GET /api/admin/permissions/effective.
Todas las mutaciones críticas requieren autorización en servidor, validación de esquema, idempotencia, rate limit y auditoría.

## RBAC granular
Permiso = module:action. Ámbito independiente: global, region:<id>, campaign:<id>, assigned. Ejemplos: data:read, data:import, data:assign, data:export, recruitment:documents.download y recruitment:hire. Exportar no implica leer todos los registros. Asignar privilegios requiere aprobador; permisos temporales deben expirar.

## UX macOS-inspired
- Grupo Configuración fijo al final de la sidebar: Centro de acceso, Usuarios, Roles y permisos, Regiones, Campañas, Integraciones, Auditoría, Seguridad y Apariencia.
- Fondo claro #F5F5F7, superficies blancas, dark mode con tokens actuales; blur solo en sidebar/sheets y nunca a costa del contraste.
- Data: métricas, filtros, lote con preview y filas rechazadas, diálogo de asignación con capacidad. Operador sin cartera ve estado vacío, no datos globales.
- Talento: pipeline, ficha lateral, timeline y visor PDF. Mostrar criterios/evidencias IA y revisión humana.
- Atajos: Cmd/Ctrl+K CommandBar, Esc cerrar diálogo, / buscar y N crear cuando el foco no esté en un campo.
- Loading skeleton, error con reintento, empty state con siguiente acción y confirmación para borrar/exportar.

## Seguridad y retención
- Firebase Storage privado, rutas por tenant/expediente, MIME real, límites, escaneo antimalware y URLs firmadas de minutos.
- Auditar lectura/descarga de CV, cambios de pipeline, contratación, asignaciones, exportación y permisos.
- Definir retención por país y propósito; eliminación/anominización aprobada, bloqueo legal y auditoría. Cumplir LGPD/GDPR según jurisdicción.
- Data: consentimiento/base legal, minimización, opt-out, DNC, horarios de contacto, protección anti-scraping, checksum y borrado programado.

## Roadmap y aceptación
- Fase 0: inventario de reglas, backups, esquema y permisos. Aceptación: rutas privilegiadas identificadas y matriz de alcance documentada.
- Fase 1: centro de configuración, roles, permisos por acción y auditoría. Aceptación: autorización efectiva en servidor y prueba de que un usuario no puede escalarse.
- Fase 2: Data import, preview, dedupe y asignación. Aceptación: tests de duplicados/concurrencia y ningún operador puede leer carteras ajenas por consulta directa.
- Fase 3: visor CV, evaluaciones versionadas, pipeline y onboarding. Aceptación: contratación idempotente y sin permisos hasta aprobación.
- Fase 4: eventos y analytics con llamadas/ventas/cobros/comisiones/nómina. Aceptación: replay no duplica ventas/pagos y dashboards concilian.

## Riesgos
- Permisos solo UI: aplicar reglas Firestore/API, default-deny y pruebas negativas.
- Teléfonos duplicados: normalización E.164 y política versionada.
- Sesgo IA: explicación, revisión humana y auditoría.
- Importación parcial: lotes, conteos, estado, reintentos y rollback lógico.
- Doble asignación/venta: transacciones, idempotencia y claves únicas en backend.
- Datos sensibles en logs: redacción, mínimo privilegio y URLs temporales.
- Migración de esquema: adaptadores y migraciones por lotes; no reemplazo masivo del CRM existente.
