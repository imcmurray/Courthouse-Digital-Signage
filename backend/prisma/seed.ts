import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  const isProd = process.env.NODE_ENV === 'production';

  // Resolve the initial admin password. In production never fall back to a
  // hard-coded default: use SEED_ADMIN_PASSWORD if provided, otherwise generate a
  // strong random one and print it once below. mustChangePassword forces a reset
  // on first login regardless.
  const envAdminPassword = process.env.SEED_ADMIN_PASSWORD;
  let adminPasswordPlain: string;
  let adminPasswordGenerated = false;
  if (envAdminPassword) {
    adminPasswordPlain = envAdminPassword;
  } else if (isProd) {
    adminPasswordPlain = crypto.randomBytes(18).toString('base64url');
    adminPasswordGenerated = true;
  } else {
    adminPasswordPlain = 'admin123';
  }

  // Create admin user
  const adminPassword = await bcrypt.hash(adminPasswordPlain, 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@courthouse.gov' },
    update: {},
    create: {
      email: 'admin@courthouse.gov',
      passwordHash: adminPassword,
      name: 'System Administrator',
      role: 'admin',
      isActive: true,
      mustChangePassword: true,
    },
  });
  console.log('Created admin user:', admin.email);

  // Demo editor/viewer accounts are for local development only — never
  // auto-provision extra accounts with known credentials in production.
  if (!isProd) {
    const editorPassword = await bcrypt.hash('editor123', 10);
    const editor = await prisma.user.upsert({
      where: { email: 'editor@courthouse.gov' },
      update: {},
      create: {
        email: 'editor@courthouse.gov',
        passwordHash: editorPassword,
        name: 'Court Clerk',
        role: 'editor',
        isActive: true,
        mustChangePassword: true,
      },
    });
    console.log('Created editor user:', editor.email);

    const viewerPassword = await bcrypt.hash('viewer123', 10);
    const viewer = await prisma.user.upsert({
      where: { email: 'viewer@courthouse.gov' },
      update: {},
      create: {
        email: 'viewer@courthouse.gov',
        passwordHash: viewerPassword,
        name: 'Court Staff',
        role: 'viewer',
        isActive: true,
        mustChangePassword: true,
      },
    });
    console.log('Created viewer user:', viewer.email);
  }

  // Create default display
  const displayApiKey = crypto.randomBytes(32).toString('hex');
  const displayApiKeyHash = await bcrypt.hash(displayApiKey, 10);

  const display = await prisma.display.upsert({
    where: { id: 'display-321-main' },
    update: {},
    create: {
      id: 'display-321-main',
      name: 'Courtroom 321 Main Display',
      location: 'Third Floor, Outside Courtroom 321',
      judgeFilter: null,
      courtroomFilter: '321',
      showStricken: false,
      showZoomInfo: true,
      highlightCurrent: true,
      theme: 'default',
      showWeather: true,
      weatherLocation: 'Salt Lake City',
      noticeText: 'Please turn your phones OFF in the Courthouse',
      tickerEnabled: true,
      tickerSpeed: 'medium',
      status: 'unknown',
      apiKeyHash: displayApiKeyHash,
    },
  });
  console.log('Created display:', display.id);
  console.log('Display API Key (save this!):', displayApiKey);

  // Create sample announcement
  const announcement = await prisma.announcement.upsert({
    where: { id: '00000000-0000-0000-0000-000000000001' },
    update: {},
    create: {
      id: '00000000-0000-0000-0000-000000000001',
      text: 'Welcome to the U.S. Bankruptcy Court for the District of Utah. Court is now in session.',
      priority: 1,
      enabled: true,
      expiresAt: null,
      createdById: admin.id,
    },
  });
  console.log('Created sample announcement');

  // Create default settings
  const settings = [
    { key: 'court_name', value: JSON.stringify('U.S. Bankruptcy Court') },
    { key: 'court_subtitle', value: JSON.stringify('District of Utah') },
    { key: 'timezone', value: JSON.stringify('America/Denver') },
    { key: 'default_theme', value: JSON.stringify('default') },
  ];

  for (const setting of settings) {
    await prisma.setting.upsert({
      where: { key: setting.key },
      update: { value: setting.value },
      create: {
        key: setting.key,
        value: setting.value,
        updatedById: admin.id,
      },
    });
  }
  console.log('Created default settings');

  console.log('');
  console.log('Database seeded successfully!');
  console.log('');
  if (isProd) {
    console.log('Admin account: admin@courthouse.gov');
    if (adminPasswordGenerated) {
      console.log('');
      console.log('  Generated initial admin password (shown once — save it now):');
      console.log(`    ${adminPasswordPlain}`);
      console.log('');
      console.log('  You must change it on first login.');
    } else {
      console.log('  Password: set via SEED_ADMIN_PASSWORD');
    }
    console.log('  (editor/viewer accounts are not auto-created in production)');
  } else {
    console.log('Default Users (development):');
    console.log('  Admin:  admin@courthouse.gov / admin123');
    console.log('  Editor: editor@courthouse.gov / editor123');
    console.log('  Viewer: viewer@courthouse.gov / viewer123');
  }
  console.log('');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
