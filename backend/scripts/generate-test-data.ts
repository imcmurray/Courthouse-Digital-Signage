// Script to generate 500 test docket entries for search performance testing
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const firstNames = ['John', 'Jane', 'Michael', 'Sarah', 'David', 'Emily', 'Robert', 'Lisa', 'William', 'Jennifer', 'James', 'Linda', 'Richard', 'Barbara', 'Thomas', 'Elizabeth', 'Charles', 'Susan', 'Daniel', 'Jessica', 'Matthew', 'Karen', 'Anthony', 'Nancy', 'Mark', 'Margaret', 'Donald', 'Betty', 'Steven', 'Sandra'];
const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis', 'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson', 'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson', 'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson'];
const matterTypes = ['341 Meeting of Creditors', 'Motion to Dismiss', 'Confirmation Hearing', 'Motion for Relief from Stay', 'Discharge Hearing', 'Objection to Claim', 'Motion to Convert', 'Adversary Proceeding', 'Motion to Avoid Lien', 'Reaffirmation Agreement', 'Motion to Extend Time', 'Status Conference', 'Motion for Summary Judgment', 'Proof of Claim Deadline', 'Plan Modification Hearing'];
const judges = ['Judge Anderson', 'Judge Martinez', 'Judge Thompson', 'Judge Wilson', 'Judge Davis', 'Judge Johnson', 'Judge Williams', 'Judge Brown', 'Judge Taylor', 'Judge Garcia'];
const chapters = ['7', '11', '13'];
const courtrooms = ['321', '322', '323', '324', '325', '401', '402', '403'];
const times = ['08:30', '09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00'];

function randomElement<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateCaseNumber(index: number): string {
  const year = 26; // 2026
  const caseNum = String(index).padStart(5, '0');
  return `${year}-${caseNum}`;
}

function generateDate(daysFromNow: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(0, 0, 0, 0);
  return date;
}

async function generateTestData() {
  console.log('Starting test data generation...');

  // Get admin user for createdById
  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@courthouse.gov' }
  });

  if (!adminUser) {
    console.error('Admin user not found. Please seed the database first.');
    process.exit(1);
  }

  const entries = [];

  // Generate 500 unique entries across different dates
  for (let i = 0; i < 500; i++) {
    const firstName = randomElement(firstNames);
    const lastName = randomElement(lastNames);
    const caseNumber = generateCaseNumber(50000 + i); // Start at 50000 to avoid conflicts
    const daysFromNow = Math.floor(i / 50) + 1; // Spread across 10 days, ~50 entries per day
    const hearingDate = generateDate(daysFromNow);
    const hearingTime = randomElement(times);
    const matter = randomElement(matterTypes);
    const judge = randomElement(judges);
    const chapter = randomElement(chapters);
    const courtroom = randomElement(courtrooms);

    entries.push({
      caseNumber,
      caseTitle: `${lastName}, ${firstName}`,
      caseChapter: chapter,
      hearingDate,
      hearingTime,
      hearingMatter: `${matter} - Performance Test Entry ${i + 1}`,
      hearingJudge: judge,
      courtroom,
      status: 'scheduled',
      createdById: adminUser.id,
    });
  }

  console.log(`Inserting ${entries.length} test entries...`);

  // Use createMany for bulk insert (faster)
  const result = await prisma.docketEntry.createMany({
    data: entries,
  });

  console.log(`Created ${result.count} docket entries successfully!`);

  // Count total entries
  const total = await prisma.docketEntry.count();
  console.log(`Total docket entries in database: ${total}`);
}

generateTestData()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
