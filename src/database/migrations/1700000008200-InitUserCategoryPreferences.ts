import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitUserCategoryPreferences1700000008200 implements MigrationInterface {
  name = 'InitUserCategoryPreferences1700000008200';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE user_category_preferences (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,
        category_id INT UNSIGNED NOT NULL,
        score INT NOT NULL DEFAULT 0,
        last_interacted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (id),

        UNIQUE KEY UQ_user_category_preferences_user_category (user_id, category_id),
        KEY IDX_user_category_preferences_user_score (user_id, score),
        KEY IDX_user_category_preferences_category (category_id),

        CONSTRAINT FK_user_category_preferences_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE,

        CONSTRAINT FK_user_category_preferences_category
          FOREIGN KEY (category_id) REFERENCES categories(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_category_preferences`);
  }
}
