 import { DataSource, DataSourceOptions } from 'typeorm';
 import { config } from 'dotenv';
 import { resolve } from 'path';
 
 // 加载 .env 文件（根据 NODE_ENV 选择环境文件）
 const nodeEnv = process.env.NODE_ENV || 'development';
 const envFile = nodeEnv === 'production' ? '.env.production'
   : nodeEnv === 'staging' ? '.env.staging'
   : '.env';
 config({ path: resolve(__dirname, `../../${envFile}`) });
 
 const dbType = process.env.DB_TYPE || 'sqlite';
 
 let dataSourceOptions: DataSourceOptions;
 
 if (dbType === 'postgres') {
   // postgres 用独立基线 + 向量迁移（sqlite 方言迁移不加载）
   dataSourceOptions = {
     type: 'postgres',
     host: process.env.DB_HOST || 'localhost',
     port: parseInt(process.env.DB_PORT || '5432', 10),
     username: process.env.DB_USER || 'postgres',
     password: process.env.DB_PASSWORD || 'postgres',
     database: process.env.DB_NAME || 'front',
     entities: [resolve(__dirname, '../**/*.entity{.ts,.js}')],
     migrations: [
       resolve(__dirname, '../migrations/*PostgresInitialSchema*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddKnowledgeEmbeddings*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddUserMemory*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddConversationSummary*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddKnowledgeDocumentColumns*').replace(/\\/g, '/'),
       resolve(__dirname, '../migrations/*AddKnowledgeChunks*').replace(/\\/g, '/'),
     ],
   };
 } else {
   dataSourceOptions = {
     type: 'better-sqlite3',
     database: process.env.DB_PATH || './data/front.sqlite',
     entities: [resolve(__dirname, '../**/*.entity{.ts,.js}')],
     migrations: [resolve(__dirname, '../migrations/*{.ts,.js}')],
   };
 }
 
 export const AppDataSource = new DataSource(dataSourceOptions);
