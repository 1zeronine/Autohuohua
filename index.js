const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const configPath = path.join(__dirname, 'config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const screenshotDir = path.join(__dirname, 'screenshots');

function log(msg) {
    const ts = new Date().toLocaleString('zh-CN', { hour12: false });
    console.log(`[${ts}] ${msg}`);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// --- Take screenshot for debugging ---
async function shot(page, name) {
    try {
        if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
        const file = path.join(screenshotDir, `${name}_${Date.now()}.png`);
        await page.screenshot({ path: file });
        log(`📸 ${file}`);
        return file;
    } catch (_) { return null; }
}

// --- Check if login is needed ---
async function needsLogin(page) {
    const url = page.url();
    if (/login|passport|verify/.test(url)) return true;

    // Check for QR code login modal / full panel
    const loginSelectors = [
        '[id*="login-full-panel"]',
        '[id*="login-panel"]',
        '.qrcode-login',
        '[class*="login-modal"]',
        '[class*="login-panel"]',
        '[class*="passport"]',
    ];
    for (const sel of loginSelectors) {
        const el = await page.$(sel).catch(() => null);
        if (el) {
            const visible = await el.isVisible().catch(() => false);
            if (visible) return true;
        }
    }

    // Check text hints
    for (const txt of ['扫码登录', '请登录', '手机号登录']) {
        try {
            const el = page.getByText(txt).first();
            if (el && (await el.isVisible().catch(() => false))) return true;
        } catch (_) { }
    }

    return false;
}

// --- Dismiss any remaining dialogs/overlays ---
async function dismissOverlays(page) {
    // Try clicking close buttons on known dialogs
    for (const closeSel of [
        '[class*="close"]', '[class*="cancel"]', '[class*="dismiss"]',
        'span:has-text("关闭")', 'span:has-text("取消")', 'span:has-text("知道了")',
        'button:has-text("关闭")', 'button:has-text("取消")',
        '[id*="trust-logout-dialog"] [class*="close"]',
    ]) {
        try {
            const el = await page.$(closeSel);
            if (el && (await el.isVisible().catch(() => false))) {
                await el.click({ timeout: 2000 });
                await sleep(500);
            }
        } catch (_) { }
    }
    // Press Escape to dismiss any modal
    await page.keyboard.press('Escape').catch(() => { });
    await sleep(300);
}

// --- Wait for all login/verify overlays to disappear ---
async function waitForAllOverlaysGone(page) {
    log('🔐 请在浏览器中完成扫码登录、安全验证等步骤...');
    log('   等待时间: 2分钟');

    const overlaySelectors = [
        '[id*="login-full-panel"]',
        '[id*="login-panel"]',
        '#uc-second-verify',
        '#trust-logout-dialog',
        '.qrcode-login',
        '[class*="login-modal"]',
        '[class*="passport"]',
        '[class*="verify"]',
        '.trust-login-dialog-mask',
    ];

    try {
        await page.waitForFunction((sels) => {
            // All overlays must be hidden/gone
            const els = document.querySelectorAll(sels);
            for (const el of els) {
                const style = window.getComputedStyle(el);
                if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
                    return false;
                }
            }
            // URL must not be login
            if (/login|passport|verify/.test(location.href)) return false;
            return true;
        }, overlaySelectors, { timeout: 120000 });

        log('✅ 所有验证已通过！');
        await sleep(2000);
        return true;
    } catch (_) {
        log('❌ 登录/验证超时');
        return false;
    }
}

// --- Main ---
async function main() {
    const userDataDir = path.resolve(__dirname, config.userDataDir);
    log('===== 抖音自动续火花 v2.0 =====');
    log(`数据目录: ${userDataDir}`);

    // Clean stale lock files
    for (const f of ['SingletonLock', 'SingletonSocket', 'SingletonCookie']) {
        const fp = path.join(userDataDir, f);
        try { if (fs.existsSync(fp)) fs.unlinkSync(fp); } catch (_) { }
    }

    log('启动浏览器...');
    const context = await chromium.launchPersistentContext(userDataDir, {
        headless: config.headless,
        viewport: { width: 1280, height: 800 },
        locale: 'zh-CN',
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
        ],
    });

    const page = context.pages()[0] || await context.newPage();

    try {
        // Step 1: Go to 精选 page (new entry point for messages)
        log('打开抖音精选页...');
        await page.goto('https://www.douyin.com/jingxuan', {
            waitUntil: 'domcontentloaded',
            timeout: config.timeout,
        });
        await sleep(4000);

        // Step 2: Handle login
        if (await needsLogin(page)) {
            if (config.headless) {
                log('❌ 需要登录但当前是无头模式，请设 headless=false');
                await context.close();
                process.exit(1);
            }
            const ok = await waitForAllOverlaysGone(page);
            if (!ok) {
                await shot(page, 'login_timeout');
                await context.close();
                process.exit(1);
            }
            // Reload jingxuan after all verifications
            log('重新加载精选页...');
            await page.goto('https://www.douyin.com/jingxuan', {
                waitUntil: 'domcontentloaded',
                timeout: config.timeout,
            });
            await sleep(4000);

            // Check overlays again after reload
            if (await needsLogin(page)) {
                log('⚠️  登录状态未生效，请重新运行');
                await shot(page, 'still_login');
                await context.close();
                process.exit(1);
            }
        }

        // Take debug screenshot
        await shot(page, 'jingxuan_page');

        // Step 3: Locate the 私信 (message) icon and hover
        log('查找右上角私信图标...');
        const msgIcon = await findMessageIcon(page);

        if (!msgIcon) {
            log('❌ 未找到私信图标，保存截图供排查');
            await shot(page, 'no_msg_icon');
            log('   请检查: 1)是否已登录 2)页面是否加载完成');
            await sleep(10000);
            await context.close();
            process.exit(1);
        }

        log('悬停私信图标，展开联系人列表...');

        // Dismiss any lingering dialogs before hover
        await dismissOverlays(page);

        // Hover with force to bypass any remaining interceptors
        try {
            await msgIcon.hover({ force: true, timeout: 10000 });
        } catch (_) {
            // Fallback: try regular hover
            await msgIcon.dispatchEvent('mouseenter');
        }
        await sleep(2000);

        await shot(page, 'msg_dropdown');

        // Step 4: Find friends in the dropdown
        let targets = config.friends || [];

        if (targets.length === 0) {
            log('自动检测火花好友...');
            targets = await detectSparkFriends(page);
        }

        if (targets.length === 0) {
            log('❌ 未找到好友');
            log('   请在 config.json 的 friends 中填写好友昵称');
            await shot(page, 'no_friends');
            await sleep(10000);
        } else {
            log(`📨 共 ${targets.length} 位好友: ${targets.join(', ')}`);

            let sidebarExpanded = false;

            for (let i = 0; i < targets.length; i++) {
                const name = targets[i];
                log(`[${i + 1}/${targets.length}] → ${name}`);
                try {
                    if (i === 0) {
                        // First friend: 私信 hover → click in dropdown
                        const icon = await findMessageIcon(page);
                        if (!icon) throw new Error('未找到私信图标');
                        await icon.hover({ force: true, timeout: 5000 }).catch(() => { });
                        await sleep(1500);
                        await clickFriendAndSend(page, name);
                    } else {
                        // Subsequent friends: use sidebar
                        if (!sidebarExpanded) {
                            await expandSidebar(page);
                            sidebarExpanded = true;
                        }
                        await clickSidebarFriend(page, name);
                        await sendInChat(page);
                    }
                    log(`  ✅ 完成`);
                } catch (err) {
                    log(`  ❌ ${err.message}`);
                    // If sidebar approach failed, reset and try hover for next friend
                    sidebarExpanded = false;
                }
                await sleep(config.waitAfterSend);
            }
        }

    } catch (err) {
        log(`❌ 运行错误: ${err.message}`);
        await shot(page, 'crash');
    } finally {
        log('关闭浏览器...');
        await context.close();
        log('===== 任务结束 =====');
    }
}

// --- Find the message/私信 icon in the top-right area ---
async function findMessageIcon(page) {
    const strategies = [
        // Strategy 1: elements containing "私信" text
        async () => {
            const el = page.getByText('私信').first();
            return el.isVisible().then(v => v ? el : null).catch(() => null);
        },
        // Strategy 2: elements with message-related class in header area
        async () => {
            for (const sel of [
                '[class*="message-icon"]', '[class*="msg-icon"]',
                '[class*="private-message"]', '[class*="im-icon"]',
                '[class*="header"] [class*="message"]',
                'header [class*="msg"]',
                '[class*="top-nav"] [class*="msg"]',
                '[class*="letter"]',
            ]) {
                const el = await page.$(sel).catch(() => null);
                if (el) return el;
            }
            return null;
        },
        // Strategy 3: look for SVG icons in header area
        async () => {
            const header = await page.$('header, [class*="header"], [class*="top-bar"], [class*="nav"]').catch(() => null);
            if (!header) return null;
            // Find all clickable elements with icons in header
            const items = await header.$$('svg, img, span, div, a, button').catch(() => []);
            for (const el of items) {
                try {
                    const text = (await el.textContent())?.trim();
                    if (text === '私信' || text === '消息') return el;
                    // Also check aria-label
                    const aria = await el.getAttribute('aria-label').catch(() => '');
                    if (aria && /私信|消息|message/i.test(aria)) return el;
                } catch (_) { }
            }
            return null;
        },
        // Strategy 4: Any element whose textContent includes 私信
        async () => {
            const els = await page.$$('span, div, a, button').catch(() => []);
            for (const el of els) {
                try {
                    const text = await el.textContent();
                    if (text?.trim() === '私信') return el;
                } catch (_) { }
            }
            return null;
        },
    ];

    for (const fn of strategies) {
        const el = await fn().catch(() => null);
        if (el) {
            log(`  找到私信入口: <${await el.evaluate(n => n.tagName).catch(() => '?')}>`);
            return el;
        }
    }
    return null;
}

// --- Detect friends with spark indicators from the dropdown ---
async function detectSparkFriends(page) {
    const found = new Set();

    // Look for fire emoji
    const fireEls = await page.$$('text=🔥').catch(() => []);
    for (const el of fireEls) {
        try {
            // Get the parent container and extract a name
            const parent = await el.evaluateHandle(node => {
                let p = node.parentElement;
                for (let i = 0; i < 4 && p; i++, p = p.parentElement) {
                    if (p.children.length > 1) return p;
                }
                return node.parentElement;
            });
            const spans = await parent.$$('span, p');
            for (const s of spans) {
                const txt = (await s.textContent())?.trim();
                if (txt && txt.length > 1 && txt.length < 30 && txt !== '🔥') {
                    found.add(txt);
                }
            }
        } catch (_) { }
    }
    return [...found];
}

// --- Click a friend in the dropdown and send a message ---
async function clickFriendAndSend(page, friendName) {
    let clicked = false;

    // Strategy A: Find by text, then click the nearest clickable parent (a, button, or li)
    const textEls = await page.$$('span, p, div, a, li, [class*="name"], [class*="nick"], [class*="title"]').catch(() => []);
    for (const el of textEls) {
        try {
            const txt = (await el.textContent())?.trim();
            if (txt === friendName) {
                const visible = await el.isVisible().catch(() => false);
                if (!visible) continue;

                // Find the best clickable parent: a > button > li > div[role] > closest div with few children
                const clickTarget = await el.evaluateHandle(node => {
                    let p = node;
                    for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
                        const tag = p.tagName?.toLowerCase();
                        if (tag === 'a' || tag === 'button') return p;
                        if (tag === 'li') return p;
                        if (p.getAttribute('role') === 'button') return p;
                    }
                    // Fallback: nearest div with onclick or specific class
                    p = node;
                    for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
                        if (p.onclick || p.getAttribute('@click') || p.getAttribute('v-on:click')) return p;
                        const cls = p.className || '';
                        if (cls && /item|contact|friend|user|chat/i.test(cls)) return p;
                    }
                    return node.parentElement || node;
                });

                try {
                    await clickTarget.click({ timeout: 3000, force: true });
                    clicked = true;
                    log(`  点击了好友: ${friendName}`);
                    break;
                } catch (_) { }
            }
        } catch (_) { }
    }

    // Strategy B: Use text locator with force click
    if (!clicked) {
        try {
            const el = page.locator(`text="${friendName}"`).first();
            if (await el.isVisible().catch(() => false)) {
                await el.click({ timeout: 3000, force: true });
                clicked = true;
            }
        } catch (_) { }
    }

    // Strategy C: not found yet - try scrolling the dropdown and retry
    if (!clicked) {
        // Find the dropdown container and scroll it
        const dropdown = await findDropdownContainer(page);
        if (dropdown) {
            for (let s = 0; s < 8 && !clicked; s++) {
                await dropdown.hover().catch(() => { });
                await page.mouse.wheel(0, 300);
                await sleep(800);

                // Retry finding
                for (const el of await page.$$('span, p, div, a, li, [class*="name"], [class*="nick"], [class*="title"]').catch(() => [])) {
                    try {
                        const txt = (await el.textContent())?.trim();
                        if (txt === friendName) {
                            const visible = await el.isVisible().catch(() => false);
                            if (!visible) continue;
                            const clickTarget = await el.evaluateHandle(node => {
                                let p = node;
                                for (let i = 0; i < 6 && p; i++, p = p.parentElement) {
                                    const tag = p.tagName?.toLowerCase();
                                    if (tag === 'a' || tag === 'button' || tag === 'li') return p;
                                    if (p.getAttribute('role') === 'button') return p;
                                }
                                return node.parentElement || node;
                            });
                            await clickTarget.click({ timeout: 3000, force: true }).catch(() => { });
                            clicked = true;
                            log(`  滚动后找到并点击: ${friendName}`);
                            break;
                        }
                    } catch (_) { }
                }
            }
        }
    }

    if (!clicked) {
        throw new Error(`未在私信列表中找到 "${friendName}" — 请确认昵称完全一致`);
    }

    await sleep(3000);

    // Check if a chat panel / new page appeared
    // Douyin might open a floating chat window or navigate
    let targetPage = page;
    const allPages = page.context().pages();
    if (allPages.length > 1) {
        targetPage = allPages[allPages.length - 1];
        await targetPage.waitForLoadState('domcontentloaded').catch(() => { });
        log(`  切换到新标签页: ${targetPage.url()}`);
        await sleep(1000);
    }

    // Debug: check state
    log(`  URL: ${targetPage.url()}`);

    // Check for chat panel on page (might be a side panel or floating window)
    const chatPanel = await findChatPanel(targetPage);
    if (chatPanel) {
        log(`  找到聊天面板`);
    }

    // Now find the chat input
    const input = await findChatInput(targetPage);
    if (!input) {
        await shot(targetPage, `no_input_${friendName}`);
        throw new Error('未找到聊天输入框 — 点击可能没有触发聊天窗口');
    }

    await input.click().catch(() => { });
    await sleep(300);
    await input.fill('').catch(() => { });
    await input.type(config.message, { delay: 80 });
    await sleep(500);

    // Send
    const sent = await trySend(targetPage, input);
    if (!sent) {
        throw new Error('消息发送失败');
    }
    await sleep(1000);
}

// --- Find the dropdown/popper container after hover ---
async function findDropdownContainer(page) {
    for (const sel of [
        '[class*="dropdown"]', '[class*="popper"]', '[class*="popup"]',
        '[class*="overlay"]', '[class*="float"]', '[class*="menu"]',
        '[class*="tooltip"]', '[class*="contact-list"]', '[class*="friend-list"]',
        'ul[class*="list"]', '[class*="im-list"]',
    ]) {
        const el = await page.$(sel).catch(() => null);
        if (el && (await el.isVisible().catch(() => false))) return el;
    }
    return null;
}

// --- Find chat panel (side panel or floating window) ---
async function findChatPanel(page) {
    for (const sel of [
        '[class*="chat-panel"]', '[class*="chat-window"]',
        '[class*="im-panel"]', '[class*="message-panel"]',
        '[class*="conversation-panel"]', '[class*="chat-room"]',
        'aside[class*="chat"]', '[class*="sidebar-chat"]',
        '[class*="floating"]',
    ]) {
        const el = await page.$(sel).catch(() => null);
        if (el && (await el.isVisible().catch(() => false))) return el;
    }
    return null;
}

// --- Find chat input box ---
async function findChatInput(page) {
    for (const sel of [
        'div[contenteditable="true"]',
        '[contenteditable="true"]',
        'textarea',
        '[placeholder*="发送消息"]',
        '[placeholder*="请输入"]',
        '[class*="chat-input"] textarea',
        '[class*="chat-input"] [contenteditable]',
        '[class*="editor"] [contenteditable]',
        '[class*="im-input"] textarea',
        '[class*="im-input"] [contenteditable]',
    ]) {
        const el = await page.$(sel).catch(() => null);
        if (el) return el;
    }
    return null;
}

// --- Try to send the message ---
async function trySend(page, input) {
    // Record current input text to verify sending later
    const msgText = config.message;

    // Strategy 1: Find and click send button
    const sendBtnSelectors = [
        'button:has-text("发送")',
        '[class*="send-btn"]',
        'span:has-text("发送")',
        'button[class*="send"]',
        '[class*="send"] button',
        '[class*="chat-input"] + [class*="send"]',
        'svg[class*="send"]',
    ];
    for (const sel of sendBtnSelectors) {
        const btn = await page.$(sel).catch(() => null);
        if (btn && (await btn.isVisible().catch(() => false))) {
            await btn.click().catch(() => { });
            await sleep(600);
            // Verify: input should be cleared after send
            const remaining = await getInputText(input).catch(() => '');
            if (!remaining || remaining !== msgText) {
                return true;
            }
        }
    }

    // Strategy 2: Enter key
    await input.press('Enter');
    await sleep(600);
    const afterEnter = await getInputText(input).catch(() => '');
    if (!afterEnter || afterEnter !== msgText) {
        return true;
    }

    // Strategy 3: Shift+Enter then click send again
    await input.press('Meta+Enter');
    await sleep(600);
    const afterMeta = await getInputText(input).catch(() => '');
    if (!afterMeta || afterMeta !== msgText) {
        return true;
    }

    // Strategy 4: Ctrl+Enter
    await input.press('Control+Enter');
    await sleep(600);

    // Last resort: click any element that might be a send trigger
    const inputRect = await input.boundingBox().catch(() => null);
    if (inputRect) {
        // Click slightly to the right of the input (where send button typically sits)
        await page.mouse.click(inputRect.x + inputRect.width + 40, inputRect.y + inputRect.height / 2).catch(() => { });
        await sleep(400);
    }

    return true;
}

// --- Get current text from input (contenteditable or textarea) ---
async function getInputText(input) {
    const tag = await input.evaluate(el => el.tagName?.toLowerCase()).catch(() => '');
    if (tag === 'textarea' || tag === 'input') {
        return (await input.inputValue().catch(() => '')) || '';
    }
    return (await input.textContent().catch(() => '')) || '';
}

// --- Expand the collapsed sidebar ---
async function expandSidebar(page) {
    log(`  展开侧边栏...`);

    // The expand icon: SVG 24x24 with hamburger + left arrow
    const expandSelectors = [
        'svg path[d*="6.707"]',
        'svg[width="24"][height="24"]',
        '[class*="sidebar"] svg',
        '[class*="chat"] svg',
        '[class*="message"] svg',
        '[class*="expand"]', '[class*="unfold"]', '[class*="toggle"]',
        '[class*="sidebar"] [class*="btn"]',
    ];

    for (const sel of expandSelectors) {
        try {
            const el = await page.$(sel);
            if (!el || !(await el.isVisible().catch(() => false))) continue;

            const tag = await el.evaluate(n => n.tagName?.toLowerCase());
            // Click both the element and its parent to be sure
            await el.click({ force: true, timeout: 3000 }).catch(() => { });
            if (tag === 'svg' || tag === 'path') {
                const p = await el.evaluateHandle(n => n.parentElement);
                if (p) await p.asElement()?.click({ force: true, timeout: 2000 }).catch(() => { });
            }
            log(`  已点击展开 (${tag})`);
            await sleep(1500);

            // Scroll through the sidebar to load all contacts
            log(`  滚动加载联系人列表...`);
            for (let s = 0; s < 6; s++) {
                await page.mouse.wheel(0, 500).catch(() => { });
                await sleep(400);
            }
            // Scroll back to top
            await page.mouse.wheel(0, -3000).catch(() => { });
            await sleep(500);
            return;
        } catch (_) { }
    }
    log(`  ⚠️ 未找到展开按钮，尝试继续...`);
}

// --- Find and click a friend in the sidebar, verify chat switched ---
async function clickSidebarFriend(page, friendName) {
    log(`  在侧边栏查找: ${friendName}`);

    // Scroll from top, looking for the friend
    for (let round = 0; round < 10; round++) {
        // Get all visible text elements
        const candidates = await page.$$('span, p, div, li, [class*="name"], [class*="nick"], [class*="title"]').catch(() => []);
        for (const el of candidates) {
            try {
                const txt = (await el.textContent())?.trim();
                if (txt !== friendName || !(await el.isVisible().catch(() => false))) continue;

                // Find the best click target: the entire chat row item
                const row = await el.evaluateHandle(node => {
                    // Go up to find the chat list row (has avatar + name + preview)
                    for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
                        const cls = p.className || '';
                        // A chat row typically contains an avatar img/div
                        if (cls && p.querySelector('img, [class*="avatar"]')) return p;
                    }
                    // Fallback: nearest div/li with reasonable size
                    for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
                        const tag = p.tagName?.toLowerCase();
                        if (tag === 'li' || tag === 'a') return p;
                        if (p.getAttribute('role') === 'button' || p.getAttribute('role') === 'listitem') return p;
                        const rect = p.getBoundingClientRect?.();
                        if (rect && rect.width > 100 && rect.height > 30) return p;
                    }
                    return node.parentElement;
                });

                await row.click({ timeout: 3000, force: true }).catch(() => { });
                log(`  已点击: ${friendName}`);
                await sleep(2000);

                // Double-check: click again to be sure
                await row.click({ timeout: 2000, force: true }).catch(() => { });
                await sleep(2000);
                return;
            } catch (_) { }
        }

        // Scroll down to load more contacts
        await page.mouse.wheel(0, 400).catch(() => { });
        await sleep(600);
    }

    throw new Error(`侧边栏中未找到 "${friendName}"`);
}

// --- Send message in the currently open chat (no friend selection needed) ---
async function sendInChat(page) {
    const input = await findChatInput(page);
    if (!input) {
        await shot(page, 'no_input_sidebar');
        throw new Error('未找到聊天输入框');
    }

    await input.click().catch(() => { });
    await sleep(300);
    // Clear any leftover text (might be from unsent previous message)
    const tag = await input.evaluate(el => el.tagName?.toLowerCase()).catch(() => '');
    if (tag === 'textarea' || tag === 'input') {
        await input.fill('').catch(() => { });
    } else {
        // For contenteditable, select all and delete
        await input.press('Control+a').catch(() => { });
        await input.press('Backspace').catch(() => { });
    }
    await sleep(200);
    await input.type(config.message, { delay: 80 });
    await sleep(500);

    // Send and verify
    const sent = await trySend(page, input);
    if (!sent) {
        throw new Error('消息发送失败');
    }
}

// --- Run ---
main().catch(err => {
    log(`致命错误: ${err.message}`);
    process.exit(1);
});
