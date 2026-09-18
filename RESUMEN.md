# Resumen de la sesión — Todo List Serverless

Sesión con Claude Code (modelo **Claude Opus 5**) el 17/09/2026, de 21:26 a 22:35 (≈ 69 min).

## 🔗 URLs desplegadas

| Recurso | URL |
|---------|-----|
| Web (Vercel) | https://tareas-serverless.vercel.app |
| API (API Gateway → Lambda) | https://eznac4dkd8.execute-api.us-east-1.amazonaws.com |
| Lambda | `todo-serverless-api` — [consola AWS](https://us-east-1.console.aws.amazon.com/lambda/home?region=us-east-1#/functions/todo-serverless-api) |
| DynamoDB | tabla `todo-tasks` (us-east-1) |
| Repositorio GitHub | https://github.com/msalas170768/1.4.50-aws-lambda-vite |
| Pull request | https://github.com/msalas170768/1.4.50-aws-lambda-vite/pull/1 |
| Proyecto Vercel | `marcelo-salas-projects-3583d46f/tareas-serverless` |

Endpoints de la API: `GET/POST /tasks`, `GET/PUT/DELETE /tasks/{id}`, `GET /health`.

## 📋 Qué se hizo

1. **Spec** — se completó `CLAUDE.md`: arquitectura, modelo de datos, contrato de la API,
   plan de pruebas, requisitos de la web, publicación y criterios de aceptación.
2. **Backend** — `lambda/handler.py`: una sola Lambda (Python 3.12) con router interno,
   validación, 404 condicionales (`attribute_exists`), paginación del `Scan` y CORS.
3. **Infraestructura (Terraform)** — 16 recursos: tabla DynamoDB `PAY_PER_REQUEST`, rol IAM
   de mínimo privilegio, Lambda, log group (7 días), API Gateway v2 con 6 rutas, stage con
   throttling y permiso de invocación. CORS restringido al dominio de Vercel y `localhost:5173`.
4. **Pruebas**
   - `lambda/tests/`: 15 tests del handler con DynamoDB simulada (`moto`) → **15/15 ok**.
   - `scripts/lambda-invoke.sh`: invocación directa de la Lambda → **200 ok**.
   - `scripts/smoke-test.sh`: CRUD, errores 400/404 y preflight CORS contra AWS → **11/11 ok**.
   - Navegador (Playwright) contra producción: crear, completar, editar y eliminar, con persistencia tras recargar.
5. **Web** — Vite + React + TypeScript + Tailwind con diseño de "libreta escolar"
   (Playfair Display / Lora / IBM Plex Mono, línea roja de margen, tachón a mano al completar).
   Filtros, contadores, edición en línea, actualizaciones optimistas con rollback, avisos,
   estados de carga/vacío/error, tema claro/oscuro, responsive y accesible.
6. **Publicación** — repo creado en GitHub (`main` + `feat/serverless-todo`, PR #1),
   proyecto Vercel conectado al repo, `VITE_API_URL` configurada y deploy a producción.

## ⚠️ Incidencias y cómo se resolvieron

| Problema | Solución |
|----------|----------|
| El usuario IAM no tenía permisos (`AccessDenied` en IAM, Lambda, DynamoDB, Logs) | Política inline `todo-serverless-deployer` (`docs/deployer-policy.json`), acotada a los recursos del proyecto |
| El editor IAM rechaza `apigateway:TagResource`, pero AWS lo exige al crear un stage etiquetado | El stage se crea con un provider `aws.untagged` sin `default_tags` |
| `cmd.exe` no admite rutas UNC (`\\wsl.localhost\...`) | `pushd` a una unidad temporal e invocar los binarios con `node node_modules/...` |
| `vite dev` no puede vigilar archivos en la ruta de WSL | Verificación con `vite build` + `vite preview` |
| Git de Windows fallaba con el certificado SSL de GitHub | Push con `-c http.sslBackend=schannel` |
| La CLI de Vercel intentó conectar el remote de GitLab | Conexión manual con `vercel git connect` al repo de GitHub |
| Tachón SVG mal dibujado (pendientes y títulos de varias líneas) | Tachón como fondo SVG con `box-decoration-break: clone` |

## 📊 Métricas de uso de tokens

Extraídas del registro de la sesión (`~/.claude/projects/.../f5591444-….jsonl`),
contando cada respuesta del modelo una sola vez. No incluyen la generación de este resumen.

| Métrica | Valor |
|---------|------:|
| Llamadas al modelo | 99 |
| Tokens de entrada (sin caché) | 198 |
| Tokens de entrada escritos en caché | 156.702 |
| Tokens de entrada leídos de caché | 12.167.979 |
| Tokens de salida | 86.760 |
| **Total procesado** | **12.411.639** |

El 98 % de la entrada se sirvió desde la caché de prompts: en cada llamada se reenvía todo
el contexto de la conversación, pero solo la parte nueva se procesa sin caché.

**Uso de herramientas:** 42 Bash · 27 Write · 23 PowerShell · 15 Edit · 37 acciones de
navegador (Playwright) · 4 Read · otras 5.

## ✅ Pendiente

- Fusionar el PR #1 a `main` para que Vercel despliegue automáticamente en cada push.
- Decidir si se sube también a GitLab (`origin`, codecrypto academy).
- Las URLs de *preview* de Vercel no pasan el CORS actual (solo producción y localhost).
- Grabar el vídeo demo.
- Limpieza al terminar: `cd terraform && terraform destroy -auto-approve`.
