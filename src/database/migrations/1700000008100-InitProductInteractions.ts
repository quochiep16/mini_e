import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitProductInteractions1700000008100 implements MigrationInterface {
  name = 'InitProductInteractions1700000008100';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE product_interactions (
        id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NOT NULL,
        category_id INT UNSIGNED NULL,
        shop_id INT UNSIGNED NULL,

        event_type ENUM(
          'CLICK',
          'VIEW_DETAIL',
          'ADD_TO_CART',
          'FAVORITE',
          'UNFAVORITE',
          'PURCHASE'
        ) NOT NULL,

        weight INT NOT NULL DEFAULT 1,
        metadata JSON NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),

        PRIMARY KEY (id),

        KEY IDX_product_interactions_user_created (user_id, created_at),
        KEY IDX_product_interactions_user_category (user_id, category_id),
        KEY IDX_product_interactions_user_product (user_id, product_id),
        KEY IDX_product_interactions_product (product_id),
        KEY IDX_product_interactions_category (category_id),
        KEY IDX_product_interactions_shop (shop_id),
        KEY IDX_product_interactions_event_type (event_type),

        CONSTRAINT FK_product_interactions_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE,

        CONSTRAINT FK_product_interactions_product
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE CASCADE ON UPDATE CASCADE,

        CONSTRAINT FK_product_interactions_category
          FOREIGN KEY (category_id) REFERENCES categories(id)
          ON DELETE SET NULL ON UPDATE CASCADE,

        CONSTRAINT FK_product_interactions_shop
          FOREIGN KEY (shop_id) REFERENCES shops(id)
          ON DELETE SET NULL ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS product_interactions`);
  }
}
