import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitCarts1700000003000 implements MigrationInterface {
  name = 'InitCarts1700000003000';

  public async up(q: QueryRunner): Promise<void> {
    // carts
    await q.query(`
      CREATE TABLE IF NOT EXISTS carts (
        id INT AUTO_INCREMENT PRIMARY KEY,
        userId INT NOT NULL,
        itemsCount INT NOT NULL DEFAULT 0,
        itemsQuantity INT NOT NULL DEFAULT 0,
        subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
        currency VARCHAR(10) NOT NULL DEFAULT 'VND',
        createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY UQ_carts_user (userId)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    // cart_items
    await q.query(`
      CREATE TABLE IF NOT EXISTS cart_items (
        id INT AUTO_INCREMENT PRIMARY KEY,
        cartId INT NOT NULL,
        productId INT NOT NULL,
        variantId INT NULL,
        title VARCHAR(200) NOT NULL,
        variantName VARCHAR(200) NULL,
        sku VARCHAR(80) NULL,
        imageId INT NULL,
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
        UNIQUE KEY UQ_cartitem_unique_line (cartId, productId, variantId),
        CONSTRAINT FK_cart_items_cart
          FOREIGN KEY (cartId) REFERENCES carts(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS cart_items`);
    await q.query(`DROP TABLE IF EXISTS carts`);
  }
}
