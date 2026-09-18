# Spec — Todo List Serverless (AWS Lambda + DynamoDB + Vite)

Aplicación de lista de tareas 100% serverless: backend en una Lambda (Python 3.12) con
DynamoDB, infraestructura en Terraform y frontend Vite + React desplegado en Vercel.
El README es la documentación para el alumno/evaluador; este archivo es la spec de trabajo.

## Estructura del repositorio

```
lambda/handler.py        # API REST completa (una sola Lambda con router interno)
terraform/               # IaC: providers, variables, dynamodb, iam, lambda, api_gateway, outputs
frontend/                # Vite + React + TypeScript + Tailwind
README.md                # documentación del proyecto (actualizar al terminar)
```

## Prerrequisitos (verificar antes de desplegar)

- Región AWS: `us-east-1`. Cuenta: `934526323130`, usuario IAM `chelosalas170768`.
- **Permisos IAM pendientes**: el usuario hoy NO tiene `iam:CreateRole`,
  `logs:CreateLogGroup`, `dynamodb:DescribeTable` ni `lambda:GetFunction` (comprobado:
  `terraform apply` falla con `AccessDenied`). Hace falta que se le concedan permisos sobre
  IAM (roles/policies), Lambda, DynamoDB, API Gateway v2 y CloudWatch Logs, o bien usar un
  rol de ejecución ya existente pasado como variable.
- Herramientas: Terraform ≥ 1.5, AWS CLI, Node ≥ 20, `gh`, Vercel CLI (`npx vercel`).
- GitHub: usar la cuenta `msalas170768` (`gh auth switch -u msalas170768`).
- Vercel: requiere `vercel login` interactivo (o `VERCEL_TOKEN`).
- Windows + WSL: `cmd.exe` no admite rutas UNC (`\\wsl.localhost\...`), así que `npm run`
  falla desde Windows sobre el repo. Ejecutar Node dentro de WSL o invocar los binarios
  con `node node_modules/...`.

## 1. Infraestructura con Terraform

1. **Lambda con acceso público**
   - `todo-serverless-api`, runtime `python3.12`, handler `handler.lambda_handler`,
     256 MB, timeout 10 s, env `TABLE_NAME`.
   - Empaquetado con `archive_file` desde `lambda/handler.py` (boto3 ya viene en el runtime).
   - Exposición pública mediante **API Gateway v2 (HTTP API)**, stage `$default` con
     auto-deploy, integración `AWS_PROXY` payload 2.0 y `aws_lambda_permission` para
     `apigateway.amazonaws.com`. No usar Function URL con `auth_type = NONE`: el
     "Block Public Access" de Lambda devuelve 403.
   - CORS en API Gateway (orígenes configurables vía variable, `*` por defecto) y
     headers CORS también en las respuestas de la Lambda.
   - Throttling en el stage (burst 50, rate 20) para limitar abuso del endpoint público.
   - Log group `/aws/lambda/todo-serverless-api` con retención de 7 días.
2. **DynamoDB accesible por la Lambda**
   - Tabla `todo-tasks`, `PAY_PER_REQUEST`, partition key `id` (S).
   - Rol de la Lambda con mínimo privilegio: `PutItem`, `GetItem`, `UpdateItem`,
     `DeleteItem`, `Scan` solo sobre el ARN de la tabla, más `AWSLambdaBasicExecutionRole`.
3. **Modelo de la lista de tareas**

   | Campo | Tipo | Notas |
   |-------|------|-------|
   | `id` | String (UUID v4) | Partition key, generado por la Lambda |
   | `title` | String | Obligatorio, se recorta, 1–200 caracteres |
   | `completed` | Boolean | `false` por defecto |
   | `createdAt` | String ISO-8601 UTC | Fijado al crear |
   | `updatedAt` | String ISO-8601 UTC | Actualizado en cada PUT |

4. **Outputs**: `api_url` (URL pública, fuente de `VITE_API_URL`), `lambda_function_name`,
   `dynamodb_table_name`.
5. El estado de Terraform es local y no se versiona (`*.tfstate` en `.gitignore`).

### Contrato de la API

Todas las respuestas son JSON con headers CORS. Errores: `{ "error": "<mensaje>" }`.

| Método | Path | Cuerpo | Éxito | Errores |
|--------|------|--------|-------|---------|
| GET | `/tasks` | — | 200 `Task[]` ordenado por `createdAt` desc | — |
| POST | `/tasks` | `{ title, completed? }` | 201 `Task` | 400 título vacío/largo, JSON inválido |
| GET | `/tasks/{id}` | — | 200 `Task` | 404 |
| PUT | `/tasks/{id}` | `{ title?, completed? }` (al menos uno) | 200 `Task` | 400, 404 |
| DELETE | `/tasks/{id}` | — | 204 | 404 |
| GET | `/health` | — | 200 `{ status: "ok" }` | — |

- Rutas desconocidas → 404; método no soportado → 405; excepción no controlada → 500
  genérico (el detalle solo va a CloudWatch).
- `completed` debe ser booleano; PUT/DELETE sobre un id inexistente usan
  `ConditionExpression attribute_exists(id)` → 404.
- `GET /tasks` pagina el `Scan` con `LastEvaluatedKey` hasta leer toda la tabla.

## 2. Testing

1. **Desplegar**: `cd terraform && terraform init && terraform apply -auto-approve`.
   Criterio: termina sin errores y muestra `api_url`.
2. **Probar la Lambda directamente**: `aws lambda invoke` con un evento HTTP API v2 de
   `GET /health` → `statusCode` 200.
3. **Probar la API end-to-end** (script `scripts/smoke-test.sh` con `curl`, recibe la URL):
   - `GET /health` → 200
   - `POST /tasks {"title":"Prueba"}` → 201 y devuelve `id`
   - `GET /tasks` → contiene la tarea creada
   - `GET /tasks/{id}` → 200
   - `PUT /tasks/{id} {"completed":true}` → 200 con `completed: true`
   - `PUT /tasks/{id} {"title":"Renombrada"}` → 200
   - `POST /tasks {"title":""}` → 400; `GET /tasks/no-existe` → 404
   - `DELETE /tasks/{id}` → 204; segundo `DELETE` → 404
   - Preflight `OPTIONS /tasks` con `Origin` → devuelve `access-control-allow-origin`
   - El script limpia lo que crea y sale con código ≠ 0 si algo falla.
4. Revisar CloudWatch Logs si hay 500.

## 3. Web en Vite para consumir la API

1. **Stack**: Vite + React + TypeScript + Tailwind CSS. Tipografía editorial
   (Playfair Display para títulos, Lora para texto). Sin librerías de UI pesadas.
2. **Configuración**: la URL de la API llega por `VITE_API_URL` (`.env.local` en local,
   variable de entorno en Vercel). Sin URLs hardcodeadas; incluir `.env.example`.
   Si falta la variable, la UI muestra un aviso claro.
3. **Capa de datos**: módulo `src/api.ts` tipado (`Task`, `listTasks`, `createTask`,
   `updateTask`, `deleteTask`) que lanza errores con el mensaje del backend.
4. **Funcionalidad (operaciones sobre la lista)**
   - Listar tareas al cargar.
   - Crear tarea (input + Enter o botón; validación de vacío y 200 caracteres).
   - Marcar / desmarcar como completada.
   - Editar el título en línea (doble clic o botón; Enter guarda, Escape cancela).
   - Eliminar tarea.
   - Filtros Todas / Pendientes / Completadas y contador de pendientes.
   - "Borrar completadas" (N llamadas DELETE).
   - Actualización optimista con rollback si la API falla.
5. **Calidad "profesional"**
   - Estados de carga (skeleton), vacío (mensaje ilustrativo) y error (con reintentar).
   - Notificaciones breves (toast) de éxito/error.
   - Responsive (móvil a escritorio, sin scroll horizontal), modo claro/oscuro.
   - Accesible: labels, foco visible, navegable con teclado, contraste AA.
   - Fechas relativas ("hace 5 min") a partir de `createdAt`.
   - `npm run build` sin errores de TypeScript ni lint.
6. **Publicación**
   - **GitHub**: crear repo público `1.4.50-aws-lambda-vite` en la cuenta `msalas170768`
     y añadirlo como remote `github` (el `origin` actual es GitLab y se mantiene).
     Push de `main` a ambos.
   - **Vercel**: proyecto con root directory `frontend/`, framework Vite,
     `VITE_API_URL` = output `api_url` en Production, deploy a producción.
   - Tras el deploy, restringir `cors_allow_origins` al dominio de Vercel
     (+ `http://localhost:5173`) y volver a aplicar Terraform.

## Criterios de aceptación

- [ ] `terraform apply -auto-approve` crea DynamoDB, rol IAM, Lambda y API Gateway sin errores.
- [ ] El smoke test pasa completo contra la URL pública.
- [ ] La web en Vercel lista, crea, edita, completa y elimina tareas contra la API real.
- [ ] Código en GitHub (y GitLab), sin secretos ni `tfstate` versionados.
- [ ] README actualizado: URL de la web, URL de la API, cómo ejecutar, decisiones tomadas.

## Fuera de alcance

- Autenticación de usuarios / tareas por usuario.
- Backend remoto de Terraform (S3 + lock), CI/CD, dominios propios.

## Limpieza

`cd terraform && terraform destroy -auto-approve` y eliminar el proyecto de Vercel si ya no se usa.
