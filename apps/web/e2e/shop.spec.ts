import { expect, test, type Page } from '@playwright/test';

const DEMO = { email: 'demo@ash.test', password: 'Demo-Customer-2026!' };

async function signIn(page: Page, next = '/') {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await page.getByLabel('Email').fill(DEMO.email);
  await page.getByLabel('Password').fill(DEMO.password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: 'Demo' })).toBeVisible();
}

test.describe('storefront', () => {
  test('home shows the 3D hero and products with images', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toContainText('every day');
    await expect(page.locator('canvas').first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'New arrivals' })).toBeVisible();
    const cards = page.locator('a[href^="/product/"]');
    await expect(cards.first()).toBeVisible();
    expect(await cards.count()).toBeGreaterThanOrEqual(4);
    await expect.poll(() => page.evaluate(() => [...document.images].filter(i => i.complete && i.naturalWidth > 0).length)).toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });

  test('shop filters and natural-language search work', async ({ page }) => {
    await page.goto('/shop');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
    await page.getByLabel('For', { exact: true }).selectOption('WOMEN');
    await expect(page).toHaveURL(/gender=WOMEN/);
    await expect(page.getByText('Lune Slim')).toBeVisible();
    await expect(page.getByText('Abyss Diver')).toHaveCount(0);
    await page.goto('/shop?q=dive%20watch%20for%20swimming');
    await expect(page.locator('a[href^="/product/"]').first()).toContainText('Diver');
  });

  test('header suggestions lead to a product with a 3D viewer and variants', async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Search watches').fill('Abyss');
    await page.getByRole('link', { name: 'Abyss Diver' }).first().click();
    await expect(page).toHaveURL(/\/product\/abyss-diver/);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText('Abyss Diver');
    await expect(page.locator('canvas')).toBeVisible();
    const variants = page.getByRole('group').or(page.locator('fieldset')).getByRole('button', { pressed: true });
    await expect(variants.first()).toBeVisible();
    await page.getByRole('tab', { name: 'Photos' }).click();
    await expect(page.locator('main img').first()).toBeVisible();
  });

  test('anonymous add-to-cart asks for sign-in and returns to the product', async ({ page }) => {
    await page.goto('/product/abyss-diver');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page).toHaveURL(/\/login\?next=\/product\/abyss-diver/);
  });

  test('wrong password shows a generic error', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(DEMO.email);
    await page.getByLabel('Password').fill('Not-The-Password-1!');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('form [role="alert"]')).toContainText(/invalid email or password/i);
  });

  test('sign in, add to cart, check out and see the pending order', async ({ page }) => {
    await signIn(page, '/product/solstice-solar');
    await expect(page).toHaveURL(/solstice-solar/);
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to your cart.')).toBeVisible();
    await page.getByRole('link', { name: /^Cart/ }).click();
    await expect(page.getByRole('heading', { name: 'Your cart' })).toBeVisible();
    await expect(page.getByText('Solstice Solar')).toBeVisible();
    await page.getByRole('link', { name: 'Checkout' }).click();

    await expect(page.locator('input[name="address"]').or(page.getByLabel('Full name')).first()).toBeVisible();
    const hasAddress = await page.locator('input[name="address"]').count();
    if (!hasAddress) {
      await page.getByLabel('Full name').fill('Demo Customer');
      await page.getByLabel('Phone').fill('9876543210');
      await page.getByLabel('PIN code').fill('248001');
      await page.getByLabel('Address line 1').fill('12 Clock Tower Road');
      await page.getByLabel('City').fill('Dehradun');
      await page.getByLabel('State').fill('Uttarakhand');
      await page.getByRole('button', { name: 'Save address' }).click();
    }
    await expect(page.locator('input[name="address"]').first()).toBeChecked();
    await page.getByRole('button', { name: /Pay securely/ }).click();

    if (process.env.E2E_STRIPE === '1') {
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 30_000 });
    } else {
      // Without Stripe keys the session cannot be created, but the order must exist and stay payable.
      await page.goto('/account');
      await expect(page.getByText(/^ASH-/).first()).toBeVisible();
      await expect(page.getByRole('button', { name: 'Pay now' }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Cancel' }).first().click(); // releases stock again
    }
  });

  test('cash on delivery places a confirmed order that can still be cancelled', async ({ page }) => {
    await signIn(page, '/product/solstice-solar');
    await page.getByRole('button', { name: 'Add to cart' }).click();
    await expect(page.getByText('Added to your cart.')).toBeVisible();
    await page.goto('/checkout');
    await expect(page.locator('input[name="address"]').or(page.getByLabel('Full name')).first()).toBeVisible();
    if (!(await page.locator('input[name="address"]').count())) {
      await page.getByLabel('Full name').fill('Demo Customer');
      await page.getByLabel('Phone').fill('9876543210');
      await page.getByLabel('PIN code').fill('248001');
      await page.getByLabel('Address line 1').fill('12 Clock Tower Road');
      await page.getByLabel('City').fill('Dehradun');
      await page.getByLabel('State').fill('Uttarakhand');
      await page.getByRole('button', { name: 'Save address' }).click();
    }
    await page.getByLabel(/Cash on delivery/).check();
    await page.getByRole('button', { name: /Place order/ }).click();
    await expect(page).toHaveURL(/\/account\/orders\//);
    await expect(page.getByText(/Cash on delivery \(pay on delivery\)/)).toBeVisible();
    await page.goto('/account');
    await expect(page.getByText(/cash on delivery/i).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pay now' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Cancel' }).first().click();
  });

  test('policy and contact pages are reachable from the footer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('navigation', { name: 'Store policies' }).getByRole('link', { name: 'Returns' }).click();
    await expect(page.getByRole('heading', { name: 'Returns & refunds' })).toBeVisible();
    await page.goto('/contact');
    await expect(page.getByRole('heading', { name: 'Contact us' })).toBeVisible();
    expect((await page.goto('/legal/nope'))?.status()).toBe(404);
  });

  test('layout holds on a phone', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
});

test.describe('account features', () => {
  test('wishlist toggle persists and lists the product', async ({ page }) => {
    await signIn(page);
    await page.goto('/shop');
    await page.locator('a[href^="/product/"]').first().click();
    const heart = page.getByRole('button', { name: /wishlist/i });
    await expect(heart).toBeVisible();
    if ((await heart.getAttribute('aria-pressed')) === 'true') await heart.click();
    await heart.click();
    await expect(heart).toHaveAttribute('aria-pressed', 'true');
    await page.goto('/wishlist');
    await expect(page.locator('a[href^="/product/"]').first()).toBeVisible();
    await page.getByRole('button', { name: 'Remove' }).first().click();
  });

  test('review is refused for a product the user has not bought', async ({ page }) => {
    await signIn(page);
    await page.goto('/shop');
    await page.locator('a[href^="/product/"]').first().click();
    await page.getByRole('button', { name: 'Write a review' }).click();
    await page.getByLabel('Title').fill('Nice watch');
    await page.getByLabel('Your review').fill('Looks great on the wrist and keeps good time.');
    await page.getByRole('button', { name: 'Submit review' }).click();
    await expect(page.locator('form [role=alert]')).toContainText(/verified purchasers/i);
  });

  test('forgot-password never reveals whether the account exists', async ({ page }) => {
    await page.goto('/forgot-password');
    await page.getByLabel('Email').fill('nobody-here@example.com');
    await page.getByRole('button', { name: 'Send reset link' }).click();
    await expect(page.getByRole('status')).toContainText(/if an account exists/i);
  });

  test('reset and MFA links without a token show the invalid-link state', async ({ page }) => {
    await page.goto('/reset-password');
    await expect(page.getByRole('heading', { name: 'Link not valid' })).toBeVisible();
    await page.goto('/admin-mfa-enroll');
    await expect(page.getByRole('heading', { name: 'Link not valid' })).toBeVisible();
  });

  test('order detail page opens from the account list', async ({ page }) => {
    await signIn(page, '/account');
    await page.goto('/account');
    const first = page.locator('a[href^="/account/orders/"]').first();
    await expect(first.or(page.getByText('No orders yet.'))).toBeVisible();
    if (await first.count() === 0) test.skip(true, 'no orders for the demo user');
    await first.click();
    await expect(page.getByRole('heading', { name: /^Order / })).toBeVisible();
    await expect(page.getByText('Total', { exact: true })).toBeVisible();
  });
});
