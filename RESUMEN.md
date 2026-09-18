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

## 🗺️ Visión general

```
 Navegador ──HTTPS──► Vercel (CDN)                 sirve la web estática (HTML/JS/CSS)
     │
     └──fetch JSON──► API Gateway v2 (HTTP API)     CORS · rutas · throttling
                           │ evento v2.0
                           ▼
                      Lambda todo-serverless-api    router + validación (Python 3.12)
                           │ boto3
                           ▼
                      DynamoDB todo-tasks           almacenamiento de las tareas
```

La web y la API viven en plataformas distintas y solo se conocen por una URL: Terraform
publica la URL de la API como output y esa URL se inyecta en la web como variable
`VITE_API_URL` al compilarla en Vercel.

Orden de trabajo: **spec** (`CLAUDE.md`) → **backend + tests** → **Terraform** →
**web** (verificada primero contra un mock local) → **GitHub** → **permisos IAM + despliegue AWS**
→ **pruebas contra AWS** → **Vercel** → **cierre de CORS** → **prueba final en producción**.

---

## 🧩 Aplicación 1 — API de tareas (AWS Lambda + DynamoDB)

**Código:** `lambda/handler.py` (≈190 líneas, sin dependencias externas: `boto3` ya viene en el runtime).

### Cómo atiende una petición

1. API Gateway recibe, por ejemplo, `PUT /tasks/abc` y comprueba que la ruta existe y que el
   origen está permitido por CORS.
2. Invoca la Lambda con un evento *payload v2.0* que trae método (`requestContext.http.method`),
   ruta (`rawPath`) y cuerpo (`body`, que puede venir en base64).
3. `lambda_handler` extrae método y ruta y llama a `route()`, un router hecho a mano que
   parte la ruta en segmentos (`["tasks", "abc"]`) y elige la operación.
4. La operación valida la entrada, habla con DynamoDB y devuelve `response(status, body)`,
   que siempre serializa a JSON y añade las cabeceras CORS.
5. Los errores de negocio se lanzan como `ApiError(status, mensaje)` y se convierten en
   `{"error": "..."}`. Cualquier excepción inesperada se registra en CloudWatch y el cliente
   recibe un 500 genérico, sin trazas internas.

### Modelo de datos (tabla `todo-tasks`)

| Campo | Tipo | Regla |
|-------|------|-------|
| `id` | String (UUID v4) | Clave de partición; la genera la Lambda |
| `title` | String | Obligatorio, sin espacios sobrantes, máx. 200 caracteres |
| `completed` | Boolean | `false` al crear; en PUT debe ser booleano real |
| `createdAt` / `updatedAt` | String ISO-8601 UTC | Se fijan al crear; `updatedAt` cambia en cada PUT |

DynamoDB no tiene esquema: en Terraform solo se declara `id`; el resto de campos los impone el código.

### Operaciones

| Petición | Qué hace en DynamoDB | Respuestas |
|----------|----------------------|-----------|
| `GET /tasks` | `Scan` paginado con `LastEvaluatedKey`, ordenado por `createdAt` desc | 200 |
| `POST /tasks` | `PutItem` con id y fechas nuevas | 201 · 400 |
| `GET /tasks/{id}` | `GetItem` | 200 · 404 |
| `PUT /tasks/{id}` | `UpdateItem` con `SET` dinámico (solo los campos enviados) y `ReturnValues=ALL_NEW` | 200 · 400 · 404 |
| `DELETE /tasks/{id}` | `DeleteItem` | 204 · 404 |
| `GET /health` | — (comprobación de vida) | 200 |

**Decisiones clave:**
- **Una sola Lambda con router interno:** un único despliegue, un único rol IAM y menos arranques en frío que con una función por ruta.
- **404 sin lecturas extra:** PUT y DELETE usan `ConditionExpression="attribute_exists(id)"`. Si la tarea no existe, DynamoDB lanza `ConditionalCheckFailedException` y se traduce a 404 en la misma escritura.
- **`ExpressionAttributeNames` (`#t`, `#c`, `#u`):** evitan choques con palabras reservadas de DynamoDB.
- **`Scan` para listar:** es aceptable para una lista personal pequeña. Con muchos usuarios habría que pasar a `Query` con un índice.

### Pruebas de la API
- `lambda/tests/test_handler.py`: 15 tests que ejecutan el handler contra una DynamoDB simulada
  en memoria (`moto`), sin AWS. Cubren el flujo CRUD, el orden de la lista, los errores 400/404/405, el JSON inválido y el preflight. **15/15 ok.**
- `scripts/lambda-invoke.sh`: `aws lambda invoke` con un evento de `GET /health` (prueba la Lambda sin API Gateway). **200 ok.**
- `scripts/smoke-test.sh`: recorre la API pública con `curl` (crear → listar → leer → completar →
  renombrar → errores → borrar → borrar otra vez → CORS) y limpia lo que crea. **11/11 ok.**

---

## 🧩 Aplicación 2 — Web de tareas (Vite + React + TypeScript + Tailwind)

**Código:** `frontend/`. Se compila a archivos estáticos (≈75 KB de JS comprimido) que sirve Vercel.

### Estructura

```
src/
├── api.ts                  cliente HTTP tipado: listTasks, createTask, updateTask, deleteTask
├── hooks/useTasks.ts       estado de la lista + actualizaciones optimistas con rollback
├── hooks/useToasts.ts      cola de avisos (máx. 3, se cierran solos a los 4 s)
├── hooks/useTheme.ts       tema claro/oscuro recordado en localStorage
├── components/
│   ├── TaskComposer.tsx    campo para crear tareas (Enter o botón, contador al acercarse a 200)
│   ├── TaskItem.tsx        fila: casilla, título, tachón, fecha relativa, editar y borrar
│   ├── States.tsx          esqueleto de carga y mensajes de lista vacía / error
│   ├── Toasts.tsx          avisos accesibles (role=status / alert)
│   └── Icons.tsx           iconos SVG propios
├── lib/time.ts             fechas relativas en español ("hace 5 minutos")
└── App.tsx                 cabecera, filtros, contadores y composición de la página
```

### Cómo fluyen los datos
1. `api.ts` es el único punto que conoce la URL de la API (`import.meta.env.VITE_API_URL`).
   Convierte los errores HTTP en `ApiError` con el mensaje del backend y los fallos de red en
   "No se pudo conectar con la API". Solo envía `Content-Type` cuando hay cuerpo, para evitar preflights innecesarios en los GET.
2. `useTasks` guarda la lista y aplica **actualizaciones optimistas**: la interfaz cambia al
   instante (la tarea nueva aparece con un id temporal `tmp-…`, la casilla se marca, la fila
   desaparece) y, cuando la API responde, se sustituye por el dato real. Si la API falla, se
   restaura el estado anterior y se relanza el error.
3. `App.tsx` captura esos errores y muestra un aviso ("No se pudo completar la tarea: …").
   Mientras una tarea se guarda, su fila se atenúa y sus botones se desactivan.

### Funcionalidad
- Listar, crear, completar/reabrir, editar en línea (doble clic o lápiz; Enter guarda, Escape cancela) y eliminar.
- Filtros *Todas / Pendientes / Completadas* con contadores y **Borrar completadas**, que lanza los DELETE en paralelo y recupera los que fallen.
- Frase de estado en la cabecera ("Te quedan 3 pendientes de 5", "Todo hecho").
- Estados de carga (esqueleto), lista vacía (un texto distinto por filtro) y error con **Reintentar**.
- Aviso visible si falta `VITE_API_URL`.

### Diseño
Metáfora de **libreta escolar**: papel azulado, renglones azules, la línea roja del margen
separa las casillas del texto y, al completar una tarea, se dibuja un **tachón a mano** en rojo.
El tachón es un fondo SVG que se anima de 0 a 100 % y usa `box-decoration-break: clone`, así que funciona en títulos de varias líneas.
Tipografías: Playfair Display (título), Lora (texto) e IBM Plex Mono (fechas y contadores).
Tema oscuro, diseño adaptable (probado a 375 px sin scroll horizontal), foco visible, navegación
con teclado y `prefers-reduced-motion` respetado.

### Cómo se verificó
- `tsc -b && vite build` sin errores.
- En local, contra un **mock de la API** en Node con el mismo contrato, antes de tener AWS:
  escritorio, móvil y modo oscuro, con capturas de Playwright. Así se detectaron y corrigieron el tachón y el desbordamiento en móvil.
- En producción, contra la API real: crear → completar → editar → eliminar, comprobando que los datos persisten al recargar y que salen los avisos.

---

## 🏗️ Cómo se crearon los entornos con Terraform

### Organización del código (`terraform/`)

| Archivo | Qué define |
|---------|-----------|
| `providers.tf` | Terraform ≥ 1.5, providers `aws ~> 5.0` y `archive ~> 2.4`. Provider `aws` con `default_tags` (`Project`, `ManagedBy`) y un segundo provider `aws.untagged` sin etiquetas |
| `variables.tf` | `aws_region` (us-east-1), `project_name` (todo-serverless), `table_name` (todo-tasks), `cors_allow_origins` |
| `dynamodb.tf` | Tabla `todo-tasks`: `PAY_PER_REQUEST`, clave `id` (S) |
| `iam.tf` | Rol de ejecución de la Lambda, política gestionada de logs y política inline de DynamoDB |
| `lambda.tf` | Empaquetado ZIP, log group con retención de 7 días y la función |
| `api_gateway.tf` | HTTP API con CORS, integración proxy, 6 rutas, stage `$default` y permiso de invocación |
| `outputs.tf` | `api_url`, `lambda_function_name`, `dynamodb_table_name` |

### Los 16 recursos y su orden

Terraform deduce el orden a partir de las referencias entre recursos:

```
aws_dynamodb_table.tasks ─────────────┬──────────────► aws_iam_role_policy.dynamodb_access
                                      │ (ARN de la tabla)          ▲
aws_iam_role.lambda ──────────────────┼────────────────────────────┘
   └─► aws_iam_role_policy_attachment.lambda_logs
aws_cloudwatch_log_group.lambda       │
          └───────────────┬───────────┘ (TABLE_NAME, rol)
                          ▼
              aws_lambda_function.api ──► aws_lambda_permission.apigw
                          │                          ▲
aws_apigatewayv2_api.http ┼──────────────────────────┘ (execution_arn)
   ├─► aws_apigatewayv2_integration.lambda ──► aws_apigatewayv2_route.routes × 6
   └─► aws_apigatewayv2_stage.default ──► output api_url
```

- **Tabla, rol, log group y API** no dependen entre sí y se crearon en paralelo.
- **La Lambda** espera al rol, a la tabla (necesita su nombre en `TABLE_NAME`) y al log group
  (`depends_on` explícito, para que AWS no cree uno sin retención antes que Terraform).
- **Las rutas** esperan a la integración, que a su vez necesita el `invoke_arn` de la Lambda.

### Detalles de cada pieza
- **Empaquetado:** `data "archive_file"` comprime `lambda/handler.py` en `terraform/build/lambda.zip`.
  Su hash (`source_code_hash`) forma parte de la función, así que cualquier cambio en el código
  provoca una redespliegue en el siguiente `apply`, y si no hay cambios no se toca nada.
- **Seguridad (mínimo privilegio):**
  - El rol solo lo puede asumir `lambda.amazonaws.com`.
  - La política inline permite únicamente `PutItem`, `GetItem`, `UpdateItem`, `DeleteItem` y `Scan`, y solo sobre el ARN de `todo-tasks`.
  - `AWSLambdaBasicExecutionRole` añade la escritura de logs.
- **Acceso público:** en lugar de una Function URL (que en cuentas nuevas devuelve 403 por el
  bloqueo de acceso público de Lambda), se usa **API Gateway v2**. `aws_lambda_permission` deja
  que API Gateway invoque la función, limitado con `source_arn` a esta API concreta.
- **Rutas explícitas:** las 6 rutas se generan con `for_each` sobre una lista local. Cualquier ruta
  no declarada la rechaza API Gateway sin llegar a invocar (ni cobrar) la Lambda.
- **Protección del endpoint:** el stage limita a 20 peticiones/s con ráfagas de 50.
- **CORS en dos niveles:** API Gateway responde los preflight y filtra orígenes según
  `cors_allow_origins`. La Lambda también añade cabeceras, pero cuando CORS está configurado en la API, API Gateway las ignora y aplica las suyas.

### Ejecución paso a paso

Terraform se ejecutó dentro de **WSL (Ubuntu)**, sobre el sistema de archivos nativo del proyecto y
con las credenciales del usuario IAM `chelosalas170768`.

| # | Comando | Resultado |
|---|---------|-----------|
| 1 | `terraform init` · `fmt` · `validate` | Providers descargados; `.terraform.lock.hcl` fija sus versiones (se versiona en git) |
| 2 | `terraform apply -auto-approve` | ❌ `AccessDenied` en `iam:CreateRole` y `logs:CreateLogGroup`: el usuario no tenía permisos. No se creó nada |
| — | *(consola IAM)* | Se añadió la política `todo-serverless-deployer` (`docs/deployer-policy.json`) acotada a `todo-serverless-*` / `todo-tasks` |
| 3 | `terraform apply -auto-approve` | ⚠️ 15 de 16 recursos creados; falla el stage por `apigateway:TagResource` |
| — | *(consola IAM)* | API Gateway pasa a `apigateway:*`; el error persiste |
| 4 | `terraform apply -auto-approve` | ✅ con el stage en el provider `aws.untagged` (sin etiquetas) se crea el recurso que faltaba; se imprime `api_url` |
| 5 | `scripts/lambda-invoke.sh`, `scripts/smoke-test.sh` | ✅ 200 y 11/11 |
| 6 | `terraform apply -auto-approve` | ✅ tras el deploy en Vercel, `cors_allow_origins` pasa de `*` a `https://tareas-serverless.vercel.app` + `http://localhost:5173` (1 recurso modificado *in-place*, sin cortar el servicio) |

Como Terraform guarda en el **estado** lo que ya existe, cada `apply` tras un fallo solo creó lo que faltaba, sin duplicar ni recrear nada.

### Estado y entornos
- **Estado local** (`terraform/terraform.tfstate`), excluido de git porque contiene ARNs e identificadores de la cuenta.
  Para trabajo en equipo lo siguiente sería un backend remoto en S3 con bloqueo (fuera del alcance).
- **Un único entorno de AWS** (us-east-1). Todos los nombres salen de `project_name` y `table_name`,
  así que se podría levantar un segundo entorno (p. ej. `staging`) con otras variables o con `terraform workspace` sin tocar el código.
- **Entornos de la web**, conectados a la API mediante el output de Terraform:

  | Entorno | Dónde se define `VITE_API_URL` | ¿Pasa el CORS? |
  |---------|-------------------------------|---------------|
  | Local (`npm run dev`) | `frontend/.env.local` (no se versiona; plantilla en `.env.example`) | ✅ `localhost:5173` |
  | Vercel Production | Variable del proyecto | ✅ `tareas-serverless.vercel.app` |
  | Vercel Preview / Development | Variable del proyecto | ❌ dominios de preview no permitidos todavía |

- **Vercel:** `vercel link` creó el proyecto, `vercel env add` cargó la variable en los tres entornos,
  `vercel git connect` enlazó el repo de GitHub y `vercel deploy --prod` publicó. `vercel.json`
  indica que se instale y compile dentro de `frontend/` y `.vercelignore` evita subir Terraform y la Lambda.

### Reproducir desde cero

```bash
cd terraform
terraform init
terraform apply -auto-approve                  # ~45 s; imprime api_url
cd .. && scripts/lambda-invoke.sh && scripts/smoke-test.sh
cd frontend
echo "VITE_API_URL=$(terraform -chdir=../terraform output -raw api_url)" > .env.local
npm install && npm run dev
# al terminar:
cd ../terraform && terraform destroy -auto-approve
```

---

## 🚀 Publicación

- **GitHub:** repo `msalas170768/1.4.50-aws-lambda-vite` con `main` y `feat/serverless-todo` (PR #1).
- **Vercel:** proyecto `tareas-serverless` conectado al repo; producción en https://tareas-serverless.vercel.app.

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
