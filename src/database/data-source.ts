import 'reflect-metadata';
import { DataSource } from 'typeorm';
import configuration from '../config/configuration';
import { assertProductionHardeningSync } from '../config/env.validation';

const DATA_SOURCE_CONNECT_TIMEOUT_MS = 5000;
const DATA_SOURCE_STATEMENT_TIMEOUT_MS = 5000;
const DATA_SOURCE_QUERY_TIMEOUT_MS = 5000;

const config = configuration();

assertProductionHardeningSync(process.env);

const AppDataSource = new DataSource({
  type: 'postgres',
  host: config.database.host,
  port: config.database.port,
  username: config.database.username,
  password: config.database.password,
  database: config.database.database,
  entities: [__dirname + '/../**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: false,
  migrationsRun: false,
  connectTimeoutMS: DATA_SOURCE_CONNECT_TIMEOUT_MS,
  extra: {
    statement_timeout: DATA_SOURCE_STATEMENT_TIMEOUT_MS,
    query_timeout: DATA_SOURCE_QUERY_TIMEOUT_MS,
  },
});

export default AppDataSource;
