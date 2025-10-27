import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitProducts1700000002000 implements MigrationInterface {
  name = 'InitProducts1700000002000';

  public async up(q: QueryRunner): Promise<void> {
    // PRODUCTS
    await q.query(`
      CREATE TABLE \`products\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`shop_id\` INT UNSIGNED NOT NULL,
        \`category_id\` INT UNSIGNED NULL,
        \`title\` VARCHAR(180) NOT NULL,
        \`slug\` VARCHAR(200) NOT NULL,
        \`description\` TEXT NULL,
        \`option_schema\` JSON NULL,

        \`price\` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
        \`compare_at_price\` DECIMAL(12,2) NULL,
        \`currency\` CHAR(3) NOT NULL DEFAULT 'VND',

        \`stock\` INT NOT NULL DEFAULT 0,
        \`sold\` INT NOT NULL DEFAULT 0,
        \`status\` VARCHAR(20) NOT NULL DEFAULT 'DRAFT',
        \`published_at\` DATETIME(6) NULL,

        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        \`deleted_at\` DATETIME(6) NULL,
        CONSTRAINT \`PK_products_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_products_shop\` FOREIGN KEY (\`shop_id\`) REFERENCES \`shops\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        UNIQUE KEY \`UQ_products_slug\` (\`slug\`),
        KEY \`IDX_products_shop\` (\`shop_id\`),
        KEY \`IDX_products_status\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // PRODUCT_IMAGES
    await q.query(`
      CREATE TABLE \`product_images\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`product_id\` INT UNSIGNED NOT NULL,
        \`url\` VARCHAR(255) NOT NULL,
        \`alt\` VARCHAR(255) NULL,
        \`position\` INT NOT NULL DEFAULT 0,
        \`is_main\` TINYINT(1) NOT NULL DEFAULT 0,
        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        CONSTRAINT \`PK_product_images_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_image_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        KEY \`IDX_image_product\` (\`product_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // PRODUCT_VARIANTS (đã inline 5 value + combination_key + liên kết image)
    await q.query(`
      CREATE TABLE \`product_variants\` (
        \`id\` INT UNSIGNED NOT NULL AUTO_INCREMENT,
        \`product_id\` INT UNSIGNED NOT NULL,

        \`name\` VARCHAR(120) NOT NULL,
        \`sku\` VARCHAR(60) NOT NULL,

        \`price\` DECIMAL(12,2) NULL,
        \`stock\` INT NOT NULL DEFAULT 0,

        \`image_id\` INT UNSIGNED NULL,

        \`value1\` VARCHAR(100) NULL,
        \`value2\` VARCHAR(100) NULL,
        \`value3\` VARCHAR(100) NULL,
        \`value4\` VARCHAR(100) NULL,
        \`value5\` VARCHAR(100) NULL,

        \`combination_key\` VARCHAR(600)
          GENERATED ALWAYS AS (
            CONCAT_WS('#',
              IFNULL(\`value1\`,''), IFNULL(\`value2\`,''), IFNULL(\`value3\`,''), IFNULL(\`value4\`,''), IFNULL(\`value5\`,'')
            )
          ) STORED,

        \`created_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        \`updated_at\` DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

        CONSTRAINT \`PK_product_variants_id\` PRIMARY KEY (\`id\`),
        CONSTRAINT \`FK_variant_product\` FOREIGN KEY (\`product_id\`) REFERENCES \`products\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT \`FK_variant_image\` FOREIGN KEY (\`image_id\`) REFERENCES \`product_images\`(\`id\`) ON DELETE SET NULL ON UPDATE CASCADE,

        UNIQUE KEY \`UQ_variant_sku\` (\`sku\`),
        UNIQUE KEY \`UQ_variant_combo\` (\`product_id\`, \`combination_key\`),
        KEY \`IDX_variant_product\` (\`product_id\`),
        KEY \`IDX_variant_image\` (\`image_id\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query('DROP TABLE `product_variants`;');
    await q.query('DROP TABLE `product_images`;');
    await q.query('DROP TABLE `products`;');
  }
}
