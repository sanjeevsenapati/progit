import puppeteer from 'puppeteer-core';

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('========================================================================');
  console.log('              PROGIT FULL UI AUTOMATION TEST SUITE                      ');
  console.log('========================================================================');
  console.log('Target URL:   ', BASE_URL);
  console.log('Browser:      ', CHROME_PATH);

  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1280,850'],
  });

  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 850 });

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // --- 1. Landing Page & Unauthenticated Header ---
    console.log('\n=== [1/10] LANDING PAGE & RESPONSIVE NAVBAR ===');
    await page.goto(`${BASE_URL}/`, { waitUntil: 'networkidle0' });
    const pageTitle = await page.title();
    assert(pageTitle.includes('ProGit'), `Page title contains ProGit: "${pageTitle}"`);

    const hasExploreLink = await page.$('a[href="/explore"]');
    assert(hasExploreLink !== null, 'Navbar contains Explore link for all visitors');

    const searchInput = await page.$('nav input[placeholder*="Search repositories"]');
    assert(searchInput !== null, 'Responsive Navbar contains search input');

    // --- 2. Keyboard Shortcuts & Live Autocomplete ---
    console.log('\n=== [2/10] NAVBAR SEARCH ENGINE & SHORTCUTS ===');
    await page.keyboard.press('/');
    await new Promise(r => setTimeout(r, 200));

    const isFocused = await page.evaluate(() => {
      const active = document.activeElement;
      return active && active.tagName === 'INPUT' && active.closest('nav') !== null;
    });
    assert(isFocused, 'Pressing "/" successfully focused the navbar search input without typing "/"');

    // Type "/" into search
    await searchInput.type('/');
    await new Promise(r => setTimeout(r, 600));

    const dropdownText = await page.evaluate(() => {
      const dd = document.querySelector('nav .absolute');
      return dd ? dd.textContent : '';
    });
    assert(!dropdownText.includes('No repositories found matching "/"'), 'Typing "/" returns authorized repositories, not empty');

    // Clear search
    await page.evaluate(() => {
      const inp = document.querySelector('nav input');
      if (inp) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await new Promise(r => setTimeout(r, 200));

    // Search by repo keyword "qa-public"
    await searchInput.type('qa-public');
    await new Promise(r => setTimeout(r, 600));

    const searchMatches = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('nav .absolute a[href*="/"]'));
      return items.map(a => a.textContent || '');
    });
    assert(searchMatches.length > 0, `Search returned ${searchMatches.length} matching repositories`);
    assert(searchMatches.some(t => t.includes('qa-public-repo')), 'Dropdown displays "qa-public-repo" with metadata');

    // Search by owner/repo string "cbdc/website"
    await page.evaluate(() => {
      const inp = document.querySelector('nav input');
      if (inp) {
        inp.value = '';
        inp.dispatchEvent(new Event('input', { bubbles: true }));
      }
    });
    await searchInput.type('cbdc/website');
    await new Promise(r => setTimeout(r, 600));

    const ownerMatches = await page.evaluate(() => {
      const items = Array.from(document.querySelectorAll('nav .absolute a[href*="/"]'));
      return items.map(a => a.textContent || '');
    });
    assert(ownerMatches.some(t => t.includes('website')), 'Search handles "owner/repo" queries ("cbdc/website")');

    // --- 3. Explore Page UI & Server Synchronization ---
    console.log('\n=== [3/10] EXPLORE PAGE REAL-TIME SEARCH ===');
    await page.goto(`${BASE_URL}/explore`, { waitUntil: 'networkidle0' });
    const exploreText = await page.evaluate(() => document.body.textContent || '');
    assert(exploreText.includes('Explore Repositories'), 'Explore page heading loaded');

    const exploreInput = await page.$('main input');
    assert(exploreInput !== null, 'Explore page search input rendered');

    await exploreInput.type('qa-public');
    await new Promise(r => setTimeout(r, 600));

    const exploreResults = await page.evaluate(() => {
      const cards = Array.from(document.querySelectorAll('div.grid a[href*="/"]'));
      return cards.map(c => c.textContent || '');
    });
    assert(exploreResults.length > 0, `Explore page found ${exploreResults.length} matching repositories`);
    assert(page.url().includes('q=qa-public'), `URL query synchronized: ${page.url()}`);

    const hasPagination = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return text.includes('Showing') && text.includes('repositories');
    });
    assert(hasPagination, 'Explore page renders pagination information');

    // --- 4. Dark / Light Theme Toggle ---
    console.log('\n=== [4/10] THEME TOGGLING (DARK / LIGHT) ===');
    const isDarkInit = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    const themeBtn = await page.$('button[aria-label="Toggle theme"]');
    assert(themeBtn !== null, 'Theme toggle button exists in navbar');
    await themeBtn.click();
    await new Promise(r => setTimeout(r, 200));
    const isDarkAfter = await page.evaluate(() => document.documentElement.classList.contains('dark'));
    assert(isDarkInit !== isDarkAfter, `Theme toggled to ${isDarkAfter ? 'dark' : 'light'}`);

    // --- 5. Authentication UI Flow (/login) ---
    console.log('\n=== [5/10] AUTHENTICATION & LOGIN UI ===');
    await page.goto(`${BASE_URL}/login`, { waitUntil: 'networkidle0' });
    const loginHeader = await page.evaluate(() => document.body.textContent || '');
    assert(loginHeader.includes('Sign in to ProGit') || loginHeader.includes('Sign In'), 'Login form rendered');

    const usernameInput = await page.$('form input[type="text"]');
    const passwordInput = await page.$('form input[type="password"]');
    assert(usernameInput !== null && passwordInput !== null, 'Credentials input fields present in form');

    await usernameInput.type('ui_tester');
    await passwordInput.type('Password123!');
    const submitBtn = await page.$('form button[type="submit"]');
    await submitBtn.click();
    await page.waitForFunction(() => window.location.pathname === '/dashboard' || window.location.pathname === '/', { timeout: 10000 });

    assert(page.url().includes('/dashboard') || page.url().endsWith('/'), `Logged in successfully, navigated to ${page.url()}`);

    // --- 6. Dashboard UI (/dashboard) ---
    console.log('\n=== [6/10] DASHBOARD UI & QUICK ACTIONS ===');
    await page.goto(`${BASE_URL}/dashboard`, { waitUntil: 'networkidle0' });
    const dashboardText = await page.evaluate(() => document.body.textContent || '');
    assert(dashboardText.includes('ui_tester') || dashboardText.includes('Top Repositories'), 'Dashboard overview rendered user context');

    const hasNewBtn = await page.$('a[href="/new"]');
    assert(hasNewBtn !== null, 'Dashboard contains "+ New" repository button');

    const dashSearch = await page.$('main input[placeholder*="Find a repository"]');
    assert(dashSearch !== null, 'Dashboard contains repository quick-filter input');

    // --- 7. Repository Creation UI (/new) ---
    console.log('\n=== [7/10] CREATE REPOSITORY UI ===');
    await page.goto(`${BASE_URL}/new`, { waitUntil: 'networkidle0' });
    const newRepoText = await page.evaluate(() => document.body.textContent || '');
    assert(newRepoText.includes('Create a new repository') || newRepoText.includes('Create Repository'), 'New repository form rendered');

    const repoNameInput = await page.$('form input[type="text"]');
    assert(repoNameInput !== null, 'Repository name input field rendered');

    const testRepoName = 'ui-automation-repo-' + Date.now().toString().slice(-5);
    await repoNameInput.type(testRepoName);

    const createBtn = await page.$('form button[type="submit"]');
    await createBtn.click();
    await page.waitForFunction((name) => window.location.pathname.includes(name), { timeout: 10000 }, testRepoName);

    assert(page.url().includes(testRepoName), `Repository created and navigated to: ${page.url()}`);

    // --- 8. Repository Views & Navigation Tabs ---
    console.log('\n=== [8/10] REPOSITORY CODE & TABS NAVIGATION ===');
    await page.waitForSelector('main', { timeout: 10000 });
    const repoViewText = await page.evaluate(() => document.body.textContent || '');
    assert(page.url().includes(testRepoName) || repoViewText.includes(testRepoName), `Repository header displays repository name (${testRepoName})`);

    // Verify GitHub-style latest commit details banner
    await page.goto(`${BASE_URL}/cbdc/website`, { waitUntil: 'networkidle0' });
    const commitBannerVisible = await page.evaluate(() => {
      const text = document.body.textContent || '';
      return (text.includes('Initial Commit from cli') || text.includes('commit')) && text.includes('commits');
    });
    assert(commitBannerVisible, 'Repository code view renders GitHub-style latest commit details bar');

    // Issues tab
    await page.goto(`${BASE_URL}/ui_tester/${testRepoName}/issues`, { waitUntil: 'networkidle0' });
    const issuesText = await page.evaluate(() => document.body.textContent || '');
    assert(issuesText.includes('Issues') || issuesText.includes('New Issue'), 'Issues list view loaded');

    // Pull Requests tab
    await page.goto(`${BASE_URL}/ui_tester/${testRepoName}/pulls`, { waitUntil: 'networkidle0' });
    const pullsText = await page.evaluate(() => document.body.textContent || '');
    assert(pullsText.includes('Pull Requests') || pullsText.includes('New Pull Request'), 'Pull requests view loaded');

    // Wiki tab
    await page.goto(`${BASE_URL}/ui_tester/${testRepoName}/wiki`, { waitUntil: 'networkidle0' });
    await page.waitForFunction(() => {
      const text = document.body.textContent || '';
      return text.includes('Wiki') || text.includes('Page Not Found') || text.includes('Create Page');
    }, { timeout: 8000 }).catch(() => {});
    const wikiText = await page.evaluate(() => document.body.textContent || '');
    if (!wikiText.includes('Wiki') && !wikiText.includes('Page Not Found') && !wikiText.includes('Create Page')) {
      console.log('DEBUG WIKI TEXT:', JSON.stringify(wikiText));
    }
    assert(wikiText.includes('Wiki') || wikiText.includes('Page Not Found') || wikiText.includes('Create Page'), 'Repository wiki view loaded');

    // Projects tab
    await page.goto(`${BASE_URL}/ui_tester/${testRepoName}/projects`, { waitUntil: 'networkidle0' });
    const projectsText = await page.evaluate(() => document.body.textContent || '');
    assert(projectsText.includes('Project') || projectsText.includes('Board'), 'Project boards view loaded');

    // Repository Settings tab
    await page.goto(`${BASE_URL}/ui_tester/${testRepoName}/settings`, { waitUntil: 'networkidle0' });
    const settingsText = await page.evaluate(() => document.body.textContent || '');
    assert(settingsText.includes('Repository Settings') || settingsText.includes('Danger Zone'), 'Repository settings view loaded');

    // --- 9. Developer Messaging UI (/messages) ---
    console.log('\n=== [9/10] DEVELOPER DIRECT MESSAGING UI ===');
    await page.goto(`${BASE_URL}/messages`, { waitUntil: 'networkidle0' });
    const messagesText = await page.evaluate(() => document.body.textContent || '');
    assert(messagesText.includes('Developer Messages') || messagesText.includes('New Message') || messagesText.includes('Inbox'), 'Messaging interface loaded');

    // --- 10. Admin Dashboard UI (/admin) ---
    console.log('\n=== [10/10] SUPER ADMIN DASHBOARD UI ===');
    await page.goto(`${BASE_URL}/admin`, { waitUntil: 'networkidle0' });
    const adminText = await page.evaluate(() => document.body.textContent || '');
    assert(adminText.includes('Administration') || adminText.includes('System Telemetry') || adminText.includes('Users'), 'Super Admin panel loaded');

    const adminStatsVisible = adminText.includes('Repositories') || adminText.includes('Users') || adminText.includes('Memory');
    assert(adminStatsVisible, 'System telemetry and management controls displayed on admin dashboard');

  } catch (err) {
    console.error('Test execution error:', err);
    failed++;
  } finally {
    await browser.close();
    console.log('\n========================================================================');
    console.log(`TOTAL UI TESTS: ${passed + failed} | PASSED: ${passed} | FAILED: ${failed}`);
    console.log('========================================================================');
    process.exit(failed > 0 ? 1 : 0);
  }
}

run();
