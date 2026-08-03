# Privacidad y consentimiento

**Ámbito:** España y Unión Europea · **Marco:** RGPD, LOPDGDD, LSSI-CE, Directiva ePrivacy, DSA

---

## 1. Principio de partida

Nada que no sea estrictamente necesario se ejecuta antes de una decisión del visitante. No es una
buena práctica: es el artículo 22.2 de la LSSI-CE y el 6.1.a del RGPD.

En la v1 esto se incumplía: las fuentes tipográficas se cargaban desde Google, transmitiendo la IP
del visitante a un tercero en EE. UU. antes de cualquier aviso. Se ha eliminado esa dependencia por
completo.

---

## 2. Cómo funciona el consentimiento

```
Carga la página
      │
      ▼
public/consent.js  ← lo único que se ejecuta
      │
      ├── Consent Mode v2 en 'denied' para TODAS las señales
      │
      ├── ¿Hay decisión guardada y vigente?
      │      │
      │      ├── Sí → aplicar; activar los scripts autorizados
      │      │
      │      └── No → aplicar DENY_ALL; mostrar el diálogo
      │
      ▼
El visitante decide
      │
      ├── Aceptar todo   ──┐
      ├── Rechazar todo  ──┼──▶ guardar + aplicar + activar/limpiar
      └── Personalizar   ──┘
```

**Los scripts de terceros nunca están en la página como scripts.** Se declaran así:

```html
<script type="text/plain" data-consent="advertising" data-src="https://..."></script>
```

y sólo se promueven a scripts reales cuando su categoría se concede. Un `type="text/plain"` no se
ejecuta: no es un truco, es cómo el navegador trata un tipo desconocido.

---

## 3. Requisitos y cómo se cumplen

| Requisito | Implementación |
| --- | --- |
| Consentimiento previo | Nada no esencial antes de decidir |
| Granular por finalidad | 4 categorías con casilla independiente |
| Rechazar tan fácil como aceptar | Mismo nivel, mismo tamaño, mismo estilo (`.consent-btn { flex: 1 1 10rem }`) |
| Sin casillas premarcadas | Todas desmarcadas salvo «necesarias» (deshabilitada) |
| Cerrar ≠ aceptar | `Escape` y clic fuera sólo cierran si **ya** existe una decisión |
| Retirable en cualquier momento | Botón en el pie y en `/legal/cookies`, permanente |
| Retirada efectiva | Borra las cookies asociadas **y recarga**, para que el código de terceros deje de ejecutarse |
| Prueba de consentimiento | Se guarda versión, estado y fecha ISO |
| Reconsulta al cambiar el alcance | `CONSENT_VERSION` invalida decisiones anteriores |
| Lista de proveedores | En el propio diálogo y en `/legal/cookies` |
| Consent Mode v2 | `denied` por defecto, `update` al conceder |

**El diálogo no es descartable sin decidir.** Cerrar sin elegir no es consentimiento tácito, y el
código lo refleja: `Escape` y el fondo sólo funcionan cuando ya hay una decisión guardada.

---

## 4. Categorías

| Categoría | Qué incluye | Por defecto |
| --- | --- | --- |
| **Necesarias** | Sesión, CSRF, tema, el propio registro de consentimiento | Siempre activas |
| **Analítica** | Medición agregada de páginas y búsquedas, sin perfiles | Desactivada |
| **Personalización** | Recordar filtros, comparaciones y recomendaciones | Desactivada |
| **Publicidad** | AdSense y su medición | Desactivada |

---

## 5. Cookies necesarias

| Nombre | Para qué | Duración | Atributos |
| --- | --- | --- | --- |
| `far_consent` | Tu decisión y su fecha | 6 meses | `SameSite=Lax`, `Secure` |
| `far_csrf` | Protección de formularios | 8 horas | `SameSite=Lax`, `Secure`, legible por JS por diseño |
| `far_session` / `sb-*` | Sesión iniciada | ≤ 30 días | `HttpOnly`, `Secure`, `SameSite=Lax` |
| `far-theme` | Tema claro/oscuro | localStorage | — |

Todas de origen propio. Ninguna de terceros sin consentimiento.

---

## 6. Minimización

- **No hace falta cuenta para leer nada.** El contenido es íntegramente público.
- **Las IP se guardan siempre hasheadas**, nunca en claro.
- **Los correos se registran hasheados** en `email_log`.
- **Los tokens se almacenan hasheados**, nunca en claro.
- **El correo comercial es opt-in explícito** y no condiciona el uso de la cuenta.
- **Sin píxeles de seguimiento ni imágenes remotas** en las plantillas de correo.
- **Sin decisiones automatizadas** con efectos jurídicos ni elaboración de perfiles significativa.

---

## 7. Derechos y cómo se ejercen

| Derecho | Cómo | Fricción |
| --- | --- | --- |
| Acceso y portabilidad | `/cuenta/preferencias` → Descargar JSON | Un clic, inmediato |
| Rectificación | Editable en la cuenta | Inmediato |
| Supresión | `/cuenta/preferencias` → Eliminar cuenta | Confirmación por texto, inmediato |
| Oposición / limitación | Correo | ≤ 30 días |
| Retirar consentimiento | Botón permanente en el pie | Un clic |
| Baja del boletín | Enlace en cada correo, sin login | Un clic |

**Orden en el borrado:** primero los datos del usuario, después la identidad. Si el segundo paso
falla, queda una cuenta vacía —recuperable—; al revés quedarían datos huérfanos sin nadie que pueda
pedir su borrado.

---

## 8. Conservación

| Dato | Plazo | Base |
| --- | --- | --- |
| Cuenta y contenido asociado | Hasta que la elimines | Contrato |
| Suscripción al boletín | Hasta la baja | Consentimiento |
| Prueba de consentimiento | 3 años tras la baja | Obligación de acreditar (art. 7.1) |
| Facturas | 6 años | Obligación mercantil española |
| Registro de auditoría | 12 meses | Interés legítimo — seguridad |
| Métricas agregadas | 14 meses | Consentimiento |

---

## 9. Encargados del tratamiento

La lista publicada en `/legal/privacidad` **se genera a partir de la configuración real**: sólo
aparecen los proveedores efectivamente activos. Una política que enumera servicios que no se usan es
tan poco informativa como una que omite los que sí.

| Proveedor | Finalidad | Ubicación | Garantía |
| --- | --- | --- | --- |
| Vercel | Alojamiento | EE. UU. / UE | CCT + DPF |
| Supabase | BD y autenticación | UE (configurable) | CCT |
| Stripe | Pagos | Irlanda | Intragrupo UE |
| Resend | Correo | EE. UU. | CCT + DPF |
| Google (AdSense) | Publicidad | Irlanda / EE. UU. | CCT + DPF, sólo con consentimiento |

---

## 10. Pendiente antes de publicar

- [ ] **Revisión jurídica profesional** de privacidad, cookies, términos y derechos. Los cuatro
      textos llevan un aviso de borrador visible en la propia página.
- [ ] Razón social, NIF y domicilio en la política.
- [ ] Registro de actividades de tratamiento (art. 30 RGPD).
- [ ] Firmar los DPA de cada encargado.
- [ ] Si se activa AdSense: verificar que la CMP está certificada por Google e integrada con el TCF.
- [ ] Evaluar si procede una EIPD (probablemente no: no hay tratamiento a gran escala ni categorías
      especiales).

---

## 11. Lo que este proyecto no hace

- No vende ni cede datos con fines comerciales.
- No usa dark patterns en el consentimiento.
- No condiciona el acceso al contenido a aceptar cookies (nada de *cookie walls*).
- No premarca el correo comercial.
- No esconde la baja.
- No carga nada de terceros antes del consentimiento.
