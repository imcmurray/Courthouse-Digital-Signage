/**
 * Migration script: Rename idle_content_cards -> content_cards
 *
 * Since this project uses `prisma db push` with SQLite (no migration files),
 * table renames require a custom script using Prisma's raw SQL execution.
 *
 * Usage: npx tsx prisma/migrate-content-cards.ts
 *
 * Steps:
 * 1. Rename idle_content_cards table -> content_cards
 * 2. Rename display_idle_content_cards -> display_content_cards (with column rename)
 * 3. Add show_content_cards column to displays, copy from show_idle_content
 * 4. Update settings rows: idle_modules -> content_card_modules, idle_rotation_interval -> content_card_rotation_interval
 * 5. Update display_type_templates JSON: component type "idle-cards" -> "content-cards"
 *
 * After running this script, update schema.prisma with the new model names and run `prisma db push`.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function migrate() {
  console.log('[migrate] Starting idle -> content-cards migration...');

  // Step 1: Rename idle_content_cards -> content_cards
  console.log('[migrate] Step 1: Renaming idle_content_cards -> content_cards');
  await prisma.$executeRawUnsafe(`ALTER TABLE idle_content_cards RENAME TO content_cards`);

  // Step 2: Rename display_idle_content_cards -> display_content_cards with column rename
  console.log('[migrate] Step 2: Renaming display_idle_content_cards -> display_content_cards');
  // First create new table with correct column name
  await prisma.$executeRawUnsafe(`
    CREATE TABLE display_content_cards (
      display_id TEXT NOT NULL,
      content_card_id TEXT NOT NULL,
      PRIMARY KEY (display_id, content_card_id),
      FOREIGN KEY (display_id) REFERENCES displays(id) ON DELETE CASCADE,
      FOREIGN KEY (content_card_id) REFERENCES content_cards(id) ON DELETE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    INSERT INTO display_content_cards (display_id, content_card_id)
    SELECT display_id, idle_content_card_id FROM display_idle_content_cards
  `);
  await prisma.$executeRawUnsafe(`DROP TABLE display_idle_content_cards`);

  // Step 3: Add show_content_cards column to displays
  console.log('[migrate] Step 3: Adding show_content_cards column to displays');
  try {
    await prisma.$executeRawUnsafe(`ALTER TABLE displays ADD COLUMN show_content_cards BOOLEAN NOT NULL DEFAULT 0`);
    await prisma.$executeRawUnsafe(`UPDATE displays SET show_content_cards = show_idle_content`);
    console.log('[migrate]   Copied show_idle_content -> show_content_cards');
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('duplicate column name')) {
      console.log('[migrate]   show_content_cards column already exists, skipping');
    } else {
      throw e;
    }
  }

  // Step 4: Update settings rows
  console.log('[migrate] Step 4: Updating settings keys');
  // Copy idle_modules -> content_card_modules
  const idleModules = await prisma.setting.findUnique({ where: { key: 'idle_modules' } });
  if (idleModules) {
    await prisma.setting.upsert({
      where: { key: 'content_card_modules' },
      update: { value: idleModules.value },
      create: { key: 'content_card_modules', value: idleModules.value },
    });
    await prisma.setting.delete({ where: { key: 'idle_modules' } });
    console.log('[migrate]   idle_modules -> content_card_modules');
  }
  // Copy idle_rotation_interval -> content_card_rotation_interval
  const idleInterval = await prisma.setting.findUnique({ where: { key: 'idle_rotation_interval' } });
  if (idleInterval) {
    await prisma.setting.upsert({
      where: { key: 'content_card_rotation_interval' },
      update: { value: idleInterval.value },
      create: { key: 'content_card_rotation_interval', value: idleInterval.value },
    });
    await prisma.setting.delete({ where: { key: 'idle_rotation_interval' } });
    console.log('[migrate]   idle_rotation_interval -> content_card_rotation_interval');
  }

  // Step 5: Update display_type_templates JSON — component type "idle-cards" -> "content-cards"
  console.log('[migrate] Step 5: Updating display_type_templates component types');
  const templates = await prisma.displayTypeTemplate.findMany();
  for (const tmpl of templates) {
    if (tmpl.components && tmpl.components.includes('idle-cards')) {
      const updated = tmpl.components.replace(/"idle-cards"/g, '"content-cards"');
      await prisma.displayTypeTemplate.update({
        where: { id: tmpl.id },
        data: { components: updated },
      });
      console.log(`[migrate]   Updated template: ${tmpl.slug}`);
    }
  }

  console.log('[migrate] Migration complete!');
  console.log('[migrate] Next steps:');
  console.log('[migrate]   1. Update schema.prisma with new model/field names');
  console.log('[migrate]   2. Run: npx prisma db push');
}

migrate()
  .catch((error) => {
    console.error('[migrate] Migration failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
