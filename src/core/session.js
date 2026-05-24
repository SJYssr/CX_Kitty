/**
 * SessionManager 单例 — 管理 axios 实例与 cookie 持久化
 * @module core/session
 */

import axios from 'axios';
import { wrapper } from 'axios-cookiejar-support';
import { CookieJar } from 'tough-cookie';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COOKIE_FILE = path.resolve(__dirname, '../../cookies.json');
const DEFAULT_COOKIE_DOMAIN = 'chaoxing.com';

let instance = null;

export class SessionManager {
  /**
   * @param {string} [cookiePath] — cookie 文件路径，默认 cookies.json
   */
  constructor(cookiePath = COOKIE_FILE) {
    if (instance) return instance;

    this.cookiePath = cookiePath;
    this.jar = new CookieJar();
    this.axios = wrapper(axios.create({
      jar: this.jar,
      withCredentials: true,
      timeout: 30000
    }));
    this._token = null;
    this._uid = null;

    this._loadCookiesFromFile();
    instance = this;
  }

  /** 返回单例实例 */
  static getInstance() {
    if (!instance) new SessionManager();
    return instance;
  }

  /** 返回 axios 实例 (带 cookie jar) */
  static getSession() {
    return SessionManager.getInstance().axios;
  }

  /** 从文件重载 cookies */
  static updateCookies() {
    return SessionManager.getInstance()._loadCookiesFromFile();
  }

  /** 设置 Authorization token */
  static setToken(token) {
    SessionManager.getInstance()._token = token;
  }

  /** 获取 Authorization token */
  static getToken() {
    return SessionManager.getInstance()._token;
  }

  /** 获取 uid */
  getUid() {
    return this._uid;
  }

  /** 从文件加载 cookies 到 jar */
  _loadCookiesFromFile() {
    if (!fs.existsSync(this.cookiePath)) return;
    try {
      const raw = fs.readFileSync(this.cookiePath, 'utf8');
      const cookies = JSON.parse(raw);
      if (!Array.isArray(cookies)) return;

      // 清空现有 cookies
      this.jar.removeAllCookiesSync();

      for (const c of cookies) {
        const cookieStr = `${c.key}=${c.value}; Domain=${c.domain || `.${DEFAULT_COOKIE_DOMAIN}`}; Path=${c.path || '/'}`;
        this.jar.setCookieSync(cookieStr, `https://${c.domain || DEFAULT_COOKIE_DOMAIN}`);
      }

      const uidCookie = cookies.find(c => c.key === '_uid');
      if (uidCookie) this._uid = uidCookie.value;
    } catch (_) {
      // 文件损坏则忽略
    }
  }

  /** 持久化 cookies 到文件 */
  async saveCookies() {
    try {
      const jarJson = await this.jar.toJSON();
      const cookies = jarJson.cookies || [];
      fs.writeFileSync(this.cookiePath, JSON.stringify(cookies, null, 2), 'utf8');

      const uidCookie = cookies.find(c => c.key === '_uid');
      if (uidCookie) this._uid = uidCookie.value;
    } catch (_) {
      // 写入失败忽略
    }
  }
}
