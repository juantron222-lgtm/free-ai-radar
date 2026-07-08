# Publicar Free AI Radar en Google Play Store

Esta guía describe el camino recomendado para llevar Free AI Radar a Google Play sin tener que desarrollar una app nativa desde cero.

## Camino recomendado: Trusted Web Activity (TWA)

Una **Trusted Web Activity** permite empaquetar una PWA como app Android y publicarla en Google Play. La app se ve y se comporta como nativa, pero el contenido se sirve desde tu dominio HTTPS.

### Requisitos previos

- [x] PWA válida con `manifest.webmanifest`
- [x] Service worker registrado
- [x] Iconos en múltiples tamaños (192px y 512px, regulares + maskable)
- [x] Política de privacidad pública (`/privacy`)
- [x] Dominio público con HTTPS (necesario en el momento de publicar)
- [ ] Cuenta de Google Play Console ($25 USD, pago único)

### Paso a paso con Bubblewrap

Bubblewrap es la herramienta oficial de Google para generar TWAs.

```bash
# 1. Instalar Bubblewrap
npm install -g @bubblewrap/cli

# 2. Inicializar proyecto TWA
bubblewrap init --manifest https://free-ai-radar.ejemplo.com/manifest.webmanifest

# 3. Construir el APK/AAB
bubblewrap build
```

Esto genera un `app-release.aab` listo para subir a Google Play Console.

### Configuración de firma

Necesitarás un keystore para firmar la app:

```bash
keytool -genkey -v -keystore free-ai-radar.keystore -alias release -keyalg RSA -keysize 2048 -validity 10000
```

Guarda el keystore y la contraseña de forma segura. Si los pierdes, no podrás actualizar la app en Play Store.

### Assets necesarios para Play Store

- **Capturas de pantalla**: mínimo 2 (teléfono), recomendadas 4-8 (teléfono + tablet)
- **Icono de alta resolución**: 512x512 PNG
- **Feature graphic**: 1024x500 PNG (banner de la ficha)
- **Descripción corta**: máx 80 caracteres
- **Descripción larga**: máx 4000 caracteres

### Ejemplo de descripción para Play Store

**Título**: Free AI Radar - Herramientas IA Gratis

**Descripción corta**: Novedades de IA gratis, filtradas y explicadas. Sin humo.

**Descripción larga**:
Descubre herramientas, modelos y recursos de inteligencia artificial gratuitos o con plan gratuito realmente útil.

Free AI Radar clasifica cada herramienta entre:
- ✅ Gratis real: usable sin pagar
- 🟢 Freemium decente: límites gratuitos útiles
- 🟡 Créditos gratis
- ⚠️ Trial camuflado
- 💨 Humo probable

Cada herramienta recibe una puntuación de 0 a 100 basada en 6 criterios transparentes: gratuidad real, utilidad práctica, facilidad de uso, transparencia, potencial para creadores y actualidad.

Sin login, sin pagos, sin trampas.

### Categoría recomendada

**Productividad** o **Herramientas**

### Clasificación de contenido

Probablemente **"Todos"** (sin contenido sensible).

### Precio

**Gratis** (la app no tiene compras integradas).

### Mantener la PWA actualizada

- Cada vez que despliegues cambios en la PWA, se reflejarán automáticamente en la TWA sin necesidad de actualizar la app en Play Store.
- Solo necesitas subir una nueva versión del AAB si cambias el `manifest`, los iconos o añades funcionalidades nativas.

### Checklist previa a la publicación

- [ ] Dominio HTTPS comprado y configurado
- [ ] PWA desplegada y accesible públicamente
- [ ] `manifest.webmanifest` válido (verificar con Lighthouse)
- [ ] Service worker funcionando (verificar en DevTools > Application)
- [ ] Iconos en formatos correctos
- [ ] `/privacy` accesible públicamente
- [ ] Cuenta de Google Play Console creada
- [ ] AAB generado con Bubblewrap
- [ ] Capturas de pantalla preparadas
- [ ] Ficha de Play Store completada

### Nota importante

No crees una app Android nativa desde cero. La PWA + TWA es el camino más eficiente y te permite mantener una sola base de código (la web) que funciona en web, móvil (PWA) y Play Store (TWA).
