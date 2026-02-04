const jwt = require('jsonwebtoken');

const JWT_SECRET = 'courthouse-signage-secret-key-change-in-production';

// Create an expired token (set expiration in the past)
const expiredToken = jwt.sign(
  { userId: 'test-user', email: 'test@test.com', role: 'admin' },
  JWT_SECRET,
  { expiresIn: '-1h' } // Expired 1 hour ago
);

process.stdout.write('Expired Token: ' + expiredToken + '\n');

// Verify it's actually expired
try {
  jwt.verify(expiredToken, JWT_SECRET);
  process.stdout.write('ERROR: Token should be expired but was accepted!\n');
} catch (err) {
  process.stdout.write('Token verification failed as expected: ' + err.message + '\n');
}
