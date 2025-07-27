// scripts/plan.mjs

// Import functions from utils.mjs
import { generateId, formatDate, getPriorityClass, getStatusClass, initDarkMode } from './utils.mjs';
// Import auth functions from auth.mjs
import { auth, initAuth, loginUser, registerUser, logoutUser } from './auth.mjs';
// Import Firestore functions from firestore.mjs
import { saveItemToFirestore, deleteItemFromFirestore, loadItemsFromFirestore } from './firestore.mjs';


document.addEventListener('DOMContentLoaded', () => {
    // --- Global Application State ---
    let items = []; // Will be populated from Firestore after login
    let currentProjectsSort = 'name';
    let hideCompletedProjects = false;
    let hideCompletedTasks = true; // Set to true by default as requested for Tasks tab
    let hideCompletedProjectTasks = false; // For nested tasks in project detail view
    let currentCalendarDate = new Date(); // Tracks the month/year currently displayed in the calendar
    let currentCalendarView = 'timespan'; // 'timespan', 'duedate'
    let globalSearchTerm = '';

    // --- DOM Elements ---
    const loginContainer = document.getElementById('login-container');
    const appContainer = document.getElementById('app-container');
    const loginForm = document.getElementById('loginForm');
    const loginEmailInput = document.getElementById('loginEmail');
    const loginPasswordInput = document.getElementById('loginPassword');
    const registerBtn = document.getElementById('registerBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    // Dark mode elements are handled by initDarkMode from utils.mjs

    const detailOffcanvasElement = document.getElementById('detailOffcanvas');
    const detailOffcanvas = new bootstrap.Offcanvas(detailOffcanvasElement, {
        backdrop: false, // Allow interaction with main content
        scroll: true     // Allow body scrolling when offcanvas is open
    });
    const offcanvasResizeHandle = document.querySelector('.offcanvas-resize-handle');

    const projectsTableBody = document.getElementById('projectsTable').querySelector('tbody');
    const tasksTableBody = document.getElementById('tasksTable').querySelector('tbody');
    const calendarGrid = document.getElementById('calendarGrid');
    const mainTabs = document.getElementById('mainTabs');

    // Detail form fields for auto-saving
    const detailForm = document.getElementById('detailForm');
    const detailItemIdInput = document.getElementById('detailItemId');
    const detailItemTypeInput = document.getElementById('detailItemType');
    const detailTitleInput = document.getElementById('detailTitle');
    const detailTaskProjectField = document.getElementById('detailTaskProjectField'); // New container for task's project dropdown
    const detailTaskProjectSelect = document.getElementById('detailTaskProjectSelect'); // New task's project dropdown
    const detailStartDateInput = document.getElementById('detailStartDate');
    const detailDueDateInput = document.getElementById('detailDueDate');
    const detailPrioritySelect = document.getElementById('detailPriority');
    const detailStatusSelect = document.getElementById('detailStatus');
    const detailDescriptionInput = document.getElementById('detailDescription');

    // Nested Task List in Project Detail View elements
    const projectTasksListContainer = document.getElementById('projectTasksListContainer');
    const projectTasksList = document.getElementById('projectTasksList');
    const hideCompletedProjectTasksSwitch = document.getElementById('hideCompletedProjectTasksSwitch');
    const noProjectTasksMessage = document.getElementById('noProjectTasksMessage');

    // --- Offcanvas Resizing Logic ---
    let isResizing = false;
    let startX;
    let startWidth;
    const minOffcanvasWidth = 300; // Minimum width for the offcanvas
    const maxOffcanvasWidth = window.innerWidth * 0.9; // Max 90% of screen width

    function setOffcanvasWidth(width) {
        // Ensure width is within limits
        width = Math.max(minOffcanvasWidth, Math.min(width, maxOffcanvasWidth));
        detailOffcanvasElement.style.width = `${width}px`;
        localStorage.setItem('offcanvasWidth', width);
    }

    // Load saved width on initialization
    const savedOffcanvasWidth = localStorage.getItem('offcanvasWidth');
    if (savedOffcanvasWidth) {
        setOffcanvasWidth(parseFloat(savedOffcanvasWidth));
    } else {
        // Default to 600px if not saved, or 90vw on smaller screens
        const defaultWidth = window.innerWidth > 768 ? 600 : window.innerWidth * 0.9;
        setOffcanvasWidth(defaultWidth);
    }


    offcanvasResizeHandle.addEventListener('mousedown', (e) => {
        isResizing = true;
        startX = e.clientX;
        startWidth = detailOffcanvasElement.offsetWidth;
        document.body.style.cursor = 'ew-resize'; // Change cursor globally
        detailOffcanvasElement.style.transition = 'none'; // Disable transition during resize
    });

    document.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        const width = startWidth - (e.clientX - startX);
        setOffcanvasWidth(width);
    });

    document.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            document.body.style.cursor = ''; // Reset cursor
            detailOffcanvasElement.style.transition = ''; // Re-enable transition
        }
    });

    // Handle window resize to adjust max-width if necessary
    window.addEventListener('resize', () => {
        if (!isResizing && detailOffcanvasElement.style.display !== 'none') { // Only adjust if not resizing and visible
            const currentWidth = detailOffcanvasElement.offsetWidth;
            const newMax = window.innerWidth * 0.9;
            if (currentWidth > newMax) {
                setOffcanvasWidth(newMax);
            }
        }
    });


    // --- Authentication State Change Handler ---
    async function handleAuthStateChange(user) {
        if (user) {
            console.log("User logged in:", user.email, "UID:", user.uid);
            loginContainer.style.display = 'none';
            appContainer.style.display = 'flex';

            try {
                items = await loadItemsFromFirestore(user.uid);
                console.log("Loaded items for user:", items);
            } catch (error) {
                console.error("Failed to load items for user:", error);
                items = [];
            }
            // Set initial state for hideCompletedTasks switch
            document.getElementById('hideCompletedTasksSwitch').checked = hideCompletedTasks;
            document.getElementById('hideCompletedProjectTasksSwitch').checked = hideCompletedProjectTasks; // Initialize this too
            refreshAllTabs();
        } else {
            console.log("User logged out.");
            loginContainer.style.display = 'flex';
            appContainer.style.display = 'none';
            loginForm.reset();
            document.getElementById('loginMessage').textContent = '';
            // Clear current items and reset app state when logged out
            items = [];
            refreshAllTabs();
            detailOffcanvas.hide(); // Hide detail view on logout
        }
    }

    initAuth(handleAuthStateChange);


    // --- Data Manipulation (using Firestore) ---
    async function addItem(itemData) {
        if (!auth.currentUser) {
            console.error("Cannot add item: No authenticated user.");
            return;
        }
        const newItem = {
            id: generateId(),
            ...itemData
        };
        items.push(newItem);
        await saveItemToFirestore(auth.currentUser.uid, newItem);
        return newItem;
    }

    async function updateItemData(itemId, newValues) {
        if (!auth.currentUser) {
            console.error("Cannot update item: No authenticated user.");
            return;
        }
        const itemIndex = items.findIndex(i => i.id === itemId);
        if (itemIndex !== -1) {
            items[itemIndex] = { ...items[itemIndex], ...newValues };
            await saveItemToFirestore(auth.currentUser.uid, items[itemIndex]);
            console.log(`Item "${items[itemIndex].title}" updated.`);
            refreshAllTabs(); // Always refresh to ensure consistency across all views
        }
    }

    async function deleteItem(itemId, itemType) {
        if (!auth.currentUser) {
            console.error("Cannot delete item: No authenticated user.");
            return;
        }

        items = items.filter(i => i.id !== itemId);
        let itemsToDeleteInFirestore = [itemId];

        if (itemType === 'project') {
            const tasksToDelete = items.filter(i => i.parentId === itemId);
            tasksToDelete.forEach(task => {
                itemsToDeleteInFirestore.push(task.id);
            });
            items = items.filter(i => i.parentId !== itemId);
        }

        for (const idToDelete of itemsToDeleteInFirestore) {
            await deleteItemFromFirestore(auth.currentUser.uid, idToDelete);
        }
    }


    // --- Rendering Functions ---
    function applyGlobalSearchFilter(item) {
        if (!globalSearchTerm) return true;
        const searchLower = globalSearchTerm.toLowerCase();
        return item.title.toLowerCase().includes(searchLower) ||
               (item.description && item.description.toLowerCase().includes(searchLower));
    }

    function renderProjectsTab() {
        projectsTableBody.innerHTML = '';
        document.getElementById('noProjectsMessage').style.display = 'none';

        let projects = items.filter(item => !item.parentId && applyGlobalSearchFilter(item));

        if (hideCompletedProjects) {
            projects = projects.filter(p => p.status !== 'Complete');
        }

        if (currentProjectsSort === 'name') {
            projects.sort((a, b) => a.title.localeCompare(b.title));
        } else if (currentProjectsSort === 'date') {
            projects.sort((a, b) => {
                const dateA = a.dueDate ? new Date(a.dueDate) : new Date('9999-12-31');
                const dateB = b.dueDate ? new Date(b.dueDate) : new Date('9999-12-31');
                return dateA - dateB;
            });
        }

        if (projects.length === 0) {
            document.getElementById('noProjectsMessage').style.display = 'block';
            return;
        }

        projects.forEach(project => {
            const projectRow = projectsTableBody.insertRow();
            projectRow.className = 'project-row';
            projectRow.dataset.itemId = project.id;
            projectRow.dataset.itemType = 'project';
            projectRow.innerHTML = `
                <td><span class="collapse-toggle" data-bs-toggle="collapse" data-bs-target="#project-${project.id}-tasks" aria-expanded="true" aria-controls="project-${project.id}-tasks"><i class="bi bi-chevron-down"></i></span></td>
                <td>${project.title}</td>
                <td><input type="date" class="form-control form-control-sm table-date-input" value="${project.startDate || ''}" data-item-id="${project.id}" data-field="startDate"></td>
                <td><input type="date" class="form-control form-control-sm table-date-input" value="${project.dueDate || ''}" data-item-id="${project.id}" data-field="dueDate"></td>
                <td>
                    <select class="form-select form-select-sm priority-select ${getPriorityClass(project.priority)}" data-item-id="${project.id}" data-field="priority">
                        <option value="Low" ${project.priority === 'Low' ? 'selected' : ''}>Low</option>
                        <option value="Medium" ${project.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                        <option value="High" ${project.priority === 'High' ? 'selected' : ''}>High</option>
                    </select>
                </td>
                <td>
                    <select class="form-select form-select-sm status-select ${getStatusClass(project.status)}" data-item-id="${project.id}" data-field="status">
                        <option value="To Do" ${project.status === 'To Do' ? 'selected' : ''}>To Do</option>
                        <option value="Do Now" ${project.status === 'Do Now' ? 'selected' : ''}>Do Now</option>
                        <option value="Complete" ${project.status === 'Complete' ? 'selected' : ''}>Complete</option>
                    </select>
                </td>
            `;
            projectRow.querySelectorAll('input[type="date"], select').forEach(input => {
                input.addEventListener('change', async (e) => {
                    const field = e.target.dataset.field;
                    const value = e.target.value;
                    await updateItemData(e.target.dataset.itemId, { [field]: value });
                    // No need to call renderProjectsTab() here as refreshAllTabs() is called from updateItemData
                });
            });

            projectRow.addEventListener('click', (e) => {
                if (!e.target.closest('.collapse-toggle') && !e.target.closest('input') && !e.target.closest('select')) {
                    openDetailSideview(project.id);
                }
            });

            const tasksRow = projectsTableBody.insertRow();
            tasksRow.innerHTML = `<td colspan="6" class="p-0">
                <div class="collapse show" id="project-${project.id}-tasks">
                    <table class="table table-sm mb-0">
                        <tbody></tbody>
                    </table>
                </div>
            </td>`;

            const nestedTableBody = tasksRow.querySelector('tbody');
            let projectTasks = items.filter(item => item.parentId === project.id && applyGlobalSearchFilter(item));
            projectTasks.sort((a, b) => a.title.localeCompare(b.title));

            if (projectTasks.length === 0) {
                nestedTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-2">No tasks for this project yet.</td></tr>`;
            } else {
                projectTasks.forEach(task => {
                    const taskRow = nestedTableBody.insertRow();
                    taskRow.className = 'task-row';
                    taskRow.dataset.itemId = task.id;
                    taskRow.dataset.itemType = 'task';
                    taskRow.innerHTML = `
                        <td></td>
                        <td>${task.title}</td>
                        <td><input type="date" class="form-control form-control-sm table-date-input" value="${task.startDate || ''}" data-item-id="${task.id}" data-field="startDate"></td>
                        <td><input type="date" class="form-control form-control-sm table-date-input" value="${task.dueDate || ''}" data-item-id="${task.id}" data-field="dueDate"></td>
                        <td>
                            <select class="form-select form-select-sm priority-select ${getPriorityClass(task.priority)}" data-item-id="${task.id}" data-field="priority">
                                <option value="Low" ${task.priority === 'Low' ? 'selected' : ''}>Low</option>
                                <option value="Medium" ${task.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                                <option value="High" ${task.priority === 'High' ? 'selected' : ''}>High</option>
                            </select>
                        </td>
                        <td>
                            <select class="form-select form-select-sm status-select ${getStatusClass(task.status)}" data-item-id="${task.id}" data-field="status">
                                <option value="To Do" ${task.status === 'To Do' ? 'selected' : ''}>To Do</option>
                                <option value="Do Now" ${task.status === 'Do Now' ? 'selected' : ''}>Do Now</option>
                                <option value="Complete" ${task.status === 'Complete' ? 'selected' : ''}>Complete</option>
                            </select>
                        </td>
                    `;
                    taskRow.querySelectorAll('input[type="date"], select').forEach(input => {
                        input.addEventListener('change', async (e) => {
                            const field = e.target.dataset.field;
                            const value = e.target.value;
                            await updateItemData(e.target.dataset.itemId, { [field]: value });
                            // No need to call renderProjectsTab() here as refreshAllTabs() is called from updateItemData
                        });
                    });

                    taskRow.addEventListener('click', (e) => {
                        if (!e.target.closest('input') && !e.target.closest('select')) {
                            openDetailSideview(task.id);
                        }
                    });
                });
            }
        });

        projectsTableBody.querySelectorAll('.collapse-toggle').forEach(toggle => {
            const icon = toggle.querySelector('i');
            const targetId = toggle.dataset.bsTarget;
            const collapseElement = document.querySelector(targetId);

            collapseElement.addEventListener('show.bs.collapse', () => {
                icon.classList.remove('bi-chevron-right');
                icon.classList.add('bi-chevron-down');
            });
            collapseElement.addEventListener('hide.bs.collapse', () => {
                icon.classList.remove('bi-chevron-down');
                icon.classList.add('bi-chevron-right');
            });
        });
    }

    function renderTasksTab() {
        tasksTableBody.innerHTML = '';
        document.getElementById('noTasksMessage').style.display = 'none';

        let allTasks = items.filter(item => item.parentId && applyGlobalSearchFilter(item));

        if (hideCompletedTasks) {
            allTasks = allTasks.filter(t => t.status !== 'Complete');
        }

        const statusOrder = { 'Do Now': 1, 'To Do': 2, 'Complete': 3 };
        allTasks.sort((a, b) => {
            const statusDiff = statusOrder[a.status] - statusOrder[b.status];
            if (statusDiff !== 0) return statusDiff;

            const dateA = a.dueDate ? new Date(a.dueDate) : (a.startDate ? new Date(a.startDate) : new Date('9999-12-31'));
            const dateB = b.dueDate ? new Date(b.dueDate) : (b.startDate ? new Date(b.startDate) : new Date('9999-12-31'));
            return dateA - dateB;
        });

        if (allTasks.length === 0) {
            document.getElementById('noTasksMessage').style.display = 'block';
            return;
        }

        // Grouping logic for Tasks Tab
        const groupedTasks = allTasks.reduce((acc, task) => {
            acc[task.status] = acc[task.status] || [];
            acc[task.status].push(task);
            return acc;
        }, {});

        Object.keys(statusOrder).forEach(statusGroupKey => {
            const tasksInGroup = groupedTasks[statusGroupKey];
            if (tasksInGroup && tasksInGroup.length > 0) {
                // Status Group Header Row with collapse toggle
                const headerRow = tasksTableBody.insertRow();
                headerRow.className = 'table-active status-group-header';
                headerRow.dataset.bsToggle = 'collapse';
                headerRow.dataset.bsTarget = `#status-${statusGroupKey.replace(/\s+/g, '')}-tasks`;
                headerRow.setAttribute('aria-expanded', 'true');
                headerRow.setAttribute('aria-controls', `status-${statusGroupKey.replace(/\s+/g, '')}-tasks`);
                headerRow.innerHTML = `
                    <td colspan="6">
                        <span class="collapse-toggle"><i class="bi bi-chevron-down"></i></span>
                        <strong>${statusGroupKey}</strong>
                    </td>`;

                // Nested row for tasks under this status
                const tasksWrapperRow = tasksTableBody.insertRow();
                tasksWrapperRow.innerHTML = `<td colspan="6" class="p-0">
                    <div class="collapse show" id="status-${statusGroupKey.replace(/\s+/g, '')}-tasks">
                        <table class="table table-sm mb-0">
                            <tbody></tbody>
                        </table>
                    </div>
                </td>`;
                const nestedTableBody = tasksWrapperRow.querySelector('tbody');

                tasksInGroup.forEach(task => {
                    const taskRow = nestedTableBody.insertRow();
                    taskRow.className = 'task-row';
                    taskRow.dataset.itemId = task.id;
                    taskRow.dataset.itemType = 'task';
                    const parentProject = items.find(p => p.id === task.parentId);
                    const parentTitle = parentProject ? parentProject.title : 'N/A';

                    taskRow.innerHTML = `
                        <td>${task.title}</td>
                        <td>${parentTitle}</td>
                        <td><input type="date" class="form-control form-control-sm table-date-input" value="${task.startDate || ''}" data-item-id="${task.id}" data-field="startDate"></td>
                        <td><input type="date" class="form-control form-control-sm table-date-input" value="${task.dueDate || ''}" data-item-id="${task.id}" data-field="dueDate"></td>
                        <td>
                            <select class="form-select form-select-sm priority-select ${getPriorityClass(task.priority)}" data-item-id="${task.id}" data-field="priority">
                                <option value="Low" ${task.priority === 'Low' ? 'selected' : ''}>Low</option>
                                <option value="Medium" ${task.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                                <option value="High" ${task.priority === 'High' ? 'selected' : ''}>High</option>
                            </select>
                        </td>
                        <td>
                            <select class="form-select form-select-sm status-select ${getStatusClass(task.status)}" data-item-id="${task.id}" data-field="status">
                                <option value="To Do" ${task.status === 'To Do' ? 'selected' : ''}>To Do</option>
                                <option value="Do Now" ${task.status === 'Do Now' ? 'selected' : ''}>Do Now</option>
                                <option value="Complete" ${task.status === 'Complete' ? 'selected' : ''}>Complete</option>
                            </select>
                        </td>
                    `;
                    taskRow.querySelectorAll('input[type="date"], select').forEach(input => {
                        input.addEventListener('change', async (e) => {
                            const field = e.target.dataset.field;
                            const value = e.target.value;
                            await updateItemData(e.target.dataset.itemId, { [field]: value });
                            // No need to call renderTasksTab() here as refreshAllTabs() is called from updateItemData
                        });
                    });

                    Array.from(taskRow.children).forEach(cell => {
                        if (!cell.querySelector('input') && !cell.querySelector('select')) {
                            cell.addEventListener('click', () => openDetailSideview(task.id));
                        }
                    });
                });
            }
        });

        // Attach collapse listeners for status headers
        tasksTableBody.querySelectorAll('.status-group-header').forEach(header => {
            const icon = header.querySelector('.collapse-toggle i');
            const targetId = header.dataset.bsTarget;
            const collapseElement = document.querySelector(targetId);

            collapseElement.addEventListener('show.bs.collapse', () => {
                icon.classList.remove('bi-chevron-right');
                icon.classList.add('bi-chevron-down');
            });
            collapseElement.addEventListener('hide.bs.collapse', () => {
                icon.classList.remove('bi-chevron-down');
                icon.classList.add('bi-chevron-right');
            });
        });
    }


    function renderCalendarTab() {
        const calendarGrid = document.getElementById('calendarGrid');
        Array.from(calendarGrid.children).filter(child => !child.classList.contains('calendar-day-header')).forEach(child => child.remove());

        document.getElementById('currentMonthYear').textContent = currentCalendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

        const yearSelect = document.getElementById('yearSelect');
        const currentYear = new Date().getFullYear();
        yearSelect.innerHTML = '';
        for (let i = currentYear - 5; i <= currentYear + 5; i++) {
            const option = document.createElement('option');
            option.value = i;
            option.textContent = i;
            if (i === currentCalendarDate.getFullYear()) {
                option.selected = true;
            }
            yearSelect.appendChild(option);
        }

        const firstDayOfMonth = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), 1);
        const lastDayOfMonth = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth() + 1, 0);
        const numDaysInMonth = lastDayOfMonth.getDate();
        const firstDayOfWeek = firstDayOfMonth.getDay();

        const today = new Date();
        today.setHours(0,0,0,0);

        for (let i = 0; i < firstDayOfWeek; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyDay);
        }

        for (let dayNum = 1; dayNum <= numDaysInMonth; dayNum++) {
            const dayDate = new Date(currentCalendarDate.getFullYear(), currentCalendarDate.getMonth(), dayNum);
            const dayDiv = document.createElement('div');
            dayDiv.className = 'calendar-day';
            dayDiv.innerHTML = `<div class="calendar-day-number">${dayNum}</div>`;

            if (dayDate.toDateString() === today.toDateString()) {
                dayDiv.classList.add('today');
            }

            let relevantItems = items.filter(item => {
                // Filter: only items with a defined due date
                if (!item.dueDate || item.status === 'Complete' || !applyGlobalSearchFilter(item)) return false;

                const startDate = item.startDate ? new Date(item.startDate + 'T00:00:00') : null;
                const dueDate = new Date(item.dueDate + 'T00:00:00'); // Due date is guaranteed here

                if (currentCalendarView === 'duedate') {
                    return dueDate.toDateString() === dayDate.toDateString();
                } else { // 'timespan' (now the only other option)
                    const start = startDate || dueDate; // If start date not present, use due date as start of span
                    return dayDate.setHours(0,0,0,0) >= start.setHours(0,0,0,0) && dayDate.setHours(0,0,0,0) <= dueDate.setHours(0,0,0,0);
                }
            });

            relevantItems.sort((a,b) => {
                // Sort by due date primarily
                const dateA = new Date(a.dueDate);
                const dateB = new Date(b.dueDate);
                if (dateA - dateB !== 0) return dateA - dateB;
                // Then by priority (High first)
                const priorityOrder = { 'High': 1, 'Medium': 2, 'Low': 3 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
            });


            relevantItems.forEach(item => {
                const taskSpan = document.createElement('span');
                taskSpan.className = `calendar-day-task ${getPriorityClass(item.priority)}`; // Apply priority class for border
                taskSpan.textContent = item.title;
                taskSpan.dataset.itemId = item.id;
                taskSpan.addEventListener('click', () => openDetailSideview(item.id));
                dayDiv.appendChild(taskSpan);
            });

            calendarGrid.appendChild(dayDiv);
        }

        const totalCells = firstDayOfWeek + numDaysInMonth;
        const remainingCells = (7 - (totalCells % 7)) % 7;
        for (let i = 0; i < remainingCells; i++) {
            const emptyDay = document.createElement('div');
            emptyDay.className = 'calendar-day empty';
            calendarGrid.appendChild(emptyDay);
        }
    }


    function refreshAllTabs() {
        if (auth.currentUser) {
            renderProjectsTab();
            renderTasksTab();
            renderCalendarTab();
        }
    }

    // --- Detail Sideview Logic ---
    async function openDetailSideview(itemId) {
        const item = items.find(i => i.id === itemId);
        if (!item) return;

        // Populate common fields
        detailItemIdInput.value = item.id;
        detailItemTypeInput.value = item.parentId ? 'task' : 'project';
        document.getElementById('detailItemParentId').value = item.parentId || '';
        detailTitleInput.value = item.title;
        detailStartDateInput.value = item.startDate || '';
        detailDueDateInput.value = item.dueDate || '';
        detailPrioritySelect.value = item.priority;
        detailStatusSelect.value = item.status;
        detailDescriptionInput.value = item.description;

        // Apply priority class to the select element itself
        detailPrioritySelect.className = `form-select ${getPriorityClass(item.priority)}`;
        detailStatusSelect.className = `form-select ${getStatusClass(item.status)}`;

        const addNestedTaskBtn = document.getElementById('addNestedTaskBtn');

        // Logic for Task vs Project specific fields in detail view
        if (item.parentId) { // It's a Task
            document.getElementById('detailOffcanvasLabel').textContent = 'Task Details';
            detailTaskProjectField.style.display = 'block';
            projectTasksListContainer.style.display = 'none'; // Hide project task list
            addNestedTaskBtn.style.display = 'none';

            // Populate project dropdown
            const projects = items.filter(p => !p.parentId);
            detailTaskProjectSelect.innerHTML = '<option value="">-- Select Project --</option>';
            projects.forEach(project => {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.title;
                if (project.id === item.parentId) {
                    option.selected = true;
                }
                detailTaskProjectSelect.appendChild(option);
            });

            // Set current value
            detailTaskProjectSelect.value = item.parentId;

        } else { // It's a Project
            document.getElementById('detailOffcanvasLabel').textContent = 'Project Details';
            detailTaskProjectField.style.display = 'none';
            projectTasksListContainer.style.display = 'block'; // Show project task list
            addNestedTaskBtn.style.display = 'inline-block'; // Show "Add Task" for projects

            renderNestedProjectTasks(item.id);
        }

        detailOffcanvas.show();
    }

    function renderNestedProjectTasks(projectId) {
        projectTasksList.innerHTML = '';
        noProjectTasksMessage.style.display = 'none';

        let tasks = items.filter(item => item.parentId === projectId);

        if (hideCompletedProjectTasks) {
            tasks = tasks.filter(t => t.status !== 'Complete');
        }

        tasks.sort((a, b) => a.title.localeCompare(b.title));

        if (tasks.length === 0) {
            noProjectTasksMessage.style.display = 'block';
            return;
        }

        tasks.forEach(task => {
            const li = document.createElement('li');
            li.dataset.itemId = task.id;
            li.innerHTML = `
                <span class="task-title-inner">${task.title}</span>
                <div class="task-controls-inner">
                    <select class="form-select form-select-sm priority-select ${getPriorityClass(task.priority)}" data-item-id="${task.id}" data-field="priority">
                        <option value="Low" ${task.priority === 'Low' ? 'selected' : ''}>Low</option>
                        <option value="Medium" ${task.priority === 'Medium' ? 'selected' : ''}>Medium</option>
                        <option value="High" ${task.priority === 'High' ? 'selected' : ''}>High</option>
                    </select>
                    <select class="form-select form-select-sm status-select ${getStatusClass(task.status)}" data-item-id="${task.id}" data-field="status">
                        <option value="To Do" ${task.status === 'To Do' ? 'selected' : ''}>To Do</option>
                        <option value="Do Now" ${task.status === 'Do Now' ? 'selected' : ''}>Do Now</option>
                        <option value="Complete" ${task.status === 'Complete' ? 'selected' : ''}>Complete</option>
                    </select>
                </div>
            `;
            // Attach event listeners for inline editing within the nested list
            li.querySelectorAll('select').forEach(select => {
                select.addEventListener('change', async (e) => {
                    const field = e.target.dataset.field;
                    const value = e.target.value;
                    await updateItemData(e.target.dataset.itemId, { [field]: value });
                    // No need for separate render call as updateItemData calls refreshAllTabs
                });
            });
            // Allow clicking the list item itself to open detail view
            li.addEventListener('click', (e) => {
                if (!e.target.closest('select')) { // Don't open if clicking the select
                    openDetailSideview(task.id);
                }
            });
            projectTasksList.appendChild(li);
        });
    }


    // --- Event Listeners ---

    // Login Form Submission
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        try {
            await loginUser(email, password);
        } catch (error) {
            // Error messages handled by auth.mjs
        }
    });

    // Register Button Click
    registerBtn.addEventListener('click', async () => {
        const email = loginEmailInput.value;
        const password = loginPasswordInput.value;
        try {
            await registerUser(email, password);
        } catch (error) {
            // Error messages handled by auth.mjs
        }
    });

    // Logout Button
    logoutBtn.addEventListener('click', async () => {
        await logoutUser();
    });

    // Dark Mode Switch
    initDarkMode();

    // Automatic Save for Detail Form Fields
    detailTitleInput.addEventListener('change', (e) => updateItemData(detailItemIdInput.value, { title: e.target.value }));
    detailStartDateInput.addEventListener('change', (e) => updateItemData(detailItemIdInput.value, { startDate: e.target.value }));
    detailDueDateInput.addEventListener('change', (e) => updateItemData(detailItemIdInput.value, { dueDate: e.target.value }));
    detailDescriptionInput.addEventListener('change', (e) => updateItemData(detailItemIdInput.value, { description: e.target.value }));

    detailPrioritySelect.addEventListener('change', async (e) => {
        const selectedPriority = e.target.value;
        await updateItemData(detailItemIdInput.value, { priority: selectedPriority });
        // Update the select's own class for color immediately
        detailPrioritySelect.className = `form-select ${getPriorityClass(selectedPriority)}`;
    });

    detailStatusSelect.addEventListener('change', async (e) => {
        const selectedStatus = e.target.value;
        await updateItemData(detailItemIdInput.value, { status: selectedStatus });
        detailStatusSelect.className = `form-select ${getStatusClass(selectedStatus)}`; // Update class for color
    });

    // New: Handle change for task's project dropdown
    detailTaskProjectSelect.addEventListener('change', async (e) => {
        const selectedProjectId = e.target.value;
        await updateItemData(detailItemIdInput.value, { parentId: selectedProjectId || null });
    });

    // New: Hide Completed switch for nested tasks in project detail view
    hideCompletedProjectTasksSwitch.addEventListener('change', () => {
        hideCompletedProjectTasks = hideCompletedProjectTasksSwitch.checked;
        const currentDetailedItemId = detailItemIdInput.value;
        if (detailItemTypeInput.value === 'project') {
             renderNestedProjectTasks(currentDetailedItemId);
        }
    });


    document.getElementById('deleteItemBtn').addEventListener('click', async () => {
        const itemId = detailItemIdInput.value;
        const itemType = detailItemTypeInput.value;
        let confirmMessage = `Are you sure you want to delete this ${itemType}?`;
        if (itemType === 'project') {
            confirmMessage += ' All its tasks will also be deleted.';
        }

        if (confirm(confirmMessage)) {
            await deleteItem(itemId, itemType);
            detailOffcanvas.hide();
            refreshAllTabs();
        }
    });

    document.getElementById('addNestedTaskBtn').addEventListener('click', async () => {
        const projectId = detailItemIdInput.value;
        const project = items.find(i => i.id === projectId);

        if (project) {
            const newTask = await addItem({
                title: 'New Task for ' + project.title,
                description: '',
                startDate: new Date().toISOString().split('T')[0],
                dueDate: '',
                priority: 'Medium',
                status: 'To Do',
                parentId: projectId
            });
            refreshAllTabs();
            // Re-open current project to update its nested task list
            openDetailSideview(projectId); // This will re-render the nested list
        }
    });

    // Add Project
    document.getElementById('addProjectBtn').addEventListener('click', async () => {
        const newProject = await addItem({
            title: 'New Project',
            description: '',
            startDate: new Date().toISOString().split('T')[0],
            dueDate: '',
            priority: 'Medium',
            status: 'To Do',
            parentId: null
        });
        refreshAllTabs();
        openDetailSideview(newProject.id);
    });

    // Projects Tab Sorting
    document.querySelectorAll('#projectsSortDropdown + .dropdown-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            currentProjectsSort = e.target.dataset.sort;
            document.getElementById('projectsSortDropdown').textContent = `Sort by: ${e.target.textContent}`;
            renderProjectsTab();
        });
    });

    // Projects Tab Hide Completed Switch
    document.getElementById('hideCompletedProjectsSwitch').addEventListener('change', (e) => {
        hideCompletedProjects = e.target.checked;
        renderProjectsTab();
    });

    // Projects Tab Collapse/Expand All
    document.getElementById('collapseAllProjectsBtn').addEventListener('click', () => {
        document.querySelectorAll('#projectsTable .collapse').forEach(collapseEl => {
            const bsCollapse = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
            bsCollapse.hide();
        });
    });
    document.getElementById('expandAllProjectsBtn').addEventListener('click', () => {
        document.querySelectorAll('#projectsTable .collapse').forEach(collapseEl => {
            const bsCollapse = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
            bsCollapse.show();
        });
    });


    // Tasks Tab Hide Completed Switch
    document.getElementById('hideCompletedTasksSwitch').addEventListener('change', (e) => {
        hideCompletedTasks = e.target.checked;
        renderTasksTab();
    });

    // Tasks Tab Collapse/Expand All
    document.getElementById('collapseAllTasksBtn').addEventListener('click', () => {
        document.querySelectorAll('#tasksTable .collapse').forEach(collapseEl => {
            const bsCollapse = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
            bsCollapse.hide();
        });
    });
    document.getElementById('expandAllTasksBtn').addEventListener('click', () => {
        document.querySelectorAll('#tasksTable .collapse').forEach(collapseEl => {
            const bsCollapse = bootstrap.Collapse.getInstance(collapseEl) || new bootstrap.Collapse(collapseEl, { toggle: false });
            bsCollapse.show();
        });
    });


    // Calendar Navigation
    document.getElementById('prevMonthBtn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
        renderCalendarTab();
    });
    document.getElementById('nextMonthBtn').addEventListener('click', () => {
        currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
        renderCalendarTab();
    });
    document.getElementById('todayBtn').addEventListener('click', () => {
        currentCalendarDate = new Date();
        renderCalendarTab();
    });
    document.getElementById('yearSelect').addEventListener('change', (e) => {
        currentCalendarDate.setFullYear(parseInt(e.target.value));
        renderCalendarTab();
    });
    document.querySelectorAll('#calendarViewDropdown + .dropdown-menu .dropdown-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            currentCalendarView = e.target.dataset.view;
            document.getElementById('calendarViewDropdown').textContent = `View: ${e.target.textContent}`;
            renderCalendarTab();
        });
    });

    // Global Search
    document.getElementById('globalSearchInput').addEventListener('input', (e) => {
        globalSearchTerm = e.target.value.trim();
        refreshAllTabs();
    });
    document.getElementById('clearSearchBtn').addEventListener('click', () => {
        document.getElementById('globalSearchInput').value = '';
        globalSearchTerm = '';
        refreshAllTabs();
    });

    // Set up event listeners for tab changes to re-render relevant content
    mainTabs.addEventListener('shown.bs.tab', function (event) {
        // Hide detail offcanvas if it's currently open and a tab changes.
        // This is a design choice; you might want it to stay open always.
        // For uninterrupted browsing, this specific hide might be removed.
        // detailOffcanvas.hide(); // Keep it commented for uninterrupted browsing

        const activeTabId = event.target.id;
        if (activeTabId === 'projects-tab') {
            renderProjectsTab();
        } else if (activeTabId === 'tasks-tab') {
            renderTasksTab();
        } else if (activeTabId === 'calendar-tab') {
            renderCalendarTab();
        }
    });

});