const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJhZjkwNzI2YS02NGUyLTQxZDAtODMxYS01MmJiZTA5MmI4ZGIiLCJlbWFpbCI6ImFkbWluQGNvdXJ0aG91c2UuZ292Iiwicm9sZSI6ImFkbWluIiwiaWF0IjoxNzcwMTY1MDgyLCJleHAiOjE3NzAxNjY4ODJ9.wrEwuC3rV8UXXTVE9CRFmJev676lkCW9ssRhR0U4sH0';
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
const iat = new Date(payload.iat * 1000);
const exp = new Date(payload.exp * 1000);
const durationMinutes = (payload.exp - payload.iat) / 60;

process.stdout.write('JWT Payload: ' + JSON.stringify(payload, null, 2) + '\n');
process.stdout.write('Issued at: ' + iat.toISOString() + '\n');
process.stdout.write('Expires at: ' + exp.toISOString() + '\n');
process.stdout.write('Duration (minutes): ' + durationMinutes + '\n');
