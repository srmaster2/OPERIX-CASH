/**
 * ============================================================
 * security.js — SADEK CASH Security Hardening Layer
 * ضع هذا الملف في أول سكريبت يُحمَّل في index.html و login.html
 * <script src="security.js"></script>
 * ============================================================
 */

(function () {
  'use strict';

  // ============================================================
  // 1. إخفاء الكونسول في بيئة الإنتاج
  // ============================================================
  const IS_DEV = (
    location.hostname === 'localhost' ||
    location.hostname === '127.0.0.1' ||
    location.hostname.endsWith('.local') ||
    location.search.includes('debug=1')   // أضف ?debug=1 في URL لتفعيل الكونسول مؤقتاً
  );

  if (!IS_DEV) {
    const noop = function () {};
    const blocked = ['log', 'debug', 'info', 'warn', 'error', 'table', 'dir', 'dirxml', 'group', 'groupCollapsed', 'groupEnd', 'trace', 'assert', 'count', 'countReset', 'time', 'timeEnd', 'timeLog', 'profile', 'profileEnd', 'timeStamp'];
    blocked.forEach(method => {
      try { console[method] = noop; } catch (e) {}
    });

    // منع فتح DevTools عبر كشف حجم النافذة (طريقة إضافية)
    // (لا يعمل في كل المتصفحات لكنه يضيف طبقة)
    let devtoolsOpen = false;
    const threshold = 160;
    setInterval(() => {
      if (
        window.outerWidth - window.innerWidth > threshold ||
        window.outerHeight - window.innerHeight > threshold
      ) {
        if (!devtoolsOpen) {
          devtoolsOpen = true;
          // يمكنك هنا تسجيل حدث أمني أو إعادة توجيه
          // window.location.replace('login.html');
        }
      } else {
        devtoolsOpen = false;
      }
    }, 1000);
  }

  // ============================================================
  // 2. Global Error Handler — يمنع أخطاء الـ JS من الظهور للمستخدم
  // ============================================================
  window.onerror = function (message, source, lineno, colno, error) {
    // في بيئة Dev: أظهر الخطأ، في الإنتاج: ابتلعه بصمت
    if (IS_DEV) {
      return false; // المتصفح يعرض الخطأ كالمعتاد
    }
    return true; // منع الخطأ من الظهور في الكونسول/الواجهة
  };

  window.addEventListener('unhandledrejection', function (event) {
    if (!IS_DEV) {
      event.preventDefault();
    }
  });

  // ============================================================
  // 3. دالة تطهير النصوص من XSS — استخدمها قبل innerHTML
  // ============================================================
  window.escapeHtml = function (str) {
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');
  };

  // نسخة مختصرة للاستخدام السريع
  window.esc = window.escapeHtml;

  // تطهير قيمة HTML مع السماح بعلامات آمنة محددة فقط
  window.sanitizeText = function (str) {
    if (!str) return '';
    // إزالة كل HTML تماماً وإبقاء النص فقط
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(str)));
    return div.innerHTML;
  };

  // ============================================================
  // 4. حماية onclick من XSS في البيانات الديناميكية
  //    بدلاً من: onclick="fn('${name}')" → استخدم data-id + addEventListener
  //    هذه الدالة تنشئ HTML button آمن بدون injection
  // ============================================================
  window.safeAttr = function (str) {
    // تطهير لاستخدام القيمة داخل onclick أو attribute
    if (str === null || str === undefined) return '';
    return String(str)
      .replace(/['"\\<>&]/g, c => ({
        "'": '&#x27;',
        '"': '&quot;',
        '\\': '&#x5C;',
        '<': '&lt;',
        '>': '&gt;',
        '&': '&amp;'
      }[c]));
  };

  // ============================================================
  // 5. حماية من Clickjacking — منع تضمين الصفحة في iframe خارجي
  // ============================================================
  if (window.self !== window.top) {
    // الصفحة داخل iframe — أغلقها
    window.top.location = window.self.location;
  }

  // ============================================================
  // 6. منع نسخ محتوى الصفحة الحساسة (اختياري)
  // ============================================================
  // إلغاء التعليق إذا أردت منع النسخ في index.html
  // document.addEventListener('copy', e => e.preventDefault());
  // document.addEventListener('contextmenu', e => e.preventDefault());

  // ============================================================
  // 7. Rate Limiting للدخول — حماية من Brute Force
  // ============================================================
  const _loginAttempts = {
    count: parseInt(sessionStorage.getItem('_la_c') || '0'),
    lastTime: parseInt(sessionStorage.getItem('_la_t') || '0'),
    MAX: 5,
    WINDOW_MS: 5 * 60 * 1000, // 5 دقائق
    BLOCK_MS: 10 * 60 * 1000, // 10 دقائق حظر

    isBlocked() {
      const now = Date.now();
      if (this.count >= this.MAX) {
        const elapsed = now - this.lastTime;
        if (elapsed < this.BLOCK_MS) {
          return Math.ceil((this.BLOCK_MS - elapsed) / 60000); // دقائق متبقية
        }
        // انتهى الحظر — reset
        this.reset();
      }
      return false;
    },

    record() {
      const now = Date.now();
      // إعادة الحساب إذا تجاوزنا نافذة الوقت
      if (now - this.lastTime > this.WINDOW_MS) {
        this.count = 0;
      }
      this.count++;
      this.lastTime = now;
      sessionStorage.setItem('_la_c', this.count);
      sessionStorage.setItem('_la_t', now);
    },

    reset() {
      this.count = 0;
      this.lastTime = 0;
      sessionStorage.removeItem('_la_c');
      sessionStorage.removeItem('_la_t');
    }
  };

  window.LoginSecurity = _loginAttempts;

  // ============================================================
  // 8. Session Timeout — قطع الجلسة تلقائياً بعد خمول
  // ============================================================
  const SESSION_TIMEOUT_MS = 2 * 60 * 1000; // 30 دقيقة خمول
  let _idleTimer = null;

  function resetIdleTimer() {
    clearTimeout(_idleTimer);
    _idleTimer = setTimeout(async () => {
      // انتهت مدة الخمول
      if (window.supa && window.supa.auth) {
        await window.supa.auth.signOut().catch(() => {});
      }
      // امسح البيانات الحساسة من الذاكرة
      window.currentUserData = null;
      // أعد للدخول
      if (!window.location.pathname.includes('login')) {
        window.location.replace('login.html?timeout=1');
      }
    }, SESSION_TIMEOUT_MS);
  }

  // فعّل مراقبة الخمول فقط في الصفحات الداخلية
  if (!window.location.pathname.includes('login') && !window.location.pathname.includes('reset')) {
    ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'].forEach(evt => {
      document.addEventListener(evt, resetIdleTimer, { passive: true });
    });
    resetIdleTimer();
  }

  // ============================================================
  // 9. تأمين window.currentUserData من التعديل الخارجي
  //    (يمنع المستخدم من تعديله عبر الكونسول)
  // ============================================================
  let _currentUserDataInternal = null;

  Object.defineProperty(window, 'currentUserData', {
    get() { return _currentUserDataInternal; },
    set(val) {
      // السماح بالضبط من الكود الداخلي فقط إذا كانت القيمة null أو object صحيح
      if (val === null || (val && typeof val === 'object' && 'email' in val)) {
        _currentUserDataInternal = val;
      }
      // أي قيمة أخرى تُتجاهل صامتةً
    },
    configurable: false
  });

  // ============================================================
  // 10. منع تعديل CONFIG و TABLES من الكونسول بعد التهيئة
  // ============================================================
  // يُستدعى بعد تهيئة window.CONFIG في config.js
  document.addEventListener('DOMContentLoaded', () => {
    if (window.CONFIG && !IS_DEV) {
      try {
        Object.freeze(window.CONFIG);
        Object.freeze(window.CONFIG.TABLES);
      } catch (e) {}
    }
  });

  // ============================================================
  // تم التحميل
  // ============================================================
  if (IS_DEV) {
    console.log('[Security] Layer loaded in DEV mode — console is active');
  }

})();
