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
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  page.on('console', msg => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

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

    const hasRecentActivity = dashboardText.includes('Recent Activity');
    assert(hasRecentActivity, 'Dashboard contains Recent Activity feed');

    const hasActivityPaginationOrStream = dashboardText.includes('activities') || dashboardText.includes('Showing') || dashboardText.includes('No recent activity');
    assert(hasActivityPaginationOrStream, 'Dashboard Recent Activity renders pagination or feed state');

    // Profile Overview Button check
    const profileLink = await page.$('a[href*="/user/ui_tester"]');
    assert(profileLink !== null, 'Dashboard contains Profile Overview link');
    const profileBtnHtml = await page.evaluate(el => el ? el.outerHTML : '', profileLink);
    assert(profileBtnHtml.includes('w-3 h-3') && profileBtnHtml.includes('whitespace-nowrap'), 'Profile Overview button has compact w-3 h-3 icon and whitespace-nowrap');

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
    try {
      await page.waitForFunction(() => {
        const text = document.body.textContent || '';
        return text.includes('Wiki') || text.includes('Page Not Found') || text.includes('Create Page');
      }, { timeout: 8000 });
    } catch (e) {
      const dbg = await page.evaluate(() => ({ url: window.location.href, text: document.body.innerText }));
      console.log('DEBUG WIKI FAILURE:', dbg);
    }
    const wikiText = await page.evaluate(() => document.body.textContent || '');
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

    // --- 11. Blank Repository GitHub Setup Guide ---
    console.log('\n=== [11/12] BLANK REPOSITORY GITHUB SETUP GUIDE ===');
    const blankRepo = `blank-guide-${Date.now()}`;
    await page.goto(`${BASE_URL}/new`, { waitUntil: 'networkidle0' });
    const repoInput = await page.$('form input[placeholder="my-awesome-project"]');
    if (repoInput) await repoInput.type(blankRepo);
    const initCheck = await page.$('input[type="checkbox"]');
    if (initCheck && await page.evaluate(el => el.checked, initCheck)) {
      await initCheck.click();
    }
    const createBlankBtn = await page.$('form button[type="submit"]');
    if (createBlankBtn) await createBlankBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle0' });

    const blankBody = await page.evaluate(() => document.body.textContent || '');
    assert(blankBody.includes('Quick setup — if you\'ve done this kind of thing before'), 'Blank repo shows GitHub Quick setup banner');
    assert(blankBody.includes('…or create a new repository on the command line'), 'Shows create repo command line instructions');
    assert(blankBody.includes('…or push an existing repository from the command line'), 'Shows push existing repo command line instructions');
    assert(blankBody.includes('…or import code from another repository'), 'Shows import code section');
    const importCodeLink = await page.$(`a[href*="/new/import?owner=ui_tester&name=${blankRepo}"]`);
    assert(importCodeLink !== null, 'Import code link is prefilled with target repo name and owner');

    // --- 12. Import Repository Feature ---
    console.log('\n=== [12/12] IMPORT REPOSITORY FEATURE (/new/import) ===');
    await page.goto(`${BASE_URL}/new/import`, { waitUntil: 'networkidle0' });
    const importHeader = await page.evaluate(() => document.body.textContent || '');
    assert(importHeader.includes('Import your project to ProGit'), 'Import project page rendered');

    const importedRepoName = `imported-auto-${Date.now()}`;
    const cloneUrlInput = await page.$('input[placeholder*="Hello-World.git"]');
    if (cloneUrlInput) {
      await cloneUrlInput.type('http://localhost:3000/cbdc/website.git');
    }
    const targetNameInput = await page.$('input[placeholder="repository-name"]');
    if (targetNameInput) {
      await page.evaluate(el => { el.value = ''; el.dispatchEvent(new Event('input', { bubbles: true })); }, targetNameInput);
      await targetNameInput.type(importedRepoName);
    }
    const beginBtn = await page.$('form button[type="submit"]');
    if (beginBtn) await beginBtn.click();
    await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 30000 });

    const importedPageBody = await page.evaluate(() => document.body.textContent || '');
    assert(importedPageBody.includes('commit') || importedPageBody.includes('index.html'), 'Repository imported successfully with full tree and commits');

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
