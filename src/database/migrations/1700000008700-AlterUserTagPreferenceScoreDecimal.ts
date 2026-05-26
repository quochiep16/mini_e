import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterUserTagPreferenceScoreDecimal1700000008700
  implements MigrationInterface
{
  name = 'AlterUserTagPreferenceScoreDecimal1700000008700';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_tag_preferences
      MODIFY score DECIMAL(12,2) NOT NULL DEFAULT 0.00
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE user_tag_preferences
      MODIFY score INT NOT NULL DEFAULT 0
    `);
  }
}