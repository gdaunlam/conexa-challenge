pending
    dominio
        Implementacion de
            endpoints
            validaciones
            requests
            responses
            dtos
            entities
        Postman collection
        Swagger
        Tests unitarios
        Autenticacion JWT
        Autorizacion
            Roles
            Permisos
    nth
        Tests e2e con supertest
        Logging + trace_id
in progress
    estructura
        Base de datos
            TypeORM
            Migraciones
                Migrations en produccion
                    Estrategia: migrationsRun=false en runtime + pnpm migration:run como
                        step pre-deploy en CI/CD.
                    Razon: single instance (no multi-replica) es el scope del proyecto.
                        TypeORM no provee lock distribuido built-in (no leader election,
                        no pg_try_advisory_lock). Si se olvida el step pre-deploy, la app
                        bootea con schema desactualizado.
                    Si el deploy se vuelve N replicas en el futuro, migrar a
                        pg_try_advisory_lock wrapper o initContainer k8s.
                    Aplicado en src/database/database.module.ts (buildTypeOrmOptions) y
                        src/database/data-source.ts. Comandos pnpm: migration:run y
                        migration:revert operativos; Init migration es no-op idempotente.
        classValidator
        Husky
        Environment variables
        Docker
            postgresql
            docker-compose
        separacion en modulos (carpetas, ej user, auth, etc)
            separacion en capas (carpetas) cada una con tests
                controller
                    recibe las peticiones y valida sus datos
                    mapea requests a DTOs del service
                    mapea responses de service a response del controller
                service
                    realiza validaciones de negocio
                    ejecuta flujos de negocio usando los repositories
                    retorna las mismas entities que recibe del repository
                repository
                    convierte los dtos a querys de la base de datos
                    contiene la logica de acceso a datos
                    devuelve entities o arrays de entities
                entity
                    contiene la definicion de las tablas y los modelos de datos
                dto
                    contiene los DTOs (Data Transfer Objects) para las requests y responses
                middleware (si se necesita)
                guards (si se necesita)
                pipes (si se necesita)
                filters (si se necesita)
                utils (si se necesita)
done
    docs
        Endpoints de la API
            Validaciones
            Requests
            Responses
            DTOs
            Entities