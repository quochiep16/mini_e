import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitShops1700000001000 implements MigrationInterface {
  name = 'InitShops1700000001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE \`shops\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`user_id\` INT UNSIGNED NOT NULL,
        \`name\` VARCHAR(150) NOT NULL,
        \`slug\` VARCHAR(180) NOT NULL,
        \`description\` VARCHAR(255) NULL,
        \`logo_url\` VARCHAR(255) NULL,
        \`cover_url\` VARCHAR(255) NULL,
        \`phone\` VARCHAR(30) NULL,
        \`email\` VARCHAR(150) NULL,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        \`verified_at\` DATETIME(6) NULL,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` DATETIME(6) NULL,
        CONSTRAINT \`PK_shops_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_shops_user\` FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`) ON DELETE RESTRICT ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_shops_user\` ON \`shops\`(\`user_id\`);`);
    await queryRunner.query(`CREATE UNIQUE INDEX \`UQ_shops_slug\` ON \`shops\`(\`slug\`);`);

    await queryRunner.query(`
      CREATE TABLE \`shop_stats\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`shop_id\` INT UNSIGNED NOT NULL,
        \`product_count\` INT NOT NULL DEFAULT 0,
        \`order_count\` INT NOT NULL DEFAULT 0,
        \`rating_avg\` DECIMAL(3,2) NOT NULL DEFAULT 0,
        \`review_count\` INT NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        CONSTRAINT \`PK_shop_stats_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_shop_stats_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE KEY \`UQ_shop_stats_shop\` (\`shop_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE `shop_stats`;');
    await queryRunner.query('DROP INDEX `UQ_shops_slug` ON `shops`;');
    await queryRunner.query('DROP INDEX `UQ_shops_user` ON `shops`;');
    await queryRunner.query('DROP TABLE `shops`;');
  }
}
