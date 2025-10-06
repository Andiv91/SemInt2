# CSECV — SemInt2

Landing con login de Google restringido a @ufps.edu.co y formulario protegido de "Incluir Empresa".

## Requisitos
- Node.js 18+

## Configuración
1. Crea credenciales de OAuth en Google Cloud (Google Identity Services):
   - Tipo: Web
   - Orígenes autorizados: `http://localhost:5173`
   - URI de redirección: (no requerido para GIS popup)
   - Obtén el Client ID
2. Crea `.env` en la raíz con:
   ```env
   GOOGLE_CLIENT_ID=TU_CLIENT_ID
   PORT=5173
   ```

## Ejecutar
```bash
npm install
npm run dev
# abre http://localhost:5173
```

## Flujo
- `index.html` carga el botón "Iniciar Sesión".
- Al pulsar, usa Google Identity Services (popup) → envía el ID token a `/api/login`.
- El backend verifica el token y el dominio `@ufps.edu.co` → crea cookie de sesión.
- El CTA "Incluir Empresa" requiere sesión; abre modal con el formulario.

## Notas
- En producción, usa HTTPS y `secure: true` para cookies.
- Puedes adaptar `allowedDomain` en `server.js` si cambia el dominio.
