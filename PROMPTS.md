📚 BIBLIOTECA DE PROMPTS PARA CLAUDE CODE
═══════════════════════════════════════════
PARTE 1: PROMPTS ESPECÍFICOS PARA GLITCH/AUTOREPORT
═══════════════════════════════════════════
🔧 PROMPT 1: NUEVO ENDPOINT FASTAPI
Actúa como un desarrollador backend senior especializado en FastAPI + Python 3.11.
Contexto del proyecto:
- Proyecto: Glitch/AutoReport (sistema de informes técnicos)
- Stack: FastAPI + WeasyPrint + Jinja2
- Estructura: backend/[modulo]/router.py, backend/[modulo]/service.py
- Puerto: 7860
- Prefijo API: /api
Tu tarea: Crear un nuevo endpoint para [DESCRIBIR FUNCIONALIDAD]
Instrucciones:
1) Analiza los routers existentes en backend/*/router.py para seguir el patrón
2) Usa el COLUMN_MAPPING existente para normalización de datos si aplica
3) Crea el endpoint con:
   - Validación con Pydantic (models.py)
   - Manejo de errores con HTTPException
   - Documentación OpenAPI (summary, response_model)
4) Si genera PDF, usa WeasyPrint + Jinja2 templates
5) No modifiques archivos fuera del módulo indicado
Resultado esperado:
- Nuevo endpoint funcional en /api/[modulo]/[recurso]
- Modelo Pydantic validado
- Documentación OpenAPI visible en /docs
-------------------------------
⚛️ PROMPT 2: NUEVO COMPONENTE REACT
Actúa como un desarrollador frontend senior especializado en React 18 + TypeScript + TailwindCSS.
Contexto del proyecto:
- Proyecto: Glitch/AutoReport frontend
- Stack: React 18 + Vite + TailwindCSS + Framer Motion
- Iconos: lucide-react
- Estructura: frontend/src/components/tools/[Herramienta]/
- API: usar fetch o axios con /api/[endpoint]
Tu tarea: Crear un componente para [DESCRIBIR COMPONENTE]
Instrucciones:
1) Estudia componentes similares en frontend/src/components/tools/
2) Usa hooks personalizados de src/hooks/ si aplica (useAsyncAction, useLocalDraft, etc.)
3) Implementa:
   - Props tipadas con TypeScript
   - Estados con useState/useReducer según complejidad
   - Animaciones con Framer Motion si hay interacciones
   - Diseño responsive con TailwindCSS
4) No uses librerías externas no listadas en package.json
Resultado esperado:
- Componente funcional en la ruta correcta
- Tipado TypeScript completo
- Diseño consistente con el resto de la app
-----------------
🐛 PROMPT 3: DEBUGGING EN GLITCH/AUTOREPORT
Actúa como un ingeniero de software senior especializado en debugging de aplicaciones full-stack.
Contexto del proyecto:
- Proyecto: Glitch/AutoReport
- Stack: FastAPI (backend:7860) + React/Vite (frontend:5173)
- Flujo: React → /api → FastAPI → WeasyPrint → PDF
Problema reportado:
[DESCRIBIR EL BUG: qué pasa, cuándo, en qué módulo]
Instrucciones:
1) Identifica el origen del problema (frontend/backend/template)
2) Revisa:
   - Si es frontend: componente, hooks, llamadas API en src/utils/apiClient.ts
   - Si es backend: router.py, models.py, normalización COLUMN_MAPPING
   - Si es PDF: template Jinja2 en backend/*/templates/
3) Proporciona:
   - Diagnóstico exacto del error
   - Archivo y línea donde ocurre
   - Solución con código corregido
   - Pasos para reproducir y verificar
Resultado esperado:
- Bug identificado y corregido
- Explicación de la causa raíz
- Test o forma de verificar el fix
----------------------
📄 PROMPT 4: NUEVA PLANTILLA PDF (JINJA2)
Actúa como un desarrollador especializado en generación de PDFs con WeasyPrint + Jinja2.
Contexto del proyecto:
- Proyecto: Glitch/AutoReport
- Motor PDF: WeasyPrint + Jinja2
- Ubicación plantillas: backend/[modulo]/templates/
- Estilo CSS: embebido en el template o technical-theme.css
Tu tarea: Crear una nueva plantilla PDF para [DESCRIBIR DOCUMENTO]
Instrucciones:
1) Analiza plantillas existentes en backend/*/templates/
2) Usa la misma estructura HTML base (headers, estilos, formato A4)
3) Implementa:
   - Variables Jinja2 con {{ variable }}
   - Condicionales {% if %} para secciones opcionales
   - Loops {% for %} para tablas/listas
   - CSS para impresión (page-break, márgenes, fuentes)
4) Asegura compatibilidad con WeasyPrint (evita CSS no soportado)
Resultado esperado:
- Template HTML/Jinja2 funcional
- Integración con el router que lo invoca
- Muestra de cómo pasar datos al template
----------------------
🗂️ PROMPT 5: MODIFICAR COLUMN_MAPPING
Actúa como un desarrollador backend especializado en procesamiento de datos Excel/CSV.
Contexto del proyecto:
- Proyecto: Glitch/AutoReport
- Archivo clave: backend/technical_reports/router.py (línea ~90)
- Función: COLUMN_MAPPING normaliza nombres de columnas
Tu tarea: Agregar soporte para nuevos campos/columnas:
[LISTAR NUEVOS CAMPOS A SOPORTAR]
Instrucciones:
1) Lee el COLUMN_MAPPING actual en backend/technical_reports/router.py
2) Agrega las nuevas variaciones de nombres de columna
3) Mantiene el patrón: 'nombre_variante': 'nombre_normalizado'
4) Actualiza la función normalize_header_value si es necesario
5) Verifica que no rompa la normalización existente
Formato de entrada:
| Nombre en Excel | Nombre Normalizado |
|-----------------|-------------------|
| [ejemplo]       | [destino]         |
Resultado esperado:
- COLUMN_MAPPING actualizado
- Lista de campos nuevos soportados
- Ejemplo de prueba con datos de ejemplo
----------------------------
═══════════════════════════════════════════
PARTE 2: PROMPTS GENERALES (CUALQUIER PROYECTO)
═══════════════════════════════════════════
🔄 PROMPT 6: REFACTORIZACIÓN DE CÓDIGO
Actúa como un ingeniero de software senior especializado en clean code y refactoring.
Contexto del proyecto:
- Archivo a refactorizar: [RUTA DEL ARCHIVO]
- Lenguaje: [LENGUAJE]
- Framework: [FRAMEWORK SI APLICA]
Tu tarea: Refactorizar el código siguiendo principios SOLID y clean code.
Criterios de refactorización:
1) Aplicar principios SOLID donde aplique
2) Reducir complejidad ciclomática
3) Extraer funciones puras cuando sea posible
4) Mejorar naming de variables y funciones
5) Eliminar código muerto o duplicado
6) Mantener la misma funcionalidad (no cambiar comportamiento)
Restricciones:
- No cambiar la API pública del módulo
- Mantener compatibilidad con tests existentes
- No agregar nuevas dependencias
Resultado esperado:
- Código refactorizado con mejores prácticas
- Explicación de cambios principales
- Métricas antes/después (si aplica)
---------------------------
🧪 PROMPT 7: CREAR TESTS
Actúa como un ingeniero de QA especializado en testing automatizado.
Contexto del proyecto:
- Framework de tests: [JEST / VITEST / PYTEST / OTRO]
- Archivo a testear: [RUTA]
- Cobertura actual: [SI SE CONOCE]
Tu tarea: Crear tests unitarios/integración para [ARCHIVO/MÓDULO]
Instrucciones:
1) Analiza el código a testear y sus dependencias
2) Crea tests que cubran:
   - Casos de éxito (happy path)
   - Casos de error y edge cases
   - Casos límite (boundary conditions)
3) Usa mocks/stubs para dependencias externas
4) Nombra los tests descriptivamente (should/when pattern)
5) Sigue el patrón AAA (Arrange-Act-Assert)
Formato de test:
```[lenguaje]
describe('función|módulo', () => {
  it('should [comportamiento] when [condición]', () => {
    // Arrange
    // Act
    // Assert
  });
});
Resultado esperado:
- Archivo de tests completo
- Cobertura de casos principales y edge cases
- Comando para ejecutar los tests
-----------------------
### ⚡ PROMPT 8: OPTIMIZACIÓN DE RENDIMIENTO
```text
Actúa como un ingeniero de rendimiento especializado en optimización de aplicaciones.
Contexto del proyecto:
- Stack: [DESCRIBIR STACK]
- Área problemática: [DESCRIBIR PROBLEMA DE RENDIMIENTO]
- Métricas actuales: [SI SE TIENEN]
Tu tarea: Optimizar el rendimiento de [COMPONENTE/MÓDULO/ENDPOINT]
Instrucciones:
1) Identifica cuellos de botella:
   - Frontend: re-renders innecesarios, bundle size, llamadas API
   - Backend: queries lentas, N+1 queries, procesamiento pesado
   - Base de datos: índices faltantes, queries ineficientes
2) Propone optimizaciones específicas con:
   - Estimación de mejora esperada
   - Impacto en el código existente
   - Trade-offs si existen
3) Implementa la solución más impactante
Resultado esperado:
- Diagnóstico de problemas de rendimiento
- Código optimizado
- Métricas antes/después o forma de medir
-------------------------------------
🔐 PROMPT 9: REVISIÓN DE SEGURIDAD
Actúa como un especialista en seguridad de aplicaciones (AppSec).
Contexto del proyecto:
- Stack: [DESCRIBIR]
- Tipo de aplicación: [WEB / API / MOBILE]
- Datos sensibles: [SI/NO, QUÉ TIPO]
Tu tarea: Realizar una revisión de seguridad del siguiente código/área:
[RUTA O DESCRIPCIÓN]
Checklist de revisión:
1) Validación de entrada (input validation)
2) Sanitización de salida (XSS)
3) Inyección SQL / NoSQL
4) Autenticación y autorización
5) Manejo de secretos y credenciales
6) Exposición de datos sensibles
7) CSRF, CORS, headers de seguridad
8) Dependencias vulnerables
Resultado esperado:
- Lista de vulnerabilidades encontradas (por severidad)
- Código corregido con fixes aplicados
- Recomendaciones de mejores prácticas
-----------------------------------------
📝 PROMPT 10: CREAR PULL REQUEST
Actúa como un desarrollador senior encargado de crear Pull Requests de calidad.
Contexto del proyecto:
- Repositorio: [URL O NOMBRE]
- Branch origen: [NOMBRE]
- Branch destino: [main/develop]
- Cambios realizados: [DESCRIPCIÓN BREVE]
Tu tarea: Crear un Pull Request profesional y completo.
Instrucciones:
1) Ejecuta git diff para ver todos los cambios
2) Ejecuta git log para ver commits recientes
3) Genera un PR con:
Estructura del PR:
## Summary
[2-3 bullets con los cambios principales]
## Changes
[Lista de archivos modificados y qué cambió]
## Testing
[Cómo probar los cambios]
## Screenshots (si aplica)
[Capturas de pantalla]
## Checklist
- [ ] Tests pasando
- [ ] No breaking changes
- [ ] Documentación actualizada
Resultado esperado:
- Título de PR descriptivo
- Body del PR completo en formato markdown
- Comando gh para crear el PR
--------------------------------------
🏗️ PROMPT 11: ARQUITECTURA DE NUEVA FEATURE
Actúa como un arquitecto de software senior.
Contexto del proyecto:
- Stack actual: [DESCRIBIR]
- Estructura: [DESCRIBIR ESTRUCTURA DE CARPETAS]
- Restricciones: [LISTAR SI HAY]
Tu tarea: Diseñar la arquitectura para implementar:
[DESCRIBIR NUEVA FEATURE]
Instrucciones:
1) Analiza la estructura actual del proyecto
2) Propón la arquitectura considerando:
   - Dónde ubicar los nuevos archivos
   - Patrones de diseño a usar
   - Separación de responsabilidades
   - Escalabilidad
3) No implementes aún, solo diseña
Resultado esperado:
- Diagrama o descripción de arquitectura
- Lista de archivos a crear/modificar
- Decisiones técnicas justificadas
- Riesgos identificados
---
📖 PROMPT 12: DOCUMENTACIÓN DE CÓDIGO
Actúa como un technical writer especializado en documentación de software.
Contexto del proyecto:
- Archivo/módulo: [RUTA]
- Audiencia: [DESARROLLADORES / USUARIOS FINALES / AMBOS]
- Idioma: [ESPAÑOL / INGLÉS]
Tu tarea: Documentar [ARCHIVO/MÓDULO/FUNCIÓN]
Instrucciones:
1) Lee el código y entiende su propósito
2) Crea documentación que incluya:
   - Propósito del módulo/archivo
   - Cómo usarlo (ejemplos de código)
   - Parámetros y tipos (si aplica)
   - Valores de retorno
   - Excepciones/errores posibles
   - Notas importantes o edge cases
Formato según tipo:
- Código: JSDoc / docstrings / comentarios inline
- README: Markdown con ejemplos prácticos
- API: OpenAPI/Swagger descriptions
Resultado esperado:
- Documentación completa y clara
- Ejemplos de uso prácticos
- Actualización del archivo correspondiente
----------------------------------
🔍 PROMPT 13: ANÁLISIS DE CÓDIGO HEREDADO
Actúa como un ingeniero de software especializado en legacy code y modernización.
Contexto del proyecto:
- Archivo/módulo: [RUTA]
- Antigüedad estimada: [SI SE CONOCE]
- Problema reportado: [SI HAY]
Tu tarea: Analizar el siguiente código legado y proporcionar un informe.
Instrucciones:
1) Lee el código completamente
2) Genera un informe con:
   - Propósito del código (qué hace)
   - Dependencias y acoplamiento
   - Problemas identificados (smells, bugs, deudas técnicas)
   - Riesgos de modificarlo
   - Sugerencias de modernización
Resultado esperado:
- Informe estructurado en markdown
- Diagrama de flujo si es complejo (ascii o descripción)
- Plan de acción para mejoras (si aplica)
---
🐳 PROMPT 14: DOCKER Y DEVOPS
Actúa como un ingeniero DevOps especializado en Docker y CI/CD.
Contexto del proyecto:
- Stack: [DESCRIBIR]
- Dockerfile actual: [SI EXISTE]
- Plataforma despliegue: [DOCKER / KUBERNETES / VERCEL / OTRO]
Tu tarea: [CREAR / OPTIMIZAR] la configuración de Docker para el proyecto.
Instrucciones:
1) Analiza los requisitos de la aplicación
2) Crea/u optimiza:
   - Dockerfile con multi-stage builds si aplica
   - .dockerignore apropiado
   - docker-compose.yml si hay múltiples servicios
   - Variables de entorno necesarias
3) Considera:
   - Tamaño de imagen optimizado
   - Seguridad (no root user, mínimos permisos)
   - Build cache eficiente
   - Health checks
Resultado esperado:
- Dockerfile optimizado
- Instrucciones de build y run
- Variables de entorno documentadas
----------------------------------------
🔌 PROMPT 15: INTEGRACIÓN DE API EXTERNA
Actúa como un desarrollador senior especializado en integraciones de APIs.
Contexto del proyecto:
- Proyecto: [NOMBRE]
- Stack: [DESCRIBIR]
- API a integrar: [NOMBRE Y DOCUMENTACIÓN]
Tu tarea: Integrar la API de [SERVICIO] en el proyecto.
Instrucciones:
1) Estudia la documentación de la API externa
2) Diseña la capa de integración:
   - Cliente HTTP (fetch/axios/httpx)
   - Manejo de autenticación
   - Tipado de request/response
   - Manejo de errores y reintentos
   - Rate limiting si aplica
3) Crea funciones/servicios encapsulados
4) No expongas secrets en el código
Resultado esperado:
- Cliente de API funcional
- Tipos/interfaces para requests y responses
- Manejo de errores robusto
- Ejemplo de uso
--------------------------------------------
═══════════════════════════════════════════
PARTE 3: PROMPTS ESPECIALES
═══════════════════════════════════════════
🚨 PROMPT 16: EMERGENCIA / HOTFIX
Actúa como un ingeniero de SRE (Site Reliability Engineer) en modo emergencia.
URGENCIA: [CRÍTICA / ALTA / MEDIA]
Contexto del proyecto:
- Stack: [DESCRIBIR]
- Producción afectada: [SÍ/NO]
Problema:
[DESCRIBIR EL PROBLEMA CRÍTICO]
Instrucciones:
1) Identifica la causa raíz rápidamente
2) Propón:
   - Fix inmediato (hotfix)
   - Fix permanente (para después)
3) Prioriza:
   - Restaurar servicio > Solución elegante
   - Minimal change principle
4) Documenta el incidente
Resultado esperado:
- Diagnóstico rápido
- Código de hotfix
- Pasos para aplicar y verificar
- Post-mortem simplificado
---------------------------------------------🎯 PROMPT 17: CODE REVIEW
Actúa como un senior developer realizando code review.
Contexto del proyecto:
- Repositorio: [NOMBRE]
- Stack: [DESCRIBIR]
- PR a revisar: [NÚMERO O DESCRIPCIÓN]
Tu tarea: Realizar un code review completo y constructivo.
Criterios de revisión:
1) Funcionalidad: ¿El código hace lo que debe?
2) Calidad: ¿Es legible y mantenible?
3) Seguridad: ¿Hay vulnerabilidades?
4) Performance: ¿Hay ineficiencias?
5) Testing: ¿Hay tests adecuados?
6) Documentación: ¿Está documentado?
Formato de feedback:
- ✅ Aprobado: [qué está bien]
- ⚠️ Sugerencia: [mejoras opcionales]
- ❌ Requerido: [cambios necesarios antes de merge]
Resultado esperado:
- Review completo con comentarios específicos
- Sugerencias de código concreto
- Veredicto: APPROVE / REQUEST CHANGES / COMMENT
---------------------------------------------
📦 PROMPT 18: MIGRACIÓN DE DEPENDENCIA
Actúa como un ingeniero de software especializado en migraciones y mantenimiento.
Contexto del proyecto:
- Dependencia actual: [NOMBRE Y VERSIÓN]
- Dependencia destino: [NOMBRE Y VERSIÓN]
- Archivos afectados: [SI SE CONOCEN]
Tu tarea: Migrar de [LIB ACTUAL] a [LIB NUEVA] con breaking changes mínimos.
Instrucciones:
1) Busca todos los usos de la dependencia actual
2) Mapea las diferencias de API entre versiones
3) Crea plan de migración:
   - Cambios de imports
   - Cambios de API
   - Configuraciones nuevas
   - Tests a actualizar
4) Ejecuta la migración
5) Verifica que los tests pasen
Resultado esperado:
- Código migrado
- Lista de breaking changes manejados
- Tests actualizados si fue necesario
- Comando para verificar la migración
---------------------------------------------
🗃️ PROMPT 19: BASE DE DATOS
Actúa como un DBA y desarrollador backend especializado.
Contexto del proyecto:
- Motor de BD: [POSTGRES / MYSQL / MONGODB / SQLITE / OTRO]
- ORM/ODM: [PRISMA / SEQUELIZE / SQLALCHEMY / OTRO]
- Migraciones: [SI/NO, HERRAMIENTA]
Tu tarea: [CREAR / MODIFICAR / OPTIMIZAR] [TABLA/QUERY/MODELO]
Instrucciones:
1) Analiza el esquema actual
2) Diseña o modifica considerando:
   - Normalización apropiada
   - Índices necesarios
   - Integridad referencial
   - Performance de queries comunes
3) Crea migración si aplica
4) Actualiza modelos en código
Resultado esperado:
- Schema/DDL actualizado
- Modelos ORM sincronizados
- Migración creada (si aplica)
- Queries optimizadas (si aplica)
---------------------------------------------
🌐 PROMPT 20: API REST COMPLETA
Actúa como un backend architect especializado en APIs REST.
Contexto del proyecto:
- Framework: [EXPRESS / FASTAPI / NESTJS / OTRO]
- Base de datos: [TIPO]
- Autenticación: [TIPO SI APLICA]
Tu tarea: Crear una API REST completa para [RECURSO/ENTIDAD].
Instrucciones:
1) Diseña los endpoints siguiendo REST:
   - GET /recurso (listar)
   - GET /recurso/:id (obtener)
   - POST /recurso (crear)
   - PUT /recurso/:id (actualizar)
   - DELETE /recurso/:id (eliminar)
2) Implementa:
   - Validación de entrada
   - Manejo de errores HTTP apropiados
   - Paginación en listados
   - Filtros y ordenamiento
   - Respuestas consistentes
Resultado esperado:
- Router/Controller completo
- Modelos/DTOs tipados
- Documentación de endpoints
- Ejemplos de request/response
---------------------------------------------

Write me a fully complete web app as a single HTML file. The app should contain a simple side-scrolling game where I use WASD to move around. When moving around the world, occasionally the character/sprite will encounter words. When a word is encountered, the player must correctly type the word as fast as possible.The faster the word is successfully typed, the more point the player gets. We should have a counter in the top-right to keep track of points. Words should be random and highly variable to keep the game interesting.

You should make the website very aesthetic and use Tailwind.

---------------------------------------------
Your task is to analyze the following report:

[Full text of Matterport SEC filing 10-K 2023, not pasted here for brevity]

Summarize this annual report in a concise and clear manner, and identify key market trends and takeaways. Output your findings as a short memo I can send to my team. The goal of the memo is to ensure my team stays up to date on how financial institutions are faring and qualitatively forecast and identify whether there are any operating and revenue risks to be expected in the coming quarter. Make sure to include all relevant details in your summary and analysis.
------------------------------------------
Write me a Google apps script that will translate all text in a Google Slides presentation to Korean
----------------------------
Transform the following natural language requests into valid SQL queries. Assume a database with the following tables and columns exists:

Customers:
- customer_id (INT, PRIMARY KEY)
- first_name (VARCHAR)
- last_name (VARCHAR)
- email (VARCHAR)
- phone (VARCHAR)
- address (VARCHAR)
- city (VARCHAR)
- state (VARCHAR)
- zip_code (VARCHAR)

Products:
- product_id (INT, PRIMARY KEY)
- product_name (VARCHAR)
- description (TEXT)
- category (VARCHAR)
- price (DECIMAL)
- stock_quantity (INT)

Orders:
- order_id (INT, PRIMARY KEY)
- customer_id (INT, FOREIGN KEY REFERENCES Customers)
- order_date (DATE)
- total_amount (DECIMAL)
- status (VARCHAR)

Order_Items:
- order_item_id (INT, PRIMARY KEY)
- order_id (INT, FOREIGN KEY REFERENCES Orders)
- product_id (INT, FOREIGN KEY REFERENCES Products)
- quantity (INT)
- price (DECIMAL)

Reviews:
- review_id (INT, PRIMARY KEY)
- product_id (INT, FOREIGN KEY REFERENCES Products)
- customer_id (INT, FOREIGN KEY REFERENCES Customers)
- rating (INT)
- comment (TEXT)
- review_date (DATE)

Employees:
- employee_id (INT, PRIMARY KEY)
- first_name (VARCHAR)
- last_name (VARCHAR)
- email (VARCHAR)
- phone (VARCHAR)
- hire_date (DATE)
- job_title (VARCHAR)
- department (VARCHAR)
- salary (DECIMAL)

Provide the SQL query that would retrieve the data based on the natural language request.
User	Get the list of customers who have placed orders but have not provided any reviews, along with the total amount they have spent on orders.

--------------------------------------
I have made some changes to my local files and I want to save them in my local Git repository. What Git command should I use?

--------------------------------------
As a data conversion expert, your task is to convert data from different formats (JSON, XML, etc.) into properly formatted CSV files. The user will provide the input data in the original format, along with any specific requirements or preferences for the CSV output (e.g., column order, delimiter, encoding). Ensure that you have a clear understanding of the data structure and the desired CSV format, asking any clarifying questions as needed. Once you have the necessary information, generate the CSV output by following the appropriate formatting rules, such as using commas as delimiters, enclosing values in quotes if necessary, and handling special characters or line breaks correctly. Finally, provide any additional instructions or tips for saving or using the CSV file.
User	Please convert the following JSON data into a CSV file:

[
{
"name": "John Doe",
"age": 30,
"city": "New York",
"email": "john.doe@example.com"
},
{
"name": "Jane Smith",
"age": 25,
"city": "London",
"email": "jane.smith@example.com"
},
{
"name": "Bob Johnson",
"age": 35,
"city": "Paris",
"email": "bob.johnson@example.com"
}
]
Requirements:
- Columns in the CSV should be in the order: name, age, city, email
- Use semicolons (;) as delimiters
- Enclose all values in double quotes (")

--------------------------------------  
Your task is to take the plain text message provided and convert it into an expressive, emoji-rich message that conveys the same meaning and intent. Replace key words and phrases with relevant emojis where appropriate to add visual interest and emotion. Use emojis creatively but ensure the message remains clear and easy to understand. Do not change the core message or add new information.
User	All the world’s a stage, and all the men and women merely players. They have their exits and their entrances; And one man in his time plays many parts.

--------------------------------------
	Your task is to take the code snippet provided and explain it in simple, easy-to-understand language. Break down the code's functionality, purpose, and key components. Use analogies, examples, and plain terms to make the explanation accessible to someone with minimal coding knowledge. Avoid using technical jargon unless absolutely necessary, and provide clear explanations for any jargon used. The goal is to help the reader understand what the code does and how it works at a high level.
User	import random def bubble*sort(arr): n = len(arr) for i in range(n-1): for j in range(n-i-1): if arr[j] > arr[j+1]: arr[j], arr[j+1] = arr[j+1], arr[j] return arr numbers = [random.randint(1, 100) for * in range(10)] print("Unsorted array:", numbers) sorted_numbers = bubble_sort(numbers) print("Sorted array:", sorted_numbers)      
-----------------------------------------
Your task is to take the provided natural language description of a process or task and transform it into clear, concise step-by-step directions that are logical, sequential, and easy to follow. Use imperative language and begin each step with an action verb. Provide necessary details and explanations to ensure the reader can complete the task successfully. If the original description is unclear, ambiguous, or lacks sufficient information, ask for clarification or additional details.
User	To make a cup of tea, start by boiling some water in a kettle. While the water is heating up, get a mug and put a tea bag in it. Once the water is boiling, carefully pour it into the mug, over the tea bag. Let the tea steep for a few minutes, depending on how strong you like it. After steeping, remove the tea bag and add milk and sugar to taste. Stir everything together and enjoy your hot cup of tea.



═══════════════════════════════════════════
USO DE LOS PROMPTS
═══════════════════════════════════════════
Cómo usar esta biblioteca:
1. Copia el prompt que necesites
2. Reemplaza los campos entre [CORCHETES] con tu información
3. Pega en Claude Code y ejecuta