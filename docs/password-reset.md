# Admin Password Reset (Docker)

If you're locked out of the admin portal on a Docker/Dockge deployment, here are two ways to recover.

## Option 1: Reset Password via CLI (preserves data)

Run this command against the running backend container:

```bash
sudo docker exec -it <container-name> node -e "
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const p = new PrismaClient();
(async () => {
  const h = await bcrypt.hash('admin123', 10);
  await p.user.updateMany({ where: { role: 'admin' }, data: { passwordHash: h, mustChangePassword: true } });
  console.log('Admin password reset to admin123');
  await p['\$disconnect']();
})();
"
```

Replace `<container-name>` with your actual container name (e.g., `mossdigsig2026-demo-backend-1`).

To find the container name:

```bash
sudo docker ps --format '{{.Names}}' | grep backend
```

After running the reset, log in with:
- **Email:** `admin@courthouse.gov`
- **Password:** `admin123`

You'll be prompted to set a new password immediately.

## Option 2: Delete Database and Re-seed (fresh start)

This wipes all data and starts fresh with default users.

```bash
sudo docker compose -p <stack-name> down
sudo docker volume rm <stack-name>_db-data
sudo docker compose -p <stack-name> up -d
```

Replace `<stack-name>` with your Dockge stack name (e.g., `mossdigsig2026-demo`).

Default credentials after re-seed:

| Role | Email | Password |
|------|-------|----------|
| Admin | `admin@courthouse.gov` | `admin123` |
| Editor | `editor@courthouse.gov` | `editor123` |
| Viewer | `viewer@courthouse.gov` | `viewer123` |

All users will be prompted to change their password on first login.

## Common Causes of Lockout

- **Clearing users** via Data Management without noticing the admin was included (fixed: the clear endpoint now preserves the current user)
- **Importing data** from another instance — imported users get placeholder passwords and `mustChangePassword: true`
- **Forgetting the password** after the forced change on a fresh deployment
