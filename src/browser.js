import { chromium } from "playwright";
import config from "../config.js";
import { log } from "./utils.js";

let browser = null;

export async function getBrowser() {
  if (!browser || !browser.isConnected()) {
    log("启动浏览器...", "step");
    browser = await chromium.launch({
      headless: config.browser.headless,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"]
    });
    log("浏览器已启动", "success");
  }
  return browser;
}

export async function newPage() {
  const br = await getBrowser();
  const context = await br.newContext({
    userAgent: config.browser.userAgent,
    viewport: config.browser.viewport,
    locale: config.browser.locale
  });
  return await context.newPage();
}

export async function closeBrowser() {
  if (browser) {
    await browser.close();
    browser = null;
    log("浏览器已关闭", "info");
  }
}
