import { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterShopsUserFkCascade1700000001400 implements MigrationInterface {
  name = 'AlterShopsUserFkCascade1700000001400';

  public async up(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE \`shops\` DROP FOREIGN KEY \`FK_bb9c758dcc60137e56f6fee72f7\`;`,
    );

    await q.query(`
      ALTER TABLE \`shops\`
      ADD CONSTRAINT \`FK_bb9c758dcc60137e56f6fee72f7\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`)
      ON DELETE CASCADE
      ON UPDATE CASCADE;
    `);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(
      `ALTER TABLE \`shops\` DROP FOREIGN KEY \`FK_bb9c758dcc60137e56f6fee72f7\`;`,
    );

    await q.query(`
      ALTER TABLE \`shops\`
      ADD CONSTRAINT \`FK_bb9c758dcc60137e56f6fee72f7\`
      FOREIGN KEY (\`user_id\`) REFERENCES \`users\`(\`id\`)
      ON DELETE RESTRICT
      ON UPDATE CASCADE;
    `);
  }
}
