import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import dbConfig from './config/database.config';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { APP_GUARD } from '@nestjs/core'; 
// import { RolesGuard } from './common/guards/roles.guard';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';

// modules
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ShopsModule } from './modules/shops/shops.module';
import { ProductsModule } from './modules/products/products.module';


@Module({
  imports: [
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
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
    ShopsModule,
    ProductsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AccessTokenGuard }, // yêu cầu JWT mặc định
    // { provide: APP_GUARD, useClass: RolesGuard },       // phân quyền (nếu có @Roles)
  ],
})
export class AppModule {}
