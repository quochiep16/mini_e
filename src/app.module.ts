import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import dbConfig from './config/database.config';

// modules
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfig, dbConfig],
    }),
    TypeOrmModule.forRootAsync({
      inject: [dbConfig.KEY],
      useFactory: (database: ConfigType<typeof dbConfig>) =>
        ({
          type: 'mysql',
          host: database.host,
          port: database.port,
          username: database.user,
          password: database.pass,
          database: database.name,
          ssl: database.ssl,
          autoLoadEntities: true,
          synchronize: true, // dùng migration
          logging: process.env.NODE_ENV !== 'production',
        }) as TypeOrmModuleOptions,
    }),
    UsersModule,
    AuthModule,
  ],
})
export class AppModule {}
