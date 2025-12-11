import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule, TypeOrmModuleOptions } from '@nestjs/typeorm';
import appConfig from './config/app.config';
import dbConfig from './config/database.config';
import { AccessTokenGuard } from './common/guards/access-token.guard';
import { APP_GUARD } from '@nestjs/core'; 
import { RolesGuard } from './common/guards/roles.guard';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ScheduleModule } from '@nestjs/schedule';


// modules
import { UsersModule } from './modules/users/users.module';
import { AuthModule } from './modules/auth/auth.module';
import { ShopsModule } from './modules/shops/shops.module';
import { ProductsModule } from './modules/products/products.module';
import { ActiveUserGuard } from './common/guards/active-user.guard';
import { User } from './modules/users/entities/user.entity';
import { CartModule } from './modules/cart/cart.module';
import { AddressesModule } from './modules/addresses/addresses.module';
import { OrdersModule } from './modules/orders/orders.module';


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
    TypeOrmModule.forFeature([User]),

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
    ScheduleModule.forRoot(),
    CartModule,
    AddressesModule,
    OrdersModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AccessTokenGuard }, // yêu cầu JWT mặc định
    { provide: APP_GUARD, useClass: ActiveUserGuard }, // kiểm tra tài khoản có bị xoá mềm hay không
    { provide: APP_GUARD, useClass: RolesGuard },   // phân quyền (nếu có @Roles)
    // kiểm tra tk xóa hay chưa
  ],
})
export class AppModule {}
