import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitProductFavorites1700000008000 implements MigrationInterface {
  name = 'InitProductFavorites1700000008000';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE product_favorites (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NOT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

        PRIMARY KEY (id),

        UNIQUE KEY UQ_product_favorites_user_product (user_id, product_id),
        KEY IDX_product_favorites_user (user_id),
        KEY IDX_product_favorites_product (product_id),

        CONSTRAINT FK_product_favorites_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE,

        CONSTRAINT FK_product_favorites_product
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS product_favorites`);
  }
}
