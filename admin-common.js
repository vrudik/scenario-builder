// Общие функции для всех админ-страниц

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
});
