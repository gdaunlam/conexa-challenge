pending
    Postman collection
    README.md final
        aclara como usar la aplicacion
        indica como abrir swagger
        aclara donde estan los archivos adjuntos (postman collection, docs)
        nombra desiciones o contemplaciones especificas especiales, ej cosas
        dejadas de lado, hechas diferentes por motivos de tiempo o prioridades, o desiciones tomadas por falta de claridad en los requerimientos
    nth
        Tests e2e con supertest
in progress
done
    dominio
        Implementacion de
            endpoints
            validaciones
            requests
            responses
            dtos
            entities
    Swagger
    Tests unitarios
    Autenticacion JWT
    Autorizacion
        Roles
        Permisos
    estructura
        Base de datos
            TypeORM
            Migraciones
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
    nth
        Logging + trace_id
    docs
        Endpoints de la API
            Validaciones
            Requests
            Responses
            DTOs
            Entities
