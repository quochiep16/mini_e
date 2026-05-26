import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitUserProductPreferences1700000008600
  implements MigrationInterface
{
  name = 'InitUserProductPreferences1700000008600';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE user_product_preferences (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        product_id INT UNSIGNED NOT NULL,

        score INT NOT NULL DEFAULT 0,

        last_interacted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (id),

        UNIQUE KEY UQ_user_product_preferences_user_product (user_id, product_id),
        KEY IDX_user_product_preferences_user_score (user_id, score),
        KEY IDX_user_product_preferences_product (product_id),

        CONSTRAINT FK_user_product_preferences_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE,

        CONSTRAINT FK_user_product_preferences_product
          FOREIGN KEY (product_id) REFERENCES products(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_product_preferences`);
  }
}