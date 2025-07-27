// scripts/utils.mjs

export function generateId() {
    return '_' + Math.random().toString(36).substr(2, 9);
}

export function formatDate(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString + 'T00:00:00'); // Add T00:00:00 to treat as UTC day start
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function getPriorityClass(priority) {
    return `priority-${priority.toLowerCase()}`;
}

export function getStatusClass(status) {
    return `status-${status.toLowerCase().replace(/\s+/g, '')}`;
}

export function initDarkMode() {
    const darkModeSwitch = document.getElementById('darkModeSwitch');
    const htmlElement = document.documentElement;

    // Load saved theme preference
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        htmlElement.setAttribute('data-bs-theme', savedTheme);
        darkModeSwitch.checked = (savedTheme === 'dark');
    } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        // Default to system preference if no saved preference
        htmlElement.setAttribute('data-bs-theme', 'dark');
        darkModeSwitch.checked = true;
    }

    darkModeSwitch.addEventListener('change', () => {
        if (darkModeSwitch.checked) {
            htmlElement.setAttribute('data-bs-theme', 'dark');
            localStorage.setItem('theme', 'dark');
        } else {
            htmlElement.setAttribute('data-bs-theme', 'light');
            localStorage.setItem('theme', 'light');
        }
    });
}