import { Module } from '@nestjs/common'; // Import Module decorator
import { ConfigModule, ConfigType } from '@nestjs/config'; // Import để load config
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm'; // Import để kết nối DB
import appConfig from './config/app.config'; // Config app
import dbConfig from './config/database.config'; // Config DB
import { UsersModule } from './modules/users/users.module'; // Module users
import { AuthModule } from './modules/auth/auth.module'; // Module auth
import { ProductsModule } from './modules/products/products.module'; // Module products
import { AppController } from './app.controller'; // Controller root
import { AppService } from './app.service'; // Service root

@Module({
  imports: [ // Import modules và config
    ConfigModule.forRoot({ // Load config toàn cục
      isGlobal: true, // Config available toàn app
      load: [appConfig, dbConfig], // Load file config
    }),
    TypeOrmModule.forRootAsync({ // Kết nối DB async
      inject: [dbConfig.KEY], // Inject dbConfig
      useFactory: (database: ConfigType<typeof dbConfig>) => ({
        type: 'mysql', // Loại DB
        host: database.host, // Host DB
        port: database.port, // Port DB
        username: database.user, // User DB
        password: database.pass, // Password DB
        database: database.name, // Tên DB
        ssl: database.ssl, // SSL
        autoLoadEntities: true, // Tự load entities
        synchronize: true, // Tự sync schema (dev only)
        logging: process.env.NODE_ENV !== 'production', // Log query nếu không phải prod
      }) as TypeOrmModuleOptions,
    }),
    UsersModule, // Module users
    AuthModule, // Module auth
    ProductsModule, // Module products
  ],
  controllers: [AppController], // Register controller root
  providers: [AppService], // Register service root
})
export class AppModule {} // Export module root