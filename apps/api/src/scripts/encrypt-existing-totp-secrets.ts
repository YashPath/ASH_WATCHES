import { prisma } from '../lib/prisma.js';
import { encryptTotpSecret, isEncryptedTotpSecret } from '../lib/totp-crypto.js';

async function main() {
  const users = await prisma.user.findMany({ where: { OR: [{ twoFactorSecret: { not: null } }, { pendingTwoFactorSecret: { not: null } }] }, select: { id: true, twoFactorSecret: true, pendingTwoFactorSecret: true } });
  let updated = 0;
  for (const user of users) {
    const twoFactorSecret = user.twoFactorSecret && !isEncryptedTotpSecret(user.twoFactorSecret) ? encryptTotpSecret(user.twoFactorSecret) : user.twoFactorSecret;
    const pendingTwoFactorSecret = user.pendingTwoFactorSecret && !isEncryptedTotpSecret(user.pendingTwoFactorSecret) ? encryptTotpSecret(user.pendingTwoFactorSecret) : user.pendingTwoFactorSecret;
    if (twoFactorSecret !== user.twoFactorSecret || pendingTwoFactorSecret !== user.pendingTwoFactorSecret) {
      await prisma.user.update({ where: { id: user.id }, data: { twoFactorSecret, pendingTwoFactorSecret } });
      updated++;
    }
  }
  console.log(`Encrypted TOTP secrets for ${updated} account(s).`);
}
main().catch(error => { console.error('TOTP secret encryption failed:', error); process.exitCode = 1; }).finally(async () => prisma.$disconnect());
