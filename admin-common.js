// Общие функции для всех админ-страниц

var ADMIN_TENANT_LS_KEY = 'scenarioBuilder.tenantId';
var ADMIN_TENANT_RE = /^[a-zA-Z0-9._-]{1,64}$/;

/** Текущий тенант для X-Tenant-ID (синхронизируется с server.cjs / scenarios-api). */
function getTenantId() {
    try {
        var raw = localStorage.getItem(ADMIN_TENANT_LS_KEY);
        if (raw === null || raw === '') {
            return 'default';
        }
        var t = String(raw).trim();
        if (t === 'default') {
            return 'default';
        }
        if (ADMIN_TENANT_RE.test(t)) {
            return t;
        }
    } catch (_) {}
    return 'default';
}

/** Сохранить тенант; пустая строка или default — сброс в default. null = невалидное значение. */
function setTenantId(value) {
    var t = String(value || '').trim();
    if (t === '' || t === 'default') {
        try {
            localStorage.removeItem(ADMIN_TENANT_LS_KEY);
        } catch (_) {}
        return 'default';
    }
    if (!ADMIN_TENANT_RE.test(t)) {
        return null;
    }
    try {
        localStorage.setItem(ADMIN_TENANT_LS_KEY, t);
    } catch (_) {}
    return t;
}

/** Добавляет заголовок X-Tenant-ID (сценарии, выполнения, orchestrator). */
function withTenantHeaders(init) {
    init = init || {};
    var headers = new Headers(init.headers || {});
    headers.set('X-Tenant-ID', getTenantId());
    var out = {};
    for (var k in init) {
        if (init.hasOwnProperty(k) && k !== 'headers') {
            out[k] = init[k];
        }
    }
    out.headers = headers;
    return out;
}

function applyTenantFromQuery() {
    try {
        var tq = new URLSearchParams(window.location.search).get('tenant');
        if (!tq) {
            return;
        }
        var applied = setTenantId(tq);
        if (applied === null) {
            return;
        }
        var inp = document.getElementById('adminTenantInput');
        if (inp) {
            inp.value = applied === 'default' ? '' : applied;
        }
    } catch (_) {}
}

function initAdminTenantBar() {
    var nav = document.querySelector('.top-nav .nav-container');
    if (!nav || document.getElementById('adminTenantBar')) {
        return;
    }
    var wrap = document.createElement('div');
    wrap.id = 'adminTenantBar';
    wrap.className = 'admin-tenant-bar';
    wrap.innerHTML =
        '<label class="admin-tenant-label" for="adminTenantInput">Tenant</label>' +
        '<input type="text" id="adminTenantInput" class="config-input admin-tenant-input" maxlength="64" autocomplete="off" title="X-Tenant-ID (localStorage). Пусто = default" placeholder="default" />' +
        '<button type="button" class="action-btn secondary btn-small" id="adminTenantApply">OK</button>';
    var statusEl = nav.querySelector('.nav-status');
    if (statusEl) {
        statusEl.parentNode.insertBefore(wrap, statusEl);
    } else {
        nav.appendChild(wrap);
    }
    var input = document.getElementById('adminTenantInput');
    var tid = getTenantId();
    input.value = tid === 'default' ? '' : tid;
    document.getElementById('adminTenantApply').addEventListener('click', function () {
        var v = input.value.trim();
        var next = setTenantId(v || 'default');
        if (next === null) {
            input.value = getTenantId() === 'default' ? '' : getTenantId();
            return;
        }
        input.value = next === 'default' ? '' : next;
        try {
            window.dispatchEvent(new CustomEvent('scenarioBuilder:tenantChanged', { detail: { tenantId: next } }));
        } catch (_) {}
    });
    input.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') {
            document.getElementById('adminTenantApply').click();
        }
    });
    applyTenantFromQuery();
}

// Установка активной ссылки в навигации
function setActiveNavLink() {
    const currentPage = window.location.pathname.split('/').pop() || 'admin-dashboard.html';
    document.querySelectorAll('.nav-link').forEach(link => {
        const href = link.getAttribute('href');
        if (href === currentPage || (currentPage === '' && href === 'admin-dashboard.html')) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });
}

// Инициализация при загрузке
window.addEventListener('load', () => {
    setActiveNavLink();
    initAdminTenantBar();
});
