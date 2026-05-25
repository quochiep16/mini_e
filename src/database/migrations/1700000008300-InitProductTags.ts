import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitProductTags1700000008300 implements MigrationInterface {
  name = 'InitProductTags1700000008300';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE product_tags (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        product_id INT UNSIGNED NOT NULL,

        tag VARCHAR(120) NOT NULL,
        tag_norm VARCHAR(160) NOT NULL,

        weight INT NOT NULL DEFAULT 1,
        sources JSON NULL,

        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (id),

        UNIQUE KEY UQ_product_tags_product_tag_norm (product_id, tag_norm),
        KEY IDX_product_tags_product (product_id),
        KEY IDX_product_tags_tag_norm (tag_norm),
        KEY IDX_product_tags_tag_weight (tag_norm, weight),

        CONSTRAINT FK_product_tags_product
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS product_tags`);
  }
}