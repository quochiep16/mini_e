import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitProductTrending1700000008500 implements MigrationInterface {
  name = 'InitProductTrending1700000008500';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE product_trending (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        product_id INT UNSIGNED NOT NULL,

        score_7d INT NOT NULL DEFAULT 0,

        click_count_7d INT NOT NULL DEFAULT 0,
        view_count_7d INT NOT NULL DEFAULT 0,
        add_to_cart_count_7d INT NOT NULL DEFAULT 0,
        favorite_count_7d INT NOT NULL DEFAULT 0,
        purchase_count_7d INT NOT NULL DEFAULT 0,

        trending_rank INT UNSIGNED NULL,
        trending_bonus INT NOT NULL DEFAULT 0,
        is_trending TINYINT(1) NOT NULL DEFAULT 0,

        last_interacted_at DATETIME(6) NULL,
        last_calculated_at DATETIME(6) NULL,

        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (id),

        UNIQUE KEY UQ_product_trending_product (product_id),
        KEY IDX_product_trending_score_7d (score_7d),
        KEY IDX_product_trending_rank (trending_rank),
        KEY IDX_product_trending_bonus (trending_bonus),
        KEY IDX_product_trending_is_trending_score (is_trending, score_7d),

        CONSTRAINT FK_product_trending_product
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS product_trending`);
  }
}