import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitOrders1700000005000 implements MigrationInterface {
  name = 'InitOrders1700000005000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id CHAR(36) NOT NULL,
        user_id INT UNSIGNED NOT NULL,
        code VARCHAR(32) NOT NULL,
        status ENUM('PENDING','PAID','PROCESSING','SHIPPED','COMPLETED','CANCELLED') NOT NULL DEFAULT 'PENDING',
        payment_status ENUM('UNPAID','PAID','REFUNDED') NOT NULL DEFAULT 'UNPAID',
        shipping_status ENUM('PENDING','PICKED','IN_TRANSIT','DELIVERED','RETURNED','CANCELED') NOT NULL DEFAULT 'PENDING',
        address_snapshot JSON NOT NULL,
        subtotal DECIMAL(12,2) NOT NULL,
        discount DECIMAL(12,2) NOT NULL DEFAULT 0,
        shipping_fee DECIMAL(12,2) NOT NULL DEFAULT 0,
        total DECIMAL(12,2) NOT NULL,
        note VARCHAR(255) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY UQ_orders_code (code),
        KEY IDX_orders_user (user_id),
        KEY IDX_orders_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await q.query(`
      CREATE TABLE IF NOT EXISTS order_items (
        id CHAR(36) NOT NULL,
        order_id CHAR(36) NOT NULL,
        product_id INT UNSIGNED NOT NULL,
        product_variant_id INT UNSIGNED NULL,
        name_snapshot VARCHAR(220) NOT NULL,
        image_snapshot VARCHAR(300) NULL,
        price DECIMAL(12,2) NOT NULL,
        quantity INT NOT NULL,
        total_line DECIMAL(12,2) NOT NULL,
        value1 VARCHAR(100) NULL,
        value2 VARCHAR(100) NULL,
        value3 VARCHAR(100) NULL,
        value4 VARCHAR(100) NULL,
        value5 VARCHAR(100) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY IDX_order_items_order (order_id),
        CONSTRAINT FK_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS order_items`);
    await q.query(`DROP TABLE IF EXISTS orders`);
  }
}
