import React, { useState } from 'react';
import { 
  BookOpen, Target, CheckCircle2, AlertCircle, MapPin, 
  Smartphone, Calendar, ChevronRight, Zap, ShieldCheck,
  CheckSquare, ArrowRight, XCircle, Phone, Database, Layers,
  Globe, FileAudio, FileText, Server, Users2, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface SOPSection {
  type: 'callout' | 'flowchart' | 'steps' | 'script' | 'checklist' | 'dashboard-overview';
  title: string;
  subtitle?: string;
  items?: string[];
  steps?: { label: string; desc: string; type?: 'violet' | 'cyan' | 'emerald' | 'red' | 'normal' }[];
  text?: string;
  checklistItems?: { text: string; id: string }[];
}

interface SOPDocument {
  id: string;
  title: string;
  desc: string;
  image: string;
  sections: SOPSection[];
}

const DEPARTMENTS = [
  { id: 'KV-PRO-ADM', name: 'Administración & RRHH', color: 'text-violet-500' },
  { id: 'KV-PRO-VOIP', name: 'Voz & Telecomunicaciones', color: 'text-orange-500' },
  { id: 'KV-PRO-VTA', name: 'Ventas / Setters', color: 'text-cyan-500' },
  { id: 'KV-PRO-FIELD', name: 'Despliegue Táctico', color: 'text-emerald-500' },
  { id: 'KV-PRO-CRM', name: 'Plataforma CRM · Manual por módulo', color: 'text-blue-500' },
];

const PLATFORM_MODULES: Array<{id:string;title:string;route:string;owner:string;objective:string;steps:string[];controls:string[];evidence:string}> = [["DASH","Panel Maestro","/crm/dashboard","Dirección y gerencia","Consolidar actividad, cartera, desempeño y alertas; es una vista de gestión, no sustituye los registros fuente.",["Acceder con perfil autorizado y revisar periodo y filtros.","Identificar indicadores fuera de objetivo y consultar su definición y fuente.","Abrir el módulo de origen antes de corregir cifras o estados.","Asignar responsable y fecha a cada desviación.","Verificar que el indicador refleje el dato corregido."],["No tomar decisiones con indicadores sin periodo o fuente.","No editar cifras agregadas para corregir el registro fuente.","Contrastar totales con Clientes, Pipeline y Finanzas."],"Registro fuente corregido, responsable y comentario de seguimiento."],["NER","Sistema Nervioso Central","/crm/nervous","Administración CRM y operaciones","Supervisar señales, eventos, alertas e incidencias. Confirmar procedencia antes de tratar una señal como evento real.",["Delimitar periodo y categoría del evento.","Comprobar identificador, fecha, usuario, módulo de origen y detalle.","Clasificar la señal según evidencia e impacto.","Derivar al responsable técnico o funcional.","Documentar resolución y comprobar recurrencia."],["No asumir que una tarjeta predictiva es un evento auditado sin fuente.","No alterar evidencias de una incidencia.","Escalar pérdida de datos, acceso indebido o indisponibilidad."],"Identificador, referencia o captura, análisis, responsable y resolución."],["CLI","Base de Clientes","/crm/clients","Ventas, setters y account management","Mantener un registro único, íntegro y actualizado de empresas y contactos.",["Buscar por empresa, teléfono, correo y dominio antes de crear.","Crear o importar usando plantilla y campos disponibles.","Normalizar razón social, país, zona horaria y datos de contacto.","Asignar propietario, origen, segmento y estado.","Registrar interacción y próxima acción."],["No crear registros duplicados sin verificación.","Tratar datos personales solo para fines autorizados.","Corregir en el registro fuente y conservar trazabilidad."],"Ficha, origen, propietario, historial y próxima acción."],["PIP","Pipeline de Ventas","/crm/pipeline","Líder comercial, setters y closers","Gestionar oportunidades por etapa con criterios verificables y previsión consistente.",["Abrir oportunidad vinculada al cliente correcto.","Validar necesidad, decisor, presupuesto y plazo cuando aplique.","Mover etapa solo al cumplir criterio de salida.","Registrar importe, probabilidad, fecha y próxima actividad.","Cerrar ganada, perdida o aplazada con motivo."],["No avanzar etapas para inflar el embudo.","No duplicar oportunidades por cada contacto.","Toda oportunidad abierta debe tener responsable y siguiente acción."],"Ficha, etapa, importe, motivo de cambio y actividad."],["CAL","Agenda y Reuniones","/crm/calendar","Equipo comercial y coordinación","Coordinar reuniones, llamadas y visitas con zona horaria y seguimiento correctos.",["Crear evento desde cliente u oportunidad cuando sea posible.","Indicar asunto, participantes, fecha, duración, zona horaria y objetivo.","Confirmar disponibilidad y enviar invitación por canal habilitado.","Registrar resultado, acuerdos y tareas posteriores.","Reprogramar o cancelar informando el motivo."],["Confirmar zona horaria del cliente.","No registrar como celebrada una reunión sin resultado.","No exponer información confidencial en títulos públicos."],"Evento, participantes, confirmación, minuta y tareas."],["CHAT","Chat Neural y Contactos","/crm/chat","Usuarios habilitados y supervisión","Centralizar comunicaciones internas y con clientes según canales y permisos.",["Seleccionar equipo, grupo, conversación privada o cliente.","Verificar destinatario y clasificación antes de enviar.","Mantener comunicación profesional y vinculada al asunto.","Convertir compromisos en tareas o notas del registro.","Usar vista de contactos para localizar usuarios."],["No compartir credenciales ni datos de pago.","Comprobar destinatarios antes de adjuntar archivos.","Respetar confidencialidad y retención aplicables."],"Conversación, referencia al asunto y tarea derivada."],["VOIP","Discador, Llamadas y VoIP","/crm/calls","Agentes, supervisores y administrador VoIP","Realizar y documentar comunicaciones mediante proveedor y configuración autorizados.",["Verificar usuario, extensión, dispositivo y proveedor.","Seleccionar número saliente permitido para rol y campaña.","Validar contacto, finalidad y horario local.","Registrar resultado, disposición y notas.","Ante fallo, conservar hora, identificador y mensaje técnico y escalar."],["Caller ID depende de proveedor, número verificado y enrutamiento; confirmar con prueba autorizada.","No prometer grabación o transcripción sin confirmar soporte.","Cumplir consentimiento, exclusiones y normativa de destino."],"Call ID, fecha/hora, número autorizado, disposición y ticket."],["DATA","Data y Carteras TLMK","/crm/data","Data steward y supervisores TLMK","Administrar lotes de prospectos con calidad, asignación y trazabilidad.",["Identificar origen, propietario, fecha y base legal.","Validar estructura, formato, duplicados y campos mínimos.","Asignar cartera, campaña y responsable.","Monitorear cobertura, contacto y registros no válidos.","Depurar según política de conservación."],["No mezclar carteras con finalidades distintas.","No importar sin revisar duplicados y calidad.","Conservar referencia del archivo de origen."],"Archivo, validación, lote, asignación y reporte."],["INT","Integraciones Externas","/crm/integrations","Administrador de sistemas y propietarios de proveedor","Gestionar conexiones externas con control de credenciales, permisos y fallos.",["Definir caso de uso, propietario y datos intercambiados.","Verificar proveedor, entorno y permisos mínimos.","Configurar secretos en mecanismo seguro aprobado.","Probar conexión, ida/vuelta, errores y límites.","Documentar versión, responsable y revocación."],["Nunca copiar claves API en manuales o chats.","Separar pruebas y producción.","Ante incidente, revocar credencial y activar contingencia."],"Ficha de integración, propietario, alcance y prueba."],["AUT","Automatizaciones","/crm/automations","Operaciones y administrador de automatizaciones","Estandarizar tareas repetitivas con control humano sobre acciones sensibles.",["Definir disparador, condición, acción y resultado esperado.","Validar excepciones, duplicidad, límites y consentimiento.","Probar con datos controlados.","Activar con responsable y mecanismo de pausa.","Revisar fallos, volumen y efectos."],["No automatizar envíos masivos sin autorización.","Toda automatización crítica necesita propietario y registro.","No asumir ejecución sin verificar resultado."],"Especificación, aprobación, prueba y log."],["DRIVE","SGI Drive y Documentos","/crm/drive","Gestores documentales, calidad y legal","Clasificar, revisar y controlar documentos corporativos.",["Elegir categoría y confidencialidad adecuadas.","Subir archivo con nombre, versión, propietario y fecha.","Solicitar revisión al responsable.","Distribuir solo versión vigente a usuarios autorizados.","Archivar versiones obsoletas con trazabilidad."],["La vista puede incluir datos de ejemplo; verificar persistencia real.","No subir secretos ni documentos personales innecesarios.","Un borrador no es procedimiento vigente."],"Archivo almacenado, metadatos, versión y aprobación."],["SOP","Manuales y Procedimientos","/crm/manuales","Calidad documental y propietarios de proceso","Publicar versiones controladas de procedimientos y guías.",["Consultar código, versión, estado y fecha de revisión.","Leer alcance, responsables, pasos y controles.","Registrar dudas o desviaciones por soporte.","Solicitar actualización si cambia el proceso o pantalla.","Retirar copias locales obsoletas."],["Solo versión aprobada y vigente es instrucción oficial.","Cambios requieren autor, revisor, aprobador y fecha efectiva.","El manual no sustituye formación ni autorización."],"Código, versión, aprobación e historial de revisión."],["TASK","Gestión de Tareas","/crm/tasks","Todos los responsables y supervisores","Convertir compromisos en trabajo asignado, medible y verificable.",["Crear tarea con acción, resultado y contexto.","Asignar responsable y fecha límite.","Definir prioridad y vínculo con cliente o proyecto.","Actualizar estado y bloqueos.","Cerrar al referenciar el resultado."],["No dejar tareas sin responsable o vencimiento.","Reasignar formalmente si cambia el propietario.","Escalar tareas vencidas de alto impacto."],"Tarea, responsable, plazo, historial y entregable."],["PROJ","Proyectos Activos","/crm/projects","Project manager y patrocinador","Planificar entregables, recursos, riesgos y avance.",["Crear ficha con objetivo, alcance y patrocinador.","Desglosar hitos, tareas, responsables y dependencias.","Registrar riesgos, decisiones y cambios.","Actualizar avance con evidencia.","Obtener aceptación, cerrar y archivar."],["No reportar avance por percepción.","Cambios de alcance requieren aprobación.","Riesgos críticos necesitan dueño y fecha."],"Acta, plan, hitos, riesgos y aceptación."],["REP","Informes y Analítica","/crm/reports","Finanzas, operaciones y responsables KPI","Producir informes reproducibles para decisiones.",["Definir pregunta, periodo, población y fuente.","Comprobar filtros, moneda y zona horaria.","Contrastar totales con módulos transaccionales.","Explicar variaciones separando hechos e hipótesis.","Publicar fecha de corte, autor y limitaciones."],["No comparar definiciones distintas sin advertirlo.","No presentar proyecciones como resultados reales.","Restringir datos personales y financieros."],"Informe, filtros, fuentes, fecha de corte y validación."],["STR","Informe Predictivo","/crm/strategic-report","Dirección y analistas","Apoyar decisiones con tendencias y supuestos explícitos.",["Definir decisión y horizonte.","Verificar calidad y actualidad de datos.","Separar hechos, estimaciones y recomendaciones automatizadas.","Contrastar escenarios con responsables.","Registrar decisión y revisar resultados."],["Un pronóstico no es garantía.","Documentar supuestos e incertidumbre.","No utilizar datos no autorizados."],"Informe, fuentes, supuestos y decisión."],["FIN","Contabilidad y Panel Financiero","/crm/accounting","Finanzas y contabilidad autorizada","Consolidar información financiera y facilitar conciliación.",["Verificar periodo, entidad, moneda y permisos.","Revisar movimientos según procedimiento aprobado.","Conciliar saldos con soportes.","Investigar diferencias antes del cierre.","Obtener revisión y aprobación."],["No sustituye el sistema contable legal ni asesoría fiscal.","Separar preparación y revisión cuando sea posible.","Conservar comprobantes."],"Registros, comprobantes, conciliación y aprobación."],["BILL","Facturación y Cobros","/crm/billing","Administración financiera y cobranzas","Controlar emisión, envío, vencimiento y cobro.",["Verificar cliente, entidad, datos fiscales y condiciones.","Validar concepto, importe, moneda e impuestos.","Emitir y enviar por canal autorizado.","Registrar pagos solo con soporte verificable.","Conciliar diferencias y saldos vencidos."],["No marcar pagado sin confirmación.","Cambios de importe requieren autorización.","Proteger datos fiscales y bancarios."],"Factura, aprobación, comprobante y conciliación."],["PAY","Nómina","/crm/payroll","RRHH y finanzas con acceso restringido","Administrar remuneración con confidencialidad y doble control.",["Confirmar periodo, altas, bajas y novedades.","Verificar conceptos e incidencias aprobadas.","Revisar cálculos y diferencias.","Obtener aprobación independiente.","Archivar recibos con acceso restringido."],["Datos salariales son confidenciales.","Verificar cambios de datos bancarios.","Cumplir legislación laboral y fiscal aplicable."],"Novedades, revisión, autorización y comprobantes."],["TEAM","Gestión de Equipo","/crm/team","RRHH y líderes de área","Gestionar estructura, asignaciones y ciclo de vida de usuarios.",["Solicitar alta con identidad, responsable y función.","Aprobar accesos según matriz de permisos.","Asignar equipo, cartera y objetivos.","Revisar accesos ante cambios de puesto.","Revocar acceso al finalizar la relación."],["No compartir cuentas.","Aplicar mínimo privilegio.","Registrar autorización de acceso."],"Solicitud, aprobación, rol, asignaciones y baja."],["REC","Reclutamiento","/crm/recruitment","RRHH y responsables solicitantes","Gestionar candidaturas de forma confidencial y objetiva.",["Aprobar requisición, perfil y criterios.","Registrar candidatura y consentimiento aplicable.","Evaluar con criterios relacionados con el puesto.","Coordinar entrevistas y retroalimentación.","Comunicar decisión y aplicar retención."],["No utilizar atributos protegidos como criterio.","Limitar acceso a expedientes.","La puntuación automatizada no decide por sí sola."],"Requisición, criterios, evaluaciones y decisión."],["ACL","Centro de Control de Accesos","/crm/access-control","Superadministración y seguridad","Administrar roles y permisos granulares de forma auditable.",["Recibir solicitud con usuario, módulo y justificación.","Validar necesidad con propietario del proceso.","Aprobar mínimo privilegio y duración.","Probar acceso efectivo.","Revisar o revocar en cambios de función."],["Elevación requiere aprobación explícita.","No compartir credenciales.","Separar concesión y revisión cuando sea posible."],"Solicitud, aprobador, permiso, prueba y revisión."],["SEC","Centro de Seguridad","/crm/security","Responsable de seguridad y superadministración","Gestionar controles, alertas y respuesta a incidentes.",["Clasificar evento por impacto y alcance.","Contener sin destruir evidencia.","Registrar sistemas, usuarios y tiempos.","Escalar a seguridad o proveedor.","Recuperar servicio y documentar lecciones."],["No investigar desde una cuenta posiblemente comprometida.","Preservar logs y evidencias.","Comunicar por canales aprobados."],"Ticket, cronología, evidencia, contención y cierre."],["AUD","Auditorías SGI","/crm/audits","Calidad y auditores internos","Planificar auditorías, hallazgos y eficacia de acciones.",["Definir alcance, criterios y agenda.","Recopilar evidencia objetiva.","Clasificar hallazgos con referencia al requisito.","Asignar causa, acción, responsable y plazo.","Verificar implementación y eficacia."],["No emitir hallazgos sin evidencia.","Mantener independencia y confidencialidad.","No cerrar acciones solo por declaración."],"Plan, checklist, evidencias, informe y verificación."],["HELP","Helpdesk y Soporte","/crm/helpdesk","Mesa de ayuda y responsables técnicos","Resolver solicitudes e incidentes con trazabilidad.",["Registrar usuario, módulo, hora y pasos reproducibles.","Clasificar impacto y prioridad.","Adjuntar evidencia sin secretos.","Diagnosticar y comunicar solución.","Confirmar con solicitante y documentar causa."],["Nunca solicitar contraseñas o códigos MFA.","Incidentes de seguridad se escalan inmediatamente.","No cerrar sin validación."],"Ticket, prioridad, diagnóstico, solución y confirmación."],["UP","Mi Portal / Portal Personal","/crm/user-portal","Cada usuario y soporte","Permitir consulta de información propia según perfil.",["Ingresar con cuenta individual y verificar perfil.","Consultar tareas y datos habilitados.","Actualizar solo campos permitidos.","Solicitar correcciones maestras por canal formal.","Cerrar sesión en dispositivos compartidos."],["Acceso limitado a datos propios.","No cargar documentos sensibles sin finalidad.","Reportar datos ajenos visibles."],"Solicitud de cambio, confirmación o ticket."],["CP","Portal de Clientes","/crm/client-portal","Account manager y soporte","Facilitar acceso limitado a recursos expresamente habilitados.",["Verificar identidad y relación contractual.","Asignar acceso al ámbito del cliente.","Orientar sobre documentos y solicitudes disponibles.","Registrar incidencias.","Revocar acceso cuando termina autorización."],["Aislar datos entre clientes.","No compartir enlaces públicos confidenciales.","Verificar identidad antes de cambios contractuales."],"Autorización, cuenta, permisos y baja."],["ACA","Academia Interna","/crm/academy-internal","RRHH y formación","Asignar y supervisar formación interna.",["Definir competencia y público objetivo.","Asignar curso y criterio de aprobación.","Comunicar recursos e instrucciones.","Registrar asistencia y evaluación cuando el módulo lo soporte.","Programar refuerzo si hay brechas."],["No declarar competencia sin evaluación.","Restringir datos de evaluación.","Mantener contenido vigente."],"Plan, asistencia, evaluación y constancia."],["ACAE","Academia Externa","/crm/academy-external","Responsable académico y comercial","Gestionar experiencia formativa externa.",["Validar curso, alcance, precio y condiciones.","Comprobar materiales y acceso.","Gestionar inscripción según flujo habilitado.","Comunicar cambios y cancelaciones.","Recoger evaluación y gestionar incidencias."],["No garantizar certificaciones no acreditadas.","No publicar oferta sin aprobación.","Proteger datos de alumnos."],"Ficha aprobada, inscripción y evaluación."],["TACT","Despliegue Táctico y Visitas","/crm/tactical","Coordinador de campo y supervisor","Estandarizar preparación, ejecución y cierre de visitas.",["Confirmar orden, cliente, dirección, contacto y objetivo.","Revisar riesgos, permisos y EPP.","Registrar check-in real, sin simular ubicación u hora.","Documentar hallazgos autorizados y evidencias necesarias.","Emitir informe, registrar resultado y pendientes."],["La versión actual contiene datos demostrativos y GPS simulado; no usar como evidencia real hasta validar persistencia y GPS real.","Cumplir normas EHS y LOTO del cliente.","No cerrar sin evidencia verificable."],"Orden, check-in validado, evidencias, informe y aceptación."],["OPS","Operaciones","/crm/operations","Dirección de operaciones","Coordinar capacidad, ejecución y cumplimiento de procesos.",["Revisar objetivos, capacidad y compromisos.","Asignar recursos y responsables.","Monitorear bloqueos y dependencias.","Escalar desviaciones.","Cerrar periodo con resultados y acciones."],["Usar indicadores con fuente aprobada.","Registrar cambios de prioridad.","No ocultar desviaciones."],"Plan, asignaciones, incidencias y cierre."],["MKT","Marketing","/crm/marketing","Marketing y dirección comercial","Planificar campañas, audiencias y resultados.",["Aprobar objetivo, audiencia, presupuesto y canal.","Validar consentimiento y exclusiones.","Revisar contenido y enlaces.","Lanzar prueba y campaña autorizada.","Medir entregas, respuestas y conversiones."],["No contactar sin base legal.","Respetar bajas y exclusiones.","Separar atribución estimada de ventas confirmadas."],"Brief, aprobación, audiencia y reporte."],["COM","Comisiones","/crm/commissions","Finanzas y dirección comercial","Calcular incentivos con reglas aprobadas y trazables.",["Consultar política y elegibilidad.","Verificar ventas, cobros y atribución.","Aplicar fórmula y topes vigentes.","Resolver discrepancias con revisión.","Aprobar y comunicar resultado."],["No cambiar reglas retroactivamente sin autorización.","No liquidar operaciones no elegibles.","Restringir datos de remuneración."],"Política, cálculo, conciliación y aprobación."],["COL","Cobranza","/crm/cobranza","Cobranzas y account management","Gestionar compromisos de pago con respeto y documentación.",["Verificar saldo y soporte.","Contactar titular por canal autorizado.","Registrar resultado y compromiso.","Escalar disputas.","Conciliar pago y actualizar fuente financiera."],["No divulgar deuda a terceros.","GPS requiere finalidad y autorización.","No marcar pago sin conciliación."],"Saldo, contacto, compromiso y comprobante."],["FORM","Plantillas de Ficha","/crm/form-templates","Propietarios de proceso y administrador CRM","Estandarizar captura y reducir errores.",["Definir finalidad, campos y propietario.","Eliminar campos redundantes o sensibles innecesarios.","Probar validaciones y permisos.","Publicar versión aprobada.","Revisar calidad y retirar versiones obsoletas."],["Solicitar solo datos necesarios.","Versionar cambios.","Probar antes de publicar."],"Especificación, versión, pruebas y aprobación."],["CM","Gestión de Clientes","/crm/client-management","Account managers","Gestionar relación, salud de cuenta, renovaciones y compromisos.",["Validar contrato, alcance y contactos clave.","Establecer plan de cuenta y cadencia.","Registrar solicitudes, incidencias y acuerdos.","Coordinar entrega con operaciones.","Revisar satisfacción, renovación y expansión."],["No prometer alcance no aprobado.","Registrar cambios contractuales formalmente.","Escalar riesgo de churn con evidencia."],"Plan de cuenta, reuniones, incidencias y renovación."],["MASTER","Formularios Maestros","/crm/turs","Administración y propietarios de proceso","Gestionar formularios y registros normalizados.",["Seleccionar formulario y versión vigente.","Completar desde fuente fiable.","Validar campos y aprobaciones.","Enviar al flujo de revisión.","Corregir observaciones y conservar referencia."],["No crear formularios paralelos sin autorización.","Restringir campos sensibles.","Verificar vigencia."],"Registro, versión y aprobaciones."],["DIG","Productos Digitales","/crm/digital-products","Academia y administración comercial","Administrar catálogo, contenido y condiciones.",["Validar descripción, titularidad, precio y condiciones.","Comprobar materiales y permisos.","Publicar tras aprobación.","Atender incidencias y cambios.","Retirar contenido vencido o sin derechos."],["No publicar materiales sin licencia.","No cambiar precios sin aprobación.","Informar limitaciones."],"Ficha, aprobación, versión y cambios."],["STRAT","Estrategia Intel","/crm/strategy-blog","Dirección y estrategia","Documentar análisis, hipótesis y decisiones.",["Definir tema, objetivo y audiencia.","Distinguir datos, supuestos y opinión.","Revisar fuentes y confidencialidad.","Solicitar revisión.","Registrar decisión y fecha de revisión."],["No publicar datos confidenciales.","Citar fuentes y fecha de corte.","Revisar vigencia."],"Documento, fuentes, aprobación y acción."],["COMM","Comunicaciones","/crm/communications","Comunicaciones y responsables de área","Coordinar avisos corporativos consistentes.",["Definir audiencia, propósito, canal y responsable.","Validar exactitud y confidencialidad.","Aprobar mensajes sensibles.","Enviar por canal autorizado.","Conservar versión y recepción cuando aplique."],["No difundir datos internos a audiencias no autorizadas.","No usar canales personales para información crítica.","Corregir mensajes erróneos."],"Mensaje aprobado, audiencia, canal y fecha."],{"id":"CALLADMIN","title":"Administración del Call Center","route":"/crm/call-center","owner":"Superadministración y jefatura de contact center","objective":"Configurar y supervisar campañas, agentes y parámetros de operación del centro de llamadas.","steps":["Confirmar campaña, horarios, colas y responsables aprobados.","Verificar que cada agente tenga permisos y número saliente asignado.","Comprobar disponibilidad de proveedor, extensiones y políticas de llamada.","Supervisar actividad y atender incidencias sin intervenir conversaciones fuera de autorización.","Cerrar turno con métricas, incidencias y acciones pendientes."],"controls":["Acceso restringido a perfiles administrativos.","No alterar registros de llamada ni asignaciones sin motivo documentado.","Validar caller ID y destino con pruebas autorizadas."],"evidence":"Configuración aprobada, asignaciones, reporte de turno y tickets."},{"id":"CUSTOM","title":"Personalización del Panel","route":"/crm/dashboard/customize","owner":"Administradores y responsables de cada área","objective":"Ajustar widgets y vistas del panel sin alterar los datos fuente ni exponer información no autorizada.","steps":["Definir la necesidad del usuario y los indicadores relevantes.","Seleccionar widgets disponibles y comprobar permisos.","Validar periodo, fuente y visibilidad de cada indicador.","Guardar la configuración y comprobar que persiste al volver a entrar.","Revisar el panel con usuarios del rol correspondiente."],"controls":["La personalización no concede permisos sobre datos subyacentes.","No eliminar indicadores obligatorios de control.","Evitar duplicar widgets o mostrar datos sensibles a roles no autorizados."],"evidence":"Configuración, usuario, fecha y validación de visualización."},{"id":"APPEAR","title":"Apariencia y Preferencias","route":"/crm/appearance","owner":"Administración CRM y usuarios autorizados","objective":"Gestionar preferencias visuales y de idioma respetando la identidad corporativa.","steps":["Abrir preferencias desde el menú autorizado.","Seleccionar opciones disponibles de apariencia e idioma.","Comprobar legibilidad, contraste y visualización en el dispositivo.","Guardar cambios y validar persistencia.","Reportar componentes que no respeten el tema corporativo."],"controls":["Las preferencias visuales no modifican roles ni seguridad.","Mantener contraste accesible y no ocultar alertas.","Cambios globales de marca requieren aprobación."],"evidence":"Preferencia aplicada, usuario y reporte de anomalía."},{"id":"SUPER","title":"Administración Maestra","route":"/crm/superadmin","owner":"Superadministrador autorizado","objective":"Administrar funciones privilegiadas de la plataforma con separación de funciones y trazabilidad.","steps":["Confirmar identidad y autorización reforzada.","Identificar acción administrativa y alcance exacto.","Solicitar aprobación cuando afecte usuarios, permisos o configuración crítica.","Ejecutar el cambio en ventana controlada y verificar impacto.","Registrar motivo, resultado y plan de reversión."],"controls":["No utilizar privilegios elevados para tareas rutinarias.","No eliminar usuarios o datos sin autorización y respaldo cuando aplique.","Registrar todas las acciones críticas."],"evidence":"Solicitud, aprobación, cambio, resultado y referencia de reversión."}];

const DOCUMENTS: Record<string, SOPDocument[]> = {
  'KV-PRO-ADM': [
    {
      id: 'KV-PRO-ADM-01',
      title: 'Manual General de la Plataforma CRM Kaivincia',
      desc: 'Guía oficial e interactiva para operar de punta a punta la plataforma de inteligencia comercial y CRM de Kaivincia Corp.',
      image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
      sections: [
        {
          type: 'callout',
          title: 'Arquitectura de Operación Unificada',
          items: [
            'Kaivincia CRM conecta de forma segura la Base de Datos de Clientes, el Pipeline Inteligente en tiempo real y la Consola VoIP de Zadarma.',
            'Cualquier cambio de estado en un Lead se propaga de inmediato a toda la plataforma mediante enlaces dinámicos en la base de datos de Firebase.',
            'El sistema cuenta con un Sistema Nervioso Central que audita y registra de forma automatizada cada interacción y evento operativo.'
          ]
        },
        {
          type: 'steps',
          title: 'Flujo de Trabajo del CRM de Kaivincia',
          steps: [
            { label: 'Carga de Leads Inteligente', desc: 'Sube registros manualmente en "Base de Clientes" o arrastra archivos CSV/TXT. El formateador inteligente impulsado por IA normalizará campos, autodetectará zonas horarias y preparará los datos.', type: 'cyan' },
            { label: 'Clasificación Automatizada', desc: 'La IA pre-clasifica el estado de salud del cliente en Activo, En Riesgo, Lead, o Inactivo basándose en la actividad reciente.', type: 'violet' },
            { label: 'Estrategia en Pipeline', desc: 'Usa el Pipeline de Ventas para arrastrar y soltar oportunidades (Kanban). El valor del contrato y el estado se actualizan de manera síncrona en la ficha del cliente.', type: 'emerald' },
            { label: 'Ejecución del Call-Center', desc: 'Llama con un clic desde el CRM usando la Consola de VoIP Zadarma, respetando los horarios seguros sugeridos por el sistema de zona horaria.', type: 'normal' }
          ]
        },
        {
          type: 'checklist',
          title: 'Checklist de Cumplimiento Operativo',
          checklistItems: [
            { id: 'c1', text: 'Validar duplicados en la Base de Clientes antes de cada importación.' },
            { id: 'c2', text: 'Asegurar que todas las llamadas realizadas cuenten con nota de seguimiento en el log de actividades.' },
            { id: 'c3', text: 'Actualizar las etapas del Pipeline diariamente para mantener la precisión del embudo y del panel de control.' },
            { id: 'c4', text: 'Revisar la consola del Sistema Nervioso para verificar eventos inusuales o fallos en Webhooks.' }
          ]
        },
        {
          type: 'callout',
          title: 'Gobierno de datos, seguridad y responsabilidades',
          items: [
            'Cada usuario opera con una cuenta individual. Los permisos se conceden por función y necesidad; no se comparten contraseñas ni sesiones.',
            'El dato se corrige en el módulo que lo origina. Los paneles e informes consumen datos y no deben utilizarse para corregir registros transaccionales.',
            'La información de clientes, candidatos, empleados, llamadas y finanzas se utiliza únicamente para fines autorizados y se comparte con el mínimo de personas necesario.',
            'Toda operación relevante debe permitir identificar quién actuó, cuándo, sobre qué registro y cuál fue el resultado. Si el módulo no ofrece trazabilidad suficiente, se registra un ticket.',
            'La disponibilidad de una pantalla no demuestra que una acción se haya guardado. Confirmar el resultado en la ficha o registro correspondiente.'
          ]
        },
        {
          type: 'steps',
          title: 'Ciclo de gestión y control de la plataforma',
          steps: [
            { label: 'Planificar', desc: 'Definir objetivo, propietario del proceso, usuarios, datos necesarios y resultado esperado.', type: 'cyan' },
            { label: 'Autorizar', desc: 'Validar rol, permisos, aprobación y alcance antes de crear, exportar o modificar información.', type: 'violet' },
            { label: 'Ejecutar', desc: 'Operar en el módulo de origen siguiendo el procedimiento y las validaciones visibles.', type: 'emerald' },
            { label: 'Verificar', desc: 'Comprobar persistencia, integridad, destinatario y consistencia con módulos relacionados.', type: 'normal' },
            { label: 'Mejorar', desc: 'Registrar incidencias, analizar causa, asignar acciones y revisar eficacia.', type: 'cyan' }
          ]
        },
        {
          type: 'checklist',
          title: 'Control de cierre diario del responsable',
          checklistItems: [
            { id: 'g1', text: 'Revisar oportunidades sin responsable o sin próxima acción.' },
            { id: 'g2', text: 'Revisar llamadas, reuniones y conversaciones pendientes de documentar.' },
            { id: 'g3', text: 'Comprobar tareas vencidas, incidencias críticas y solicitudes de acceso.' },
            { id: 'g4', text: 'Verificar que los documentos publicados correspondan a versiones aprobadas.' },
            { id: 'g5', text: 'Escalar fallos de integración, datos inconsistentes o accesos indebidos.' }
          ]
        }
      ]
    }
  ],
  'KV-PRO-VOIP': [
    {
      id: 'KV-PRO-VOIP-01',
      title: 'Manual del Operador VoIP & Zadarma Integration',
      desc: 'Instrucciones operativas para el uso del Click-to-Call, WebRTC y el sistema inteligente de protección de zonas horarias en Kaivincia.',
      image: 'https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=800&q=80',
      sections: [
        {
          type: 'callout',
          title: 'El Sistema Click-to-Call, el proveedor VoIP y la Zona Horaria',
          items: [
            'Antes de iniciar cualquier llamada, el sistema valida el código de área del lead (por ejemplo, 213, 720, 631) para calcular su hora local actual.',
            'Regulación Estricta: Las llamadas telefónicas solo se permiten en el Horario Seguro (9:00 AM - 8:00 PM hora local del lead).',
            'Si intentas llamar fuera de esta ventana horaria, el CRM mostrará una advertencia crítica con la opción de cancelar, forzar continuación o agendar cita para horario recomendado.'
          ]
        },
        {
          type: 'flowchart',
          title: 'Protocolo de Validación de Zona Horaria y proveedor configurado',
          steps: [
            { label: 'Agente presiona "Llamar"', desc: 'Se intercepta el evento de llamada en el CRM.', type: 'normal' },
            { label: 'Extracción de Código de Área', desc: 'Se analizan los 3 primeros dígitos del número telefónico de EE.UU. (ej: California 213, New York 631).', type: 'cyan' },
            { label: 'Consulta de Zona Horaria', desc: 'Se busca en la base de datos de area_code_schedules si es zona PT, MT, CT o ET.', type: 'violet' },
            { label: 'Evaluación de Horario Seguro', desc: 'Si la hora actual local del lead está entre 9:00 AM y 8:00 PM, se autoriza la llamada directamente.', type: 'emerald' },
            { label: 'Bloqueo / Alerta de Horario', desc: 'Si es fuera de horario, se activa el escudo protector mostrando la advertencia dinámica en pantalla.', type: 'red' }
          ]
        },
        {
          type: 'script',
          title: 'Guion Sugerido para Apertura B2B',
          text: '"Hola [Nombre del Contacto], le saludo de Kaivincia Corp. Veo que tiene un requerimiento activo para la optimización de sus redes en su sede de [Ciudad]. Le llamo brevemente porque la tecnología de automatización nos indica que es un horario seguro para conversar en su zona de tiempo [Zona Horaria]. ¿Cuenta con 2 minutos para verificar los requerimientos técnicos?"'
        },
        {
          type: 'checklist',
          title: 'Checklist de Configuración de Audio & SIP',
          checklistItems: [
            { id: 'v1', text: 'Tener micrófono habilitado en el navegador con los permisos de iframe otorgados.' },
            { id: 'v2', text: 'Validar que la extensión SIP o sesión WebRTC del proveedor configurado aparezca con estado "ONLINE / REGISTERED" en la consola del operador.' },
            { id: 'v3', text: 'Verificar la calidad de la señal de red en el indicador de latencia del Sistema Nervioso (óptimo < 100ms).' },
            { id: 'v4', text: 'Al colgar, cerciorarse de que el evento de cierre esté registrado y la grabación exista solo si el proveedor y la configuración la soportan.' }
          ]
        }
      ]
    }
  ],
  'KV-PRO-VTA': [
    {
      id: 'KV-PRO-VTA-01',
      title: 'Prospección en LinkedIn',
      desc: 'Networking profesional de alto impacto y primer contacto en LinkedIn para adquisición de cuentas B2B.',
      image: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80',
      sections: [
        {
          type: 'callout',
          title: 'Reglas de Oro en Prospección en LinkedIn',
          items: [
            'Nunca vendas en el primer mensaje. El objetivo es entablar una conversación honesta e identificar si tienen puntos de dolor de infraestructura.',
            'Optimiza tu perfil antes de conectar: Tu banner, foto y descripción de cargo deben posicionarte como un consultor técnico experto de Kaivincia Corp, no como un vendedor agresivo.',
            'Investiga al prospecto. Menciona un post reciente o logro de su empresa en tu nota de invitación para maximizar la tasa de aceptación.'
          ]
        },
        {
          type: 'steps',
          title: 'Etapas del Primer Contacto',
          steps: [
            { label: 'Identificación de Cuenta Target', desc: 'Busca empresas en sectores industriales o de TI ubicadas en California, Colorado, New York o New Jersey con más de 50 empleados.', type: 'normal' },
            { label: 'Mensaje de Conexión Personalizado', desc: 'Envía una invitación breve (menos de 300 caracteres) enfocándote en retos de optimización o conectividad de su zona geográfica.', type: 'cyan' },
            { label: 'Apertura de Conversación', desc: 'Una vez aceptada la conexión, agradece y lanza una pregunta de diagnóstico general sin presionar por una videollamada.', type: 'violet' }
          ]
        },
        {
          type: 'script',
          title: 'Plantilla de Invitación de Alto Rendimiento',
          text: '"Hola [Nombre], felicidades por el crecimiento reciente de [Empresa] en [Ciudad]. Veo que gestionas infraestructura técnica en la región. Me encantaría conectar para intercambiar mejores prácticas sobre despliegue táctico y conectividad de alta velocidad. Saludos!"'
        }
      ]
    },
    { 
      id: 'KV-PRO-VTA-02', 
      title: 'Agenda de Visitas', 
      desc: 'Protocolo oficial para el agendamiento y confirmación de visitas de consultores B2B a instalaciones del cliente. Diseño a prueba de errores.',
      image: 'https://images.unsplash.com/photo-1611162616475-46b635cb6868?w=800&q=80',
      sections: [
        {
          type: 'callout',
          title: 'La Regla del 3-3-3',
          items: [
            '03 Pasos Máximos para solicitar y confirmar una visita de campo.',
            '03 Segundos para que el cliente comprenda la propuesta de valor de la visita presencial.',
            '03 Checklists de Éxito requeridos para que la auditoría de despliegue sea autorizada.'
          ]
        },
        {
          type: 'flowchart',
          title: 'Flujograma de Decisión de Cita Presencial',
          steps: [
            { label: 'Lead Calificado > 80%', desc: 'Se verifica que la cuenta tenga presupuesto y necesidad reales en el CRM.', type: 'violet' },
            { label: '¿Decisor Principal Confirmó?', desc: 'Se valida que la llamada de confirmación haya sido con el CTO, Director de Operaciones o similar.', type: 'cyan' },
            { label: 'SÍ: Agendar en CRM', desc: 'Se registra el evento con ubicación GPS integrada, mapa y notas.', type: 'emerald' },
            { label: 'NO: Reprogramar Call', desc: 'Se regresa al lead a la etapa "Contactado" en el Pipeline de Ventas.', type: 'red' }
          ]
        },
        {
          type: 'script',
          title: 'Guion de Confirmación de Cita',
          text: '"Excelente [Nombre]. Queda agendada nuestra sesión técnica presencial para el [Día] a las [Hora] en sus instalaciones. Nuestro Consultor Especialista le enviará una notificación GPS 15 minutos antes de su llegada. ¿Mantenemos como único requerimiento el acceso a la sala de juntas?"'
        },
        {
          type: 'checklist',
          title: 'Checklist ZERO FAIL',
          checklistItems: [
            { id: 'f1', text: 'Cliente validado en CRM (No Duplicado)' },
            { id: 'f2', text: 'Ubicación GPS extraída de Google Maps insertada correctamente en el evento' },
            { id: 'f3', text: 'Decisor Principal etiquetado en el evento de calendario' }
          ]
        }
      ]
    },
    { 
      id: 'KV-PRO-VTA-03', 
      title: 'Seguimiento Omnicanal',
      desc: 'Estrategia de comunicación y acompañamiento a través del pipeline multicanal de Kaivincia.',
      image: 'https://images.unsplash.com/photo-1611162618828-0bea69c36214?w=800&q=80',
      sections: [
        {
          type: 'callout',
          title: 'Automatización y Toque Humano',
          items: [
            'Sincroniza correos electrónicos, llamadas telefónicas e interacciones de chat en una sola línea de tiempo.',
            'Usa recordatorios inteligentes basados en el estado de salud del cliente en el CRM.',
            'Si un lead pasa a estado "En Riesgo", el sistema genera un trigger de alerta de alta prioridad en el Sistema Nervioso Central.'
          ]
        },
        {
          type: 'checklist',
          title: 'Pasos de Acompañamiento Semanal',
          checklistItems: [
            { id: 'o1', text: 'Enviar correo resumen 24h después de la primera llamada.' },
            { id: 'o2', text: 'Efectuar llamada de seguimiento VoIP los días martes o jueves respetando su huso horario.' },
            { id: 'o3', text: 'Actualizar las notas internas del lead en el CRM después de cada contacto.' }
          ]
        }
      ]
    },
  ],
  'KV-PRO-FIELD': [
    {
      id: 'KV-PRO-FIELD-01',
      title: 'Auditorías de Red de Clientes',
      desc: 'Protocolo de campo para el relevamiento de infraestructura de red física y Wi-Fi en plantas industriales de clientes Kaivincia.',
      image: 'https://images.unsplash.com/photo-1614729939124-032f0b56c9ce?w=800&q=80',
      sections: [
        {
          type: 'callout',
          title: 'Protocolo de Seguridad Física (EHS)',
          items: [
            'Uso obligatorio de casco, botas de seguridad con casquillo dieléctrico y chaleco de alta visibilidad durante toda la estancia en planta.',
            'Seguir estrictamente las políticas de Lock-Out / Tag-Out (LOTO) de energía eléctrica del cliente antes de abrir cualquier gabinete de red.',
            'No manipular fibra óptica activa bajo ninguna circunstancia sin lentes de protección láser certificados.'
          ]
        },
        {
          type: 'steps',
          title: 'Procedimiento de Relevamiento Técnico',
          steps: [
            { label: 'Inspección Visual del IDF/MDF', desc: 'Fotografiar el estado del rack de comunicaciones, etiquetado de cables, orden del cableado (cable management) y ventilación.', type: 'normal' },
            { label: 'Escaneo de Espectro RF (Wi-Fi)', desc: 'Realizar mapas de calor de cobertura inalámbrica utilizando analizadores de espectro en frecuencias de 2.4GHz, 5GHz y 6GHz.', type: 'cyan' },
            { label: 'Prueba de Rendimiento de Enlace', desc: 'Efectuar pruebas iPerf contra servidores locales para mapear ancho de banda, pérdida de paquetes y jitter.', type: 'violet' }
          ]
        },
        {
          type: 'checklist',
          title: 'Checklist de Entrega de Auditoría de Campo',
          checklistItems: [
            { id: 'a1', text: 'Reporte PDF con diagramas topológicos unifilares subido a la base de clientes' },
            { id: 'a2', text: 'Inventario de activos de red con marcas, modelos y números de serie' },
            { id: 'a3', text: 'Listado detallado de riesgos y cuellos de botella de ancho de banda identificados' }
          ]
        }
      ]
    }
  ],
  'KV-PRO-CRM': PLATFORM_MODULES.map(module => ({
    id: 'KV-MOD-' + module.id,
    title: module.title,
    desc: 'Procedimiento operativo de ' + module.route + '. Propietario: ' + module.owner + '. ' + module.objective,
    image: 'https://images.unsplash.com/photo-1454165804606-c3d57bc86b40?w=800&q=80',
    sections: [
      { type: 'callout' as const, title: 'Propósito, alcance y responsabilidad', items: [
        module.objective,
        'Responsable del proceso: ' + module.owner + '.',
        'Acceso: ingresar desde ' + module.route + ' con cuenta individual y permisos asignados. Las opciones dependen del rol y de la configuración vigente.'
      ]},
      { type: 'steps' as const, title: 'Procedimiento estándar de operación', steps: module.steps.map((desc,index) => ({
        label: ['Preparar','Validar','Ejecutar','Registrar','Cerrar y verificar'][index] || ('Paso ' + (index + 1)),
        desc,
        type: (['cyan','violet','emerald','normal','cyan'][index] || 'normal') as 'cyan' | 'violet' | 'emerald' | 'normal'
      }))},
      { type: 'callout' as const, title: 'Controles obligatorios y puntos de atención', items: module.controls },
      { type: 'checklist' as const, title: 'Lista de verificación antes de cerrar', checklistItems: [
        { id: module.id + '-c1', text: 'He utilizado mi cuenta individual y tengo autorización para esta operación.' },
        { id: module.id + '-c2', text: 'He verificado identidad, integridad y origen de los datos.' },
        { id: module.id + '-c3', text: 'He registrado el resultado y no he alterado evidencias.' },
        { id: module.id + '-c4', text: 'He asignado responsable y fecha a los pendientes.' },
        { id: module.id + '-c5', text: 'Evidencia mínima: ' + module.evidence }
      ]}
    ]
  }))
};

export default function SOPManuals() {
  const [activeDept, setActiveDept] = useState('KV-PRO-ADM');
  const [activeDoc, setActiveDoc] = useState('KV-PRO-ADM-01');

  // Asegurar que haya un documento seleccionado por defecto cuando cambia el departamento
  const handleDeptChange = (deptId: string) => {
    setActiveDept(deptId);
    const docs = DOCUMENTS[deptId] || [];
    if (docs.length > 0) {
      setActiveDoc(docs[0].id);
    } else {
      setActiveDoc('');
    }
  };

  const currentDeptDocs = DOCUMENTS[activeDept] || [];
  const doc = currentDeptDocs.find(d => d.id === activeDoc) || currentDeptDocs[0];

  return (
    <div className="kaivincia-tahoe-module min-h-screen bg-[#F5F6F8] text-[#202124] flex">
      {/* Sidebar Navigation */}
      <div className="w-80 border-r border-[#E5EAF2] bg-white flex flex-col hidden lg:flex shrink-0">
        <div className="p-8 border-b border-[#E5EAF2]">
          <div className="h-10 w-10 bg-[#EAF2FF] rounded-xl border border-[#D8E5FA] flex items-center justify-center text-[#1A73E8] mb-4">
            <BookOpen className="w-5 h-5" />
          </div>
          <h2 className="text-sm font-black uppercase tracking-widest text-[#202124]">Manuales Kaivincia</h2>
          <p className="text-[10px] text-[#667085] font-mono mt-1">Sistemas & Protocolos Operativos</p>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-white">
          <p className="text-[9px] font-mono uppercase text-[#667085] tracking-wider px-2">Departamentos</p>
          <div className="space-y-1">
            {DEPARTMENTS.map(dept => (
              <button 
                key={dept.id}
                onClick={() => handleDeptChange(dept.id)}
                className={`flex items-center gap-3 text-[10px] font-black uppercase tracking-widest w-full text-left p-3 rounded-xl transition-all ${
                  activeDept === dept.id 
                    ? 'bg-[#EAF2FF] text-[#174EA6] border border-[#D8E5FA] shadow-sm' 
                    : 'text-[#667085] hover:text-[#202124] hover:bg-[#F5F6F8]'
                }`}
              >
                <div className={`w-2 h-2 rounded-full ${activeDept === dept.id ? dept.color.replace('text-', 'bg-') : 'bg-[#CBD2DC]'}`} />
                {dept.name}
              </button>
            ))}
          </div>

          <div className="h-px bg-[#E5EAF2] my-4" />

          {currentDeptDocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-[9px] font-mono uppercase text-gray-500 tracking-wider px-2">Documentos del Área</p>
              <div className="space-y-1">
                {currentDeptDocs.map(d => (
                  <button
                    key={d.id}
                    onClick={() => setActiveDoc(d.id)}
                    className={`w-full text-left p-3 text-[10px] uppercase font-mono rounded-xl transition-all border flex items-center justify-between group ${
                      activeDoc === d.id 
                        ? 'bg-[#EAF2FF] text-[#174EA6] border-[#D8E5FA] shadow-sm' 
                        : 'text-[#667085] hover:text-[#202124] hover:bg-[#F5F6F8] border-transparent'
                    }`}
                  >
                    <span className="truncate pr-2">{d.title}</span>
                    <ChevronRight className={`w-3.5 h-3.5 text-gray-600 group-hover:text-cyan-400 transition-colors ${activeDoc === d.id ? 'text-cyan-400' : ''}`} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto relative bg-[#F5F6F8] min-h-screen">
        {/* Dynamic Background Glow */}
        <div className="absolute inset-0 pointer-events-none" />

        <div className="max-w-4xl mx-auto p-6 md:p-12 space-y-10 relative z-10">
          
          {doc ? (
            <>
              {/* Document Header */}
              <header className="border-b border-[#E5EAF2] pb-6">
                <div className="flex items-center gap-3 mb-4">
                  <span className="px-3 py-1 bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-black uppercase tracking-widest rounded-full font-mono">
                    {doc.id}
                  </span>
                  <span className="text-[10px] text-gray-500 uppercase tracking-widest font-mono">Kaivincia Standard v2.4 · Revisión operativa 31-10-2026</span>
                </div>
                <h1 className="text-3xl md:text-4xl font-black tracking-tight text-[#202124]">
                  {doc.title}
                </h1>
                <p className="text-[#667085] mt-3 max-w-2xl text-sm leading-relaxed">
                  {doc.desc}
                </p>
              </header>

              {/* Hero Illustration */}
              <div className="w-full aspect-[21/9] rounded-3xl overflow-hidden relative border border-[#E5EAF2] group shadow-sm">
                 <div className="absolute inset-0 bg-gradient-to-t from-[#0B0E14] via-transparent to-transparent z-10" />
                 <img 
                   src={doc.image} 
                   alt={`3D Illustration for ${doc.title}`} 
                   className="w-full h-full object-cover opacity-80 group-hover:scale-105 group-hover:opacity-100 transition-all duration-1000"
                 />
                 <div className="absolute bottom-6 left-6 z-20 flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_10px_#22D3EE] animate-pulse" />
                    <span className="text-[10px] font-mono text-white uppercase tracking-[0.2em]">Visual Module Rendered</span>
                 </div>
              </div>

              {/* Dynamic Sections rendering based on selected document */}
              {doc.sections.map((section, sIdx) => {
                switch (section.type) {
                  case 'callout':
                    return (
                      <section key={sIdx} className="bg-[#161B22] border border-[#22D3EE]/30 p-6 rounded-3xl relative overflow-hidden group shadow-lg">
                        <div className="absolute top-0 right-0 p-8 opacity-10 group-hover:opacity-20 transition-opacity">
                          <Target className="w-24 h-24 text-[#22D3EE]" />
                        </div>
                        <h3 className="text-xs font-black uppercase tracking-widest text-[#22D3EE] mb-4 flex items-center gap-2">
                          <Zap className="w-4 h-4" /> {section.title}
                        </h3>
                        <div className="space-y-3 relative z-10">
                          {section.items?.map((item, itemIdx) => (
                            <div key={itemIdx} className="flex gap-2.5 items-start">
                              <CheckCircle2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
                              <p className="text-sm text-gray-300 leading-relaxed">{item}</p>
                            </div>
                          ))}
                        </div>
                      </section>
                    );

                  case 'flowchart':
                    return (
                      <section key={sIdx} className="space-y-6">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 text-white">
                          {section.title} <div className="h-px flex-1 bg-white/5" />
                        </h3>
                        
                        <div className="bg-black/40 border border-white/5 p-6 md:p-8 rounded-3xl relative overflow-hidden">
                           <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:1rem_1rem] opacity-20" />
                           
                           <div className="relative z-10 flex flex-col items-center max-w-xl mx-auto space-y-4">
                             {section.steps?.map((step, stepIdx) => (
                               <React.Fragment key={stepIdx}>
                                 <div className={`border px-5 py-3 rounded-2xl w-full text-center shadow-lg transition-all hover:scale-[1.02] ${
                                   step.type === 'red' ? 'bg-red-500/10 border-red-500/30 text-red-400' :
                                   step.type === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' :
                                   step.type === 'cyan' ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' :
                                   step.type === 'violet' ? 'bg-violet-500/10 border-violet-500/30 text-violet-400' :
                                   'bg-[#161B22] border-white/10 text-white'
                                 }`}>
                                   <p className="text-[9px] font-mono uppercase tracking-[0.15em] opacity-60 mb-0.5">Paso {stepIdx + 1}</p>
                                   <p className="font-bold text-sm uppercase tracking-wider">{step.label}</p>
                                   <p className="text-xs text-gray-400 mt-1 leading-relaxed">{step.desc}</p>
                                 </div>
                                 {stepIdx < (section.steps?.length || 0) - 1 && (
                                   <ArrowRight className="w-5 h-5 text-gray-600 rotate-90" />
                                 )}
                               </React.Fragment>
                             ))}
                           </div>
                        </div>
                      </section>
                    );

                  case 'steps':
                    return (
                      <section key={sIdx} className="space-y-6">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 text-white">
                          {section.title} <div className="h-px flex-1 bg-white/5" />
                        </h3>
                        
                        <div className="grid grid-cols-1 gap-4">
                          {section.steps?.map((step, stepIdx) => (
                            <div key={stepIdx} className="bg-[#12161E] border border-white/5 p-5 rounded-2xl flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                              <div className={`h-8 w-8 rounded-full flex items-center justify-center font-black text-xs shrink-0 ${
                                step.type === 'cyan' ? 'bg-cyan-500/20 text-cyan-400' :
                                step.type === 'violet' ? 'bg-violet-500/20 text-violet-400' :
                                step.type === 'emerald' ? 'bg-emerald-500/20 text-emerald-400' :
                                'bg-white/10 text-white'
                              }`}>
                                {stepIdx + 1}
                              </div>
                              <div className="space-y-1">
                                <h4 className="font-black text-sm uppercase tracking-wide text-white">{step.label}</h4>
                                <p className="text-xs text-gray-400 leading-relaxed">{step.desc}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </section>
                    );

                  case 'script':
                    return (
                      <section key={sIdx} className="space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 text-white">
                          {section.title} <div className="h-px flex-1 bg-white/5" />
                        </h3>
                        <div className="bg-[#161B22] p-6 rounded-3xl border border-white/5 relative overflow-hidden">
                           <div className="absolute top-4 right-4 pointer-events-none opacity-5">
                              <Smartphone className="w-24 h-24 text-white" />
                           </div>
                           <p className="text-sm italic text-gray-200 leading-relaxed relative z-10 font-serif border-l-2 border-cyan-400 pl-4">
                             {section.text}
                           </p>
                        </div>
                      </section>
                    );

                  case 'checklist':
                    return (
                      <section key={sIdx} className="space-y-4">
                        <h3 className="text-sm font-black uppercase tracking-widest flex items-center gap-3 text-white">
                          {section.title} <div className="h-px flex-1 bg-white/5" />
                        </h3>
                        <div className="bg-emerald-500/5 p-6 rounded-3xl border border-emerald-500/20 space-y-4">
                           {section.checklistItems?.map((item) => (
                             <label key={item.id} className="flex items-start gap-3 cursor-pointer group">
                                <div className="mt-0.5 relative flex items-center justify-center w-5 h-5 rounded border border-emerald-500/50 bg-black/50 group-hover:bg-emerald-500/20 transition-colors">
                                   <CheckSquare className="w-3.5 h-3.5 text-emerald-400 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">{item.text}</span>
                             </label>
                           ))}
                        </div>
                      </section>
                    );

                  default:
                    return null;
                }
              })}

              <footer className="pt-12 text-center text-[10px] uppercase font-mono text-[#8993A3] tracking-[0.2em] pb-12">
                 Propiedad de Kaivincia Corp // Distribución Restringida // © 2026 Kaivincia CRM
              </footer>
            </>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <HelpCircle className="w-16 h-16 text-gray-700 animate-pulse" />
              <p className="text-sm text-gray-500 font-mono">Seleccione un departamento y un documento para comenzar</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
