import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitUserTagPreferences1700000008400 implements MigrationInterface {
  name = 'InitUserTagPreferences1700000008400';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE user_tag_preferences (
        id INT UNSIGNED NOT NULL AUTO_INCREMENT,
        user_id INT UNSIGNED NOT NULL,

        tag_norm VARCHAR(160) NOT NULL,
        score INT NOT NULL DEFAULT 0,

        last_interacted_at DATETIME(6) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),

        PRIMARY KEY (id),

        UNIQUE KEY UQ_user_tag_preferences_user_tag (user_id, tag_norm),
        KEY IDX_user_tag_preferences_user_score (user_id, score),
        KEY IDX_user_tag_preferences_tag_norm (tag_norm),

        CONSTRAINT FK_user_tag_preferences_user
          FOREIGN KEY (user_id) REFERENCES users(id)
          ON DELETE CASCADE ON UPDATE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`DROP TABLE IF EXISTS user_tag_preferences`);
  }
}