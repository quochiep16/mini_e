import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitCarts1700000003000 implements MigrationInterface {
  name = 'InitCarts1700000003000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE carts (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        userId INT UNSIGNED NOT NULL,
        itemsCount INT NOT NULL DEFAULT 0,
        itemsQuantity INT NOT NULL DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'VND',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY UQ_carts_user (userId),
        CONSTRAINT FK_carts_user FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE cart_items (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
        cartId INT UNSIGNED NOT NULL,
        productId INT UNSIGNED NOT NULL,
        variantId INT UNSIGNED NOT NULL,
        title VARCHAR(200) NOT NULL,
        variantName VARCHAR(200) NULL,
        sku VARCHAR(80) NULL,
        imageId INT UNSIGNED NULL,
        imageUrl VARCHAR(500) NULL,
        price DECIMAL(12,2) NOT NULL,
        quantity INT NOT NULL DEFAULT 1,
        value1 VARCHAR(100) NULL,
        value2 VARCHAR(100) NULL,
        value3 VARCHAR(100) NULL,
        value4 VARCHAR(100) NULL,
        value5 VARCHAR(100) NULL,
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        KEY IDX_cart (cartId),
        KEY IDX_cart_product (productId),
        KEY IDX_cart_variant (variantId),
        KEY IDX_cart_image (imageId),
        UNIQUE KEY UQ_cartitem_unique_variant (cartId, variantId),
        CONSTRAINT FK_cart_items_cart FOREIGN KEY (cartId) REFERENCES carts(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT FK_cart_items_product FOREIGN KEY (productId) REFERENCES products(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT FK_cart_items_variant FOREIGN KEY (variantId) REFERENCES product_variants(id) ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT FK_cart_items_image FOREIGN KEY (imageId) REFERENCES product_images(id) ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS cart_items`);
    await q.query(`DROP TABLE IF EXISTS carts`);
  }
}