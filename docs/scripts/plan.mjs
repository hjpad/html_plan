// scripts/plan.mjs

// Import functions from utils.mjs
import {
  generateId,
  formatDate,
  getPriorityClass,
  getStatusClass,
  initDarkMode,
} from "./utils.mjs";
// Import auth functions from auth.mjs
import {
  auth,
  initAuth,
  loginUser,
  registerUser,
  logoutUser,
} from "./auth.mjs";
// Import Firestore functions from firestore.mjs
import {
  saveItemToFirestore,
  deleteItemFromFirestore,
  loadItemsFromFirestore,
  saveWorkspaceToFirestore,
  loadWorkspacesFromFirestore,
  deleteWorkspaceAndContents,
} from "./firestore.mjs";

document.addEventListener("DOMContentLoaded", () => {
  // --- Global Application State ---
  let items = [];
  let workspaces = [];
  let currentWorkspaceId = null;
  let expandedProjects = new Set();
  let currentProjectsSort = "name";
  let hideCompletedProjects = false;
  let hideCompletedTasks = true;
  let hideCompletedProjectTasks = false;
  let currentCalendarDate = new Date();
  let currentCalendarView = "duedate";
  let hideCompletedCalendar = false;
  let globalSearchTerm = "";

  // --- DOM Elements ---
  const loginContainer = document.getElementById("login-container");
  const appContainer = document.getElementById("main-app-wrapper");
  const loginForm = document.getElementById("loginForm");
  const loginEmailInput = document.getElementById("loginEmail");
  const loginPasswordInput = document.getElementById("loginPassword");
  const togglePasswordBtn = document.getElementById("togglePassword");
  const registerBtn = document.getElementById("registerBtn");
  const logoutBtn = document.getElementById("logoutBtn");
  const createWorkspaceBtn = document.getElementById("createWorkspaceBtn");
  const currentWorkspaceNameEl = document.getElementById(
    "currentWorkspaceName"
  );
  const workspacesListContainerEl = document.getElementById(
    "workspacesListContainer"
  );
  const detailOffcanvasElement = document.getElementById("detailOffcanvas");
  const offcanvasResizeHandle = document.querySelector(
    ".offcanvas-resize-handle"
  );
  const projectsTableBody = document
    .getElementById("projectsTable")
    .querySelector("tbody");
  const tasksTableBody = document
    .getElementById("tasksTable")
    .querySelector("tbody");
  const linkedWorkspacesList = document.getElementById("linkedWorkspacesList");
  const calendarGrid = document.getElementById("calendarGrid");
  const mainTabs = document.getElementById("mainTabs");
  const monthSelect = document.getElementById("monthSelect");
  const yearSelect = document.getElementById("yearSelect");
  const detailForm = document.getElementById("detailForm");
  const detailItemIdInput = document.getElementById("detailItemId");
  const detailItemTypeInput = document.getElementById("detailItemType");
  const detailTitleInput = document.getElementById("detailTitle");
  const detailProjectWorkspaceField = document.getElementById(
    "detailProjectWorkspaceField"
  );
  const detailProjectWorkspaceSelect = document.getElementById(
    "detailProjectWorkspaceSelect"
  );
  const detailTaskProjectField = document.getElementById(
    "detailTaskProjectField"
  );
  const detailTaskProjectSelect = document.getElementById(
    "detailTaskProjectSelect"
  );
  const detailStartDateInput = document.getElementById("detailStartDate");
  const detailDueDateInput = document.getElementById("detailDueDate");
  const detailPrioritySelect = document.getElementById("detailPriority");
  const detailStatusSelect = document.getElementById("detailStatus");
  const detailDescriptionInput = document.getElementById("detailDescription");
  const projectTasksListContainer = document.getElementById(
    "projectTasksListContainer"
  );
  const projectTasksList = document.getElementById("projectTasksList");
  const hideCompletedProjectTasksSwitch = document.getElementById(
    "hideCompletedProjectTasksSwitch"
  );
  const noProjectTasksMessage = document.getElementById(
    "noProjectTasksMessage"
  );

  const statusOrder = { "Do Now": 1, "To Do": 2, "On Hold": 3, Complete: 4 };

  // --- Offcanvas Resizing & Layout Logic ---
  let isResizing = false;
  let startX, startWidth;
  let detailOffcanvas;

  function setOffcanvasWidth(width) {
    const isDesktop = window.innerWidth > 767.98;
    if (!isDesktop) {
      detailOffcanvasElement.style.width = "100vw";
    } else {
      const minW = 300;
      const maxW = window.innerWidth * 0.9;
      const newWidth = Math.max(minW, Math.min(width, maxW));
      detailOffcanvasElement.style.width = `${newWidth}px`;
      localStorage.setItem("offcanvasWidth", newWidth);
    }
  }

  const initializeOffcanvas = () => {
    const isDesktop = window.innerWidth > 767.98;
    detailOffcanvas = new bootstrap.Offcanvas(detailOffcanvasElement, {
      backdrop: !isDesktop,
      scroll: true,
    });

    if (isDesktop) {
      const savedWidth = localStorage.getItem("offcanvasWidth") || 600;
      setOffcanvasWidth(parseFloat(savedWidth));
    }

    detailOffcanvasElement.addEventListener("show.bs.offcanvas", () => {
      if (window.innerWidth > 767.98) {
        document.getElementById("main-content-area").style.marginRight =
          detailOffcanvasElement.style.width;
      }
    });
    detailOffcanvasElement.addEventListener("hide.bs.offcanvas", () => {
      document.getElementById("main-content-area").style.marginRight = "0";
    });
  };

  offcanvasResizeHandle.addEventListener("mousedown", (e) => {
    if (window.innerWidth <= 767.98) return;
    isResizing = true;
    startX = e.clientX;
    startWidth = detailOffcanvasElement.offsetWidth;
    document.body.style.cursor = "ew-resize";
    const transitions = [
      detailOffcanvasElement,
      document.getElementById("main-content-area"),
    ];
    transitions.forEach((el) => (el.style.transition = "none"));
  });

  document.addEventListener("mousemove", (e) => {
    if (!isResizing) return;
    const newWidth = startWidth - (e.clientX - startX);
    setOffcanvasWidth(newWidth);
    document.getElementById("main-content-area").style.marginRight =
      detailOffcanvasElement.style.width;
  });

  document.addEventListener("mouseup", () => {
    if (isResizing) {
      isResizing = false;
      document.body.style.cursor = "";
      const transitions = [
        detailOffcanvasElement,
        document.getElementById("main-content-area"),
      ];
      transitions.forEach((el) => (el.style.transition = ""));
    }
  });

  window.addEventListener("resize", () => {
    if (detailOffcanvas)
      detailOffcanvas._config.backdrop = !(window.innerWidth > 767.98);
    if (!isResizing)
      setOffcanvasWidth(
        parseFloat(localStorage.getItem("offcanvasWidth")) || 600
      );
  });

  // --- Authentication State Change Handler ---
  async function handleAuthStateChange(user) {
    if (user) {
      loginContainer.style.display = "none";
      appContainer.style.display = "flex";
      try {
        [items, workspaces] = await Promise.all([
          loadItemsFromFirestore(user.uid),
          loadWorkspacesFromFirestore(user.uid),
        ]);

        workspaces.forEach(ws => {
            if (!ws.linkedWorkspaces) {
                ws.linkedWorkspaces = {};
            }
        });

        let defaultWorkspaceId;
        if (workspaces.length === 0) {
          const defaultWorkspace = { id: generateId(), name: "Workspace", linkedWorkspaces: {} };
          await saveWorkspaceToFirestore(user.uid, defaultWorkspace);
          workspaces.push(defaultWorkspace);
          defaultWorkspaceId = defaultWorkspace.id;
        } else {
          workspaces.sort((a, b) => a.name.localeCompare(b.name));
          defaultWorkspaceId = workspaces[0].id;
        }

        const orphanedProjects = items.filter(
          (item) => !item.parentId && !item.workspaceId
        );
        if (orphanedProjects.length > 0) {
          const migrationPromises = orphanedProjects.map((p) => {
            p.workspaceId = defaultWorkspaceId;
            return saveItemToFirestore(user.uid, p);
          });
          await Promise.all(migrationPromises);
        }

        const lastWorkspaceId = localStorage.getItem("lastWorkspaceId");
        currentWorkspaceId =
          lastWorkspaceId && workspaces.some((w) => w.id === lastWorkspaceId)
            ? lastWorkspaceId
            : defaultWorkspaceId;
      } catch (error) {
        console.error("Failed to load or migrate user data:", error);
        items = [];
        workspaces = [];
      }
      renderUserMenu();
      updateCurrentWorkspaceDisplay();
      refreshAllTabs();
    } else {
      loginContainer.style.display = "flex";
      appContainer.style.display = "none";
      loginForm.reset();
      items = [];
      workspaces = [];
      currentWorkspaceId = null;
      localStorage.removeItem("lastWorkspaceId");
      detailOffcanvas?.hide();
      refreshAllTabs();
    }
  }
  initAuth(handleAuthStateChange);

  // --- Workspace Management ---
  function updateCurrentWorkspaceDisplay() {
    const currentWorkspace = workspaces.find(
      (w) => w.id === currentWorkspaceId
    );
    currentWorkspaceNameEl.textContent = currentWorkspace
      ? currentWorkspace.name
      : "";
  }

  function renderUserMenu() {
    workspacesListContainerEl.innerHTML = "";
    workspaces.sort((a, b) => a.name.localeCompare(b.name));

    workspaces.forEach((workspace) => {
      const isActive = workspace.id === currentWorkspaceId;
      const li = document.createElement("li");
      li.className = `dropdown-item-wrapper ${isActive ? "active" : ""}`;

      const button = document.createElement("button");
      button.className = `workspace-select-btn ${isActive ? "active" : ""}`;
      button.innerHTML = `<span>${workspace.name}</span> ${
        isActive ? '<i class="bi bi-check-lg"></i>' : ""
      }`;
      button.addEventListener("click", () => switchWorkspace(workspace.id));

      const actionsDiv = document.createElement("div");
      actionsDiv.className = "workspace-actions";

      const renameBtn = document.createElement("button");
      renameBtn.className = "btn btn-sm btn-icon";
      renameBtn.innerHTML = '<i class="bi bi-pencil"></i>';
      renameBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleRenameWorkspace(workspace.id);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "btn btn-sm btn-icon text-danger";
      deleteBtn.innerHTML = '<i class="bi bi-trash"></i>';
      deleteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        handleDeleteWorkspace(workspace.id);
      });

      actionsDiv.appendChild(renameBtn);
      actionsDiv.appendChild(deleteBtn);
      li.appendChild(button);
      li.appendChild(actionsDiv);
      workspacesListContainerEl.appendChild(li);
    });
  }

  function switchWorkspace(workspaceId) {
    if (workspaceId === currentWorkspaceId) return;
    currentWorkspaceId = workspaceId;
    localStorage.setItem("lastWorkspaceId", workspaceId);
    updateCurrentWorkspaceDisplay();
    renderUserMenu();
    refreshAllTabs();
  }

  async function handleCreateWorkspace() {
    const name = prompt("Enter the name for the new workspace:");
    if (name && name.trim()) {
      if (!auth.currentUser) return;
      const newWorkspace = { id: generateId(), name: name.trim(), linkedWorkspaces: {} };
      await saveWorkspaceToFirestore(auth.currentUser.uid, newWorkspace);
      workspaces.push(newWorkspace);
      switchWorkspace(newWorkspace.id);
    }
  }

  async function handleRenameWorkspace(workspaceId) {
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) return;
    const newName = prompt("Enter the new name:", workspace.name);
    if (newName && newName.trim() && newName.trim() !== workspace.name) {
      workspace.name = newName.trim();
      await saveWorkspaceToFirestore(auth.currentUser.uid, workspace);
      renderUserMenu();
      updateCurrentWorkspaceDisplay();
    }
  }

  async function handleDeleteWorkspace(workspaceId) {
    if (workspaces.length <= 1)
      return alert("You cannot delete your only workspace.");
    const workspace = workspaces.find((w) => w.id === workspaceId);
    if (!workspace) return;
    if (
      !confirm(
        `Delete "${workspace.name}"? This will also delete all its projects and tasks.`
      )
    )
      return;
    try {
      await deleteWorkspaceAndContents(auth.currentUser.uid, workspaceId);
      items = items.filter(
        (i) =>
          i.workspaceId !== workspaceId &&
          !items.some(
            (p) => p.id === i.parentId && p.workspaceId === workspaceId
          )
      );
      workspaces = workspaces.filter((w) => w.id !== workspaceId);

      workspaces.forEach(ws => {
          if (ws.linkedWorkspaces && ws.linkedWorkspaces[workspaceId]) {
              delete ws.linkedWorkspaces[workspaceId];
              saveWorkspaceToFirestore(auth.currentUser.uid, ws);
          }
      });

      if (currentWorkspaceId === workspaceId) switchWorkspace(workspaces[0].id);
      else {
        renderUserMenu();
        refreshAllTabs();
      }
    } catch (error) {
      console.error("Error deleting workspace:", error);
      alert("Failed to delete workspace.");
    }
  }

  // --- Data Manipulation ---
  async function addItem(itemData) {
    if (!auth.currentUser) return;
    if (!itemData.parentId && !itemData.workspaceId) {
      if (!currentWorkspaceId) return alert("Error: No active workspace.");
      itemData.workspaceId = currentWorkspaceId;
    }
    const newItem = {
      id: generateId(),
      priority: "Low",
      status: "To Do",
      startDate: new Date().toISOString().split("T")[0],
      ...itemData,
      description: '',
    };
    items.push(newItem);
    await saveItemToFirestore(auth.currentUser.uid, newItem);
    return newItem;
  }

  async function updateItemData(itemId, newValues) {
    if (!auth.currentUser) return;
    const index = items.findIndex((i) => i.id === itemId);
    if (index !== -1) {
      items[index] = { ...items[index], ...newValues };
      await saveItemToFirestore(auth.currentUser.uid, items[index]);
      updateUIForItem(items[index]);
    }
  }

  function updateUIForItem(item) {
    const itemRow = document.querySelector(`[data-item-id="${item.id}"]`);
    if (itemRow) {
      itemRow.querySelector(".table-cell-title").textContent = item.title;
    }
    refreshAllTabs();
  }

  async function deleteItem(itemId, itemType) {
    if (!auth.currentUser) return;
    let idsToDelete = [itemId];
    if (itemType === "project")
      idsToDelete.push(
        ...items.filter((i) => i.parentId === itemId).map((t) => t.id)
      );
    const idSet = new Set(idsToDelete);
    items = items.filter((i) => !idSet.has(i.id));
    await Promise.all(
      idsToDelete.map((id) => deleteItemFromFirestore(auth.currentUser.uid, id))
    );
  }

  // --- Rendering Functions ---
  function applyGlobalSearchFilter(item) {
    if (!globalSearchTerm) return true;
    const searchLower = globalSearchTerm.toLowerCase();
    return (
      item.title.toLowerCase().includes(searchLower) ||
      (item.description && item.description.toLowerCase().includes(searchLower))
    );
  }

  function renderProjectsTab() {
    projectsTableBody.innerHTML = "";
    document.getElementById("noProjectsMessage").style.display = "none";
    let projects = items.filter(
      (item) =>
        !item.parentId &&
        item.workspaceId === currentWorkspaceId &&
        applyGlobalSearchFilter(item)
    );
    if (hideCompletedProjects) {
      projects = projects.filter((p) => p.status !== "Complete");
    }
    projects.sort((a, b) => a.title.localeCompare(b.title));
    if (currentProjectsSort === "date") {
      projects.sort((a, b) => {
        const dateA = a.dueDate ? new Date(a.dueDate) : new Date("9999-12-31");
        const dateB = b.dueDate ? new Date(b.dueDate) : new Date("9999-12-31");
        return dateA - dateB;
      });
    }
    if (projects.length === 0) {
      document.getElementById("noProjectsMessage").style.display = "block";
      return;
    }
    projects.forEach((project) => {
      const projectRow = projectsTableBody.insertRow();
      const isExpanded = expandedProjects.has(project.id);
      projectRow.className = "project-row";
      projectRow.dataset.itemId = project.id;
      projectRow.dataset.itemType = "project";
      projectRow.innerHTML = `<td class="sticky-column"><div class="d-flex align-items-center"><span class="collapse-toggle me-2" data-bs-toggle="collapse" data-bs-target="#project-tasks-${
        project.id
      }"><i class="bi bi-chevron-${
        isExpanded ? "down" : "right"
      }"></i></span><span class="table-cell-title">${
        project.title
      }</span></div></td><td><input type="date" class="form-control form-control-sm table-date-input" value="${
        project.startDate || ""
      }" data-item-id="${
        project.id
      }" data-field="startDate"></td><td><input type="date" class="form-control form-control-sm table-date-input" value="${
        project.dueDate || ""
      }" data-item-id="${
        project.id
      }" data-field="dueDate"></td><td><select class="form-select form-select-sm priority-select ${getPriorityClass(
        project.priority
      )}" data-item-id="${
        project.id
      }" data-field="priority"><option value="Low" ${
        project.priority === "Low" ? "selected" : ""
      }>Low</option><option value="Medium" ${
        project.priority === "Medium" ? "selected" : ""
      }>Medium</option><option value="High" ${
        project.priority === "High" ? "selected" : ""
      }>High</option></select></td><td><select class="form-select form-select-sm status-select ${getStatusClass(
        project.status
      )}" data-item-id="${
        project.id
      }" data-field="status"><option value="To Do" ${
        project.status === "To Do" ? "selected" : ""
      }>To Do</option><option value="Do Now" ${
        project.status === "Do Now" ? "selected" : ""
      }>Do Now</option><option value="On Hold" ${
        project.status === "On Hold" ? "selected" : ""
      }>On Hold</option><option value="Complete" ${
        project.status === "Complete" ? "selected" : ""
      }>Complete</option></select></td>`;
      projectRow
        .querySelectorAll("input, select")
        .forEach((input) =>
          input.addEventListener("change", (e) =>
            updateItemData(e.target.dataset.itemId, {
              [e.target.dataset.field]: e.target.value,
            })
          )
        );
      projectRow.addEventListener("click", (e) => {
        if (!e.target.closest("input, select, .collapse-toggle"))
          openDetailSideview(project.id);
      });
      projectRow
        .querySelector(".collapse-toggle")
        .addEventListener("click", (e) => {
          e.stopPropagation();
          if (expandedProjects.has(project.id)) {
            expandedProjects.delete(project.id);
          } else {
            expandedProjects.add(project.id);
          }
          renderProjectsTab();
        });
      const tasksRow = projectsTableBody.insertRow();
      tasksRow.innerHTML = `<td colspan="6" class="p-0"><div class="collapse ${
        isExpanded ? "show" : ""
      }" id="project-tasks-${
        project.id
      }"><table class="table table-sm mb-0"><tbody></tbody></table></div></td>`;
      const nestedTableBody = tasksRow.querySelector("tbody");
      let projectTasks = items
        .filter(
          (item) =>
            item.parentId === project.id && applyGlobalSearchFilter(item)
        )
        .sort((a, b) => a.title.localeCompare(b.title));
      if (projectTasks.length === 0) {
        nestedTableBody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-2">No tasks yet.</td></tr>`;
      } else {
        projectTasks.forEach((task) => {
          const taskRow = nestedTableBody.insertRow();
          taskRow.className = "task-row";
          taskRow.dataset.itemId = task.id;
          taskRow.innerHTML = `<td class="sticky-column"><span class="table-cell-title">${
            task.title
          }</span></td><td><input type="date" class="form-control form-control-sm table-date-input" value="${
            task.startDate || ""
          }" data-item-id="${
            task.id
          }" data-field="startDate"></td><td><input type="date" class="form-control form-control-sm table-date-input" value="${
            task.dueDate || ""
          }" data-item-id="${
            task.id
          }" data-field="dueDate"></td><td><select class="form-select form-select-sm priority-select ${getPriorityClass(
            task.priority
          )}" data-item-id="${
            task.id
          }" data-field="priority"><option value="Low" ${
            task.priority === "Low" ? "selected" : ""
          }>Low</option><option value="Medium" ${
            task.priority === "Medium" ? "selected" : ""
          }>Medium</option><option value="High" ${
            task.priority === "High" ? "selected" : ""
          }>High</option></select></td><td><select class="form-select form-select-sm status-select ${getStatusClass(
            task.status
          )}" data-item-id="${
            task.id
          }" data-field="status"><option value="To Do" ${
            task.status === "To Do" ? "selected" : ""
          }>To Do</option><option value="Do Now" ${
            task.status === "Do Now" ? "selected" : ""
          }>Do Now</option><option value="On Hold" ${
            task.status === "On Hold" ? "selected" : ""
          }>On Hold</option><option value="Complete" ${
            task.status === "Complete" ? "selected" : ""
          }>Complete</option></select></td>`;
          taskRow
            .querySelectorAll("input, select")
            .forEach((input) =>
              input.addEventListener("change", (e) =>
                updateItemData(e.target.dataset.itemId, {
                  [e.target.dataset.field]: e.target.value,
                })
              )
            );
          taskRow.addEventListener("click", (e) => {
            if (!e.target.closest("input, select")) openDetailSideview(task.id);
          });
        });
      }
    });
  }

  function renderTasksTab() {
    tasksTableBody.innerHTML = "";
    document.getElementById("noTasksMessage").style.display = "none";
    
    renderLinkedWorkspacesDropdown();

    const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);
    if (!currentWorkspace) {
        document.getElementById("noTasksMessage").style.display = "block";
        return;
    }

    const linkedWorkspaceIds = currentWorkspace.linkedWorkspaces
        ? Object.keys(currentWorkspace.linkedWorkspaces).filter(id => currentWorkspace.linkedWorkspaces[id])
        : [];
    
    const workspaceIdsToShow = new Set([currentWorkspaceId, ...linkedWorkspaceIds]);

    const projectIdsInWorkspace = new Set(
      items
        .filter((i) => !i.parentId && workspaceIdsToShow.has(i.workspaceId))
        .map((p) => p.id)
    );

    let allTasks = items.filter(
      (item) =>
        item.parentId &&
        projectIdsInWorkspace.has(item.parentId) &&
        applyGlobalSearchFilter(item)
    );

    if (hideCompletedTasks) {
      allTasks = allTasks.filter((t) => t.status !== "Complete");
    }
    allTasks.sort(
      (a, b) =>
        statusOrder[a.status] - statusOrder[b.status] ||
        new Date(a.dueDate || "9999-12-31") -
          new Date(b.dueDate || "9999-12-31")
    );
    if (allTasks.length === 0) {
      document.getElementById("noTasksMessage").style.display = "block";
      return;
    }
    const groupedTasks = allTasks.reduce((acc, task) => {
      (acc[task.status] = acc[task.status] || []).push(task);
      return acc;
    }, {});
    Object.keys(statusOrder).forEach((statusGroupKey) => {
      const tasksInGroup = groupedTasks[statusGroupKey];
      if (tasksInGroup && tasksInGroup.length > 0) {
        const headerRow = tasksTableBody.insertRow();
        headerRow.className = `table-active status-group-header ${getStatusClass(
          statusGroupKey
        )}-header`;
        headerRow.dataset.bsToggle = "collapse";
        headerRow.dataset.bsTarget = `#status-tasks-${statusGroupKey.replace(
          /\s+/g,
          ""
        )}`;
        headerRow.innerHTML = `<td colspan="6"><span class="collapse-toggle"><i class="bi bi-chevron-down"></i></span> <strong>${statusGroupKey}</strong></td>`;
        const tasksWrapperRow = tasksTableBody.insertRow();
        tasksWrapperRow.innerHTML = `<td colspan="6" class="p-0"><div class="collapse show" id="status-tasks-${statusGroupKey.replace(
          /\s+/g,
          ""
        )}"><table class="table table-sm mb-0"><tbody></tbody></table></div></td>`;
        const nestedTableBody = tasksWrapperRow.querySelector("tbody");
        tasksInGroup.forEach((task) => {
          const taskRow = nestedTableBody.insertRow();
          taskRow.className = "task-row";
          taskRow.dataset.itemId = task.id;
          const parentProject = items.find((p) => p.id === task.parentId);
          taskRow.innerHTML = `<td class="sticky-column"><span class="table-cell-title">${
            task.title
          }</span></td><td class="sticky-column-2"><span class="table-cell-title project-link" data-project-id="${
            task.parentId
          }">${
            parentProject ? parentProject.title : "N/A"
          }</span></td><td><input type="date" class="form-control form-control-sm table-date-input" value="${
            task.startDate || ""
          }" data-item-id="${
            task.id
          }" data-field="startDate"></td><td><input type="date" class="form-control form-control-sm table-date-input" value="${
            task.dueDate || ""
          }" data-item-id="${
            task.id
          }" data-field="dueDate"></td><td><select class="form-select form-select-sm priority-select ${getPriorityClass(
            task.priority
          )}" data-item-id="${
            task.id
          }" data-field="priority"><option value="Low" ${
            task.priority === "Low" ? "selected" : ""
          }>Low</option><option value="Medium" ${
            task.priority === "Medium" ? "selected" : ""
          }>Medium</option><option value="High" ${
            task.priority === "High" ? "selected" : ""
          }>High</option></select></td><td><select class="form-select form-select-sm status-select ${getStatusClass(
            task.status
          )}" data-item-id="${
            task.id
          }" data-field="status"><option value="To Do" ${
            task.status === "To Do" ? "selected" : ""
          }>To Do</option><option value="Do Now" ${
            task.status === "Do Now" ? "selected" : ""
          }>Do Now</option><option value="On Hold" ${
            task.status === "On Hold" ? "selected" : ""
          }>On Hold</option><option value="Complete" ${
            task.status === "Complete" ? "selected" : ""
          }>Complete</option></select></td>`;
          taskRow
            .querySelectorAll("input, select")
            .forEach((input) =>
              input.addEventListener("change", (e) =>
                updateItemData(e.target.dataset.itemId, {
                  [e.target.dataset.field]: e.target.value,
                })
              )
            );
          taskRow
            .querySelectorAll("td:not(:has(input, select))")
            .forEach((cell) =>
              cell.addEventListener("click", () => openDetailSideview(task.id))
            );
          taskRow
            .querySelector(".project-link")
            .addEventListener("click", (e) => {
              e.stopPropagation();
              openDetailSideview(task.parentId);
            });
        });
      }
    });
  }

  function renderCalendarTab() {
    calendarGrid.innerHTML = "";
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(
      (day) =>
        (calendarGrid.innerHTML += `<div class="calendar-day-header">${day}</div>`)
    );
    const months = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    monthSelect.innerHTML = months
      .map(
        (month, index) =>
          `<option value="${index}" ${
            index === currentCalendarDate.getMonth() ? "selected" : ""
          }>${month}</option>`
      )
      .join("");
    const currentYear = new Date().getFullYear();
    yearSelect.innerHTML = Array.from(
      { length: 11 },
      (_, i) => i + currentYear - 5
    )
      .map(
        (year) =>
          `<option value="${year}" ${
            year === currentCalendarDate.getFullYear() ? "selected" : ""
          }>${year}</option>`
      )
      .join("");
    const firstDayOfMonth = new Date(
      currentCalendarDate.getFullYear(),
      currentCalendarDate.getMonth(),
      1
    );
    const lastDayOfMonth = new Date(
      currentCalendarDate.getFullYear(),
      currentCalendarDate.getMonth() + 1,
      0
    );
    for (let i = 0; i < firstDayOfMonth.getDay(); i++)
      calendarGrid.insertAdjacentHTML(
        "beforeend",
        '<div class="calendar-day empty"></div>'
      );
    const projectIdsInWorkspace = new Set(
      items
        .filter((i) => !i.parentId && i.workspaceId === currentWorkspaceId)
        .map((p) => p.id)
    );
    for (let dayNum = 1; dayNum <= lastDayOfMonth.getDate(); dayNum++) {
      const dayDate = new Date(
        currentCalendarDate.getFullYear(),
        currentCalendarDate.getMonth(),
        dayNum
      );
      const dayDiv = document.createElement("div");
      dayDiv.className = "calendar-day";
      if (dayDate.toDateString() === new Date().toDateString())
        dayDiv.classList.add("today");
      dayDiv.innerHTML = `<div class="calendar-day-number">${dayNum}</div>`;
      const relevantItems = items
        .filter((item) => {
          const isInWorkspace =
            item.workspaceId === currentWorkspaceId ||
            (item.parentId && projectIdsInWorkspace.has(item.parentId));
          if (
            !isInWorkspace ||
            !item.dueDate ||
            !applyGlobalSearchFilter(item) ||
            (hideCompletedCalendar && item.status === "Complete")
          )
            return false;
          const dueDate = new Date(item.dueDate + "T00:00:00");
          if (currentCalendarView === "duedate")
            return dueDate.toDateString() === dayDate.toDateString();
          const startDate = item.startDate
            ? new Date(item.startDate + "T00:00:00")
            : dueDate;
          return dayDate >= startDate && dayDate <= dueDate;
        })
        .sort(
          (a, b) =>
            new Date(a.dueDate) - new Date(b.dueDate) ||
            a.priority.localeCompare(b.priority)
        );
      relevantItems.forEach((item) => {
        const taskSpan = document.createElement("span");
        taskSpan.className = `calendar-day-task ${getPriorityClass(
          item.priority
        )}`;
        taskSpan.textContent = item.title;
        taskSpan.dataset.itemId = item.id;
        taskSpan.addEventListener("click", () => openDetailSideview(item.id));
        dayDiv.appendChild(taskSpan);
      });
      calendarGrid.appendChild(dayDiv);
    }
    while (calendarGrid.children.length % 7 !== 0)
      calendarGrid.insertAdjacentHTML(
        "beforeend",
        '<div class="calendar-day empty"></div>'
      );
  }

  function refreshAllTabs() {
    if (auth.currentUser) {
      renderProjectsTab();
      renderTasksTab();
      renderCalendarTab();
    }
  }

  async function openDetailSideview(itemId) {
    const item = items.find((i) => i.id === itemId);
    const isProject = !item.parentId;
    detailOffcanvasElement.classList.toggle('project-detail', isProject);
    detailOffcanvasElement.classList.toggle('task-detail', !isProject);
    if (!item) return;
    detailItemIdInput.value = item.id;
    detailItemTypeInput.value = item.parentId ? "task" : "project";
    document.getElementById("detailItemParentId").value = item.parentId || "";
    detailTitleInput.value = item.title;
    detailStartDateInput.value = item.startDate || "";
    detailDueDateInput.value = item.dueDate || "";
    detailPrioritySelect.value = item.priority;
    detailStatusSelect.value = item.status;
    detailDescriptionInput.value = item.description;
    detailPrioritySelect.className = `form-select ${getPriorityClass(
      item.priority
    )}`;
    detailStatusSelect.className = `form-select ${getStatusClass(item.status)}`;

    // textArea adjust height
    const textarea = detailDescriptionInput;
    let defaultHeight = textarea.style.height;

    const adjustHeight = () => {
        textarea.style.height = 'auto';
        textarea.style.height = textarea.scrollHeight + 'px';
    };

    textarea.addEventListener('focus', adjustHeight);
    textarea.addEventListener('input', adjustHeight);
    textarea.addEventListener('blur', () => {
        textarea.style.height = defaultHeight;
    });

    if (item.parentId) { // This is a task
      document.getElementById("detailOffcanvasLabel").textContent = "Task Details";
      detailProjectWorkspaceField.style.display = "none";
      detailTaskProjectField.style.display = "block";
      projectTasksListContainer.style.display = "none";
      document.getElementById("addNestedTaskBtn").style.display = "none";

      // --- START: CORRECTED LOGIC FOR TASK PROJECT DROPDOWN ---
      // 1. Find the parent project of the current task.
      const parentProject = items.find(p => p.id === item.parentId);

      // 2. If we found the parent, populate the dropdown with projects from its workspace.
      if (parentProject) {
        // 3. Get the workspace ID from the found parent project.
        const parentProjectWorkspaceId = parentProject.workspaceId;

        // 4. Filter the main `items` list to get ALL projects from that specific workspace.
        const projectsInCorrectWorkspace = items
            .filter(p => !p.parentId && p.workspaceId === parentProjectWorkspaceId)
            .sort((a, b) => a.title.localeCompare(b.title));

        // 5. Generate the HTML for the options, marking the task's actual parent as 'selected'.
        const optionsHtml = projectsInCorrectWorkspace.map(p =>
            `<option value="${p.id}" ${p.id === item.parentId ? "selected" : ""}>${p.title}</option>`
        ).join('');

        // 6. Populate the dropdown.
        detailTaskProjectSelect.innerHTML = '<option value="">-- Select Project --</option>' + optionsHtml;
      } else {
        // This is an edge case, if a task's parent project was deleted or data is corrupt.
        console.error(`Could not find parent project with ID: ${item.parentId} for task: "${item.title}"`);
        detailTaskProjectSelect.innerHTML = '<option value="">-- Project Not Found --</option>';
      }
      // --- END: CORRECTED LOGIC ---

    } else { // This is a project
      document.getElementById("detailOffcanvasLabel").textContent = "Project Details";
      detailTaskProjectField.style.display = "none";
      detailProjectWorkspaceField.style.display = "block";
      projectTasksListContainer.style.display = "block";
      document.getElementById("addNestedTaskBtn").style.display = "inline-block";
      detailProjectWorkspaceSelect.innerHTML = workspaces
        .map(
          (w) =>
            `<option value="${w.id}" ${
              w.id === item.workspaceId ? "selected" : ""
            }>${w.name}</option>`
        )
        .join("");
      renderNestedProjectTasks(item.id);
    }
    detailOffcanvas.show();
  }

  function renderNestedProjectTasks(projectId) {
    projectTasksList.innerHTML = "";
    noProjectTasksMessage.style.display = "none";
    let tasks = items.filter((item) => item.parentId === projectId);
    if (hideCompletedProjectTasks)
      tasks = tasks.filter((t) => t.status !== "Complete");
    tasks.sort((a, b) => a.title.localeCompare(b.title));
    if (tasks.length === 0) {
      noProjectTasksMessage.style.display = "block";
    } else {
      tasks.forEach((task) => {
        const li = document.createElement("li");
        li.dataset.itemId = task.id;
        li.innerHTML = `<span class="task-title-inner">${
          task.title
        }</span><div class="task-controls-inner"><select class="form-select form-select-sm priority-select ${getPriorityClass(
          task.priority
        )}" data-field="priority"><option value="Low" ${
          task.priority === "Low" ? "selected" : ""
        }>Low</option><option value="Medium" ${
          task.priority === "Medium" ? "selected" : ""
        }>Medium</option><option value="High" ${
          task.priority === "High" ? "selected" : ""
        }>High</option></select><select class="form-select form-select-sm status-select ${getStatusClass(
          task.status
        )}" data-field="status"><option value="To Do" ${
          task.status === "To Do" ? "selected" : ""
        }>To Do</option><option value="Do Now" ${
          task.status === "Do Now" ? "selected" : ""
        }>Do Now</option><option value="On Hold" ${
          task.status === "On Hold" ? "selected" : ""
        }>On Hold</option><option value="Complete" ${
          task.status === "Complete" ? "selected" : ""
        }>Complete</option></select></div>`;
        li.querySelectorAll("select").forEach((select) =>
          select.addEventListener("change", (e) =>
            updateItemData(task.id, {
              [e.target.dataset.field]: e.target.value,
            })
          )
        );
        li.addEventListener("click", (e) => {
          if (!e.target.closest("select")) openDetailSideview(task.id);
        });
        projectTasksList.appendChild(li);
      });
    }
  }

  // --- Workspace Linking Functions ---

  async function handleLinkedWorkspaceToggle(targetWorkspaceId, isChecked) {
      if (!auth.currentUser) return;

      const uid = auth.currentUser.uid;
      const currentWs = workspaces.find(w => w.id === currentWorkspaceId);
      const targetWs = workspaces.find(w => w.id === targetWorkspaceId);

      if (!currentWs || !targetWs) {
          console.error("Workspace not found for linking.");
          return;
      }

      if (!currentWs.linkedWorkspaces) currentWs.linkedWorkspaces = {};
      if (!targetWs.linkedWorkspaces) targetWs.linkedWorkspaces = {};

      currentWs.linkedWorkspaces[targetWorkspaceId] = isChecked;
      targetWs.linkedWorkspaces[currentWorkspaceId] = isChecked;

      try {
          await Promise.all([
              saveWorkspaceToFirestore(uid, currentWs),
              saveWorkspaceToFirestore(uid, targetWs)
          ]);
          renderTasksTab();
      } catch (error) {
          console.error("Error updating linked workspaces:", error);
          alert("Failed to update workspace link.");
          currentWs.linkedWorkspaces[targetWorkspaceId] = !isChecked;
          targetWs.linkedWorkspaces[currentWorkspaceId] = !isChecked;
      }
  }

  function renderLinkedWorkspacesDropdown() {
      linkedWorkspacesList.innerHTML = ""; 

      const otherWorkspaces = workspaces.filter(w => w.id !== currentWorkspaceId);
      const currentWorkspace = workspaces.find(w => w.id === currentWorkspaceId);

      if (!currentWorkspace) return; 

      if (otherWorkspaces.length === 0) {
          linkedWorkspacesList.innerHTML = '<li><span class="dropdown-item-text px-3 text-muted">No other workspaces.</span></li>';
          return;
      }
      
      if (!currentWorkspace.linkedWorkspaces) currentWorkspace.linkedWorkspaces = {};

      otherWorkspaces.forEach(workspace => {
          const li = document.createElement("li");
          const isChecked = currentWorkspace.linkedWorkspaces[workspace.id] === true;

          li.innerHTML = `
              <div class="form-check dropdown-item">
                  <input class="form-check-input" type="checkbox" id="link-${workspace.id}" ${isChecked ? 'checked' : ''}>
                  <label class="form-check-label" for="link-${workspace.id}">
                      ${workspace.name}
                  </label>
              </div>
          `;

          li.addEventListener('click', (e) => e.stopPropagation());

          const checkbox = li.querySelector('input');
          checkbox.addEventListener('change', (e) => {
              handleLinkedWorkspaceToggle(workspace.id, e.target.checked);
          });

          linkedWorkspacesList.appendChild(li);
      });
  }


  // --- Event Listeners ---
  togglePasswordBtn.addEventListener("click", () => {
    const type =
      loginPasswordInput.getAttribute("type") === "password"
        ? "text"
        : "password";
    loginPasswordInput.setAttribute("type", type);
    togglePasswordBtn.querySelector("i").classList.toggle("bi-eye-slash");
    togglePasswordBtn.querySelector("i").classList.toggle("bi-eye");
  });
  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    loginUser(loginEmailInput.value, loginPasswordInput.value).catch(() => {});
  });
  registerBtn.addEventListener("click", () =>
    registerUser(loginEmailInput.value, loginPasswordInput.value).catch(
      () => {}
    )
  );
  logoutBtn.addEventListener("click", () => logoutUser());
  createWorkspaceBtn.addEventListener("click", handleCreateWorkspace);
  initDarkMode();
  detailTitleInput.addEventListener("change", (e) =>
    updateItemData(detailItemIdInput.value, { title: e.target.value })
  );
  detailStartDateInput.addEventListener("change", (e) =>
    updateItemData(detailItemIdInput.value, { startDate: e.target.value })
  );
  detailDueDateInput.addEventListener("change", (e) =>
    updateItemData(detailItemIdInput.value, { dueDate: e.target.value })
  );
  detailDescriptionInput.addEventListener("change", (e) =>
    updateItemData(detailItemIdInput.value, { description: e.target.value })
  );
  detailPrioritySelect.addEventListener("change", (e) => {
    updateItemData(detailItemIdInput.value, { priority: e.target.value });
    e.target.className = `form-select ${getPriorityClass(e.target.value)}`;
  });
  detailStatusSelect.addEventListener("change", (e) => {
    updateItemData(detailItemIdInput.value, { status: e.target.value });
    e.target.className = `form-select ${getStatusClass(e.target.value)}`;
  });
  detailTaskProjectSelect.addEventListener("change", (e) =>
    updateItemData(detailItemIdInput.value, {
      parentId: e.target.value || null,
    })
  );
  detailProjectWorkspaceSelect.addEventListener("change", (e) =>
    updateItemData(detailItemIdInput.value, { workspaceId: e.target.value })
  );
  hideCompletedProjectTasksSwitch.addEventListener("change", (e) => {
    hideCompletedProjectTasks = e.target.checked;
    if (detailItemTypeInput.value === "project")
      renderNestedProjectTasks(detailItemIdInput.value);
  });
  document
    .getElementById("deleteItemBtn")
    .addEventListener("click", async () => {
      const itemId = detailItemIdInput.value;
      const itemType = detailItemTypeInput.value;
      if (
        confirm(
          `Are you sure you want to delete this ${itemType}?${
            itemType === "project" ? " All its tasks will also be deleted." : ""
          }`
        )
      ) {
        await deleteItem(itemId, itemType);
        detailOffcanvas.hide();
        refreshAllTabs();
      }
    });
  document
    .getElementById("addNestedTaskBtn")
    .addEventListener("click", async () => {
      const projectId = detailItemIdInput.value;
      const project = items.find((i) => i.id === projectId);
      if (project) {
        await addItem({
          title: "New Task for " + project.title,
          parentId: projectId,
        });
        renderNestedProjectTasks(projectId);
        refreshAllTabs();
      }
    });
  document
    .getElementById("addProjectBtn")
    .addEventListener("click", async () => {
      const newProject = await addItem({
        title: "New Project",
        parentId: null,
      });
      if (newProject) {
        refreshAllTabs();
        openDetailSideview(newProject.id);
      }
    });
  document
    .querySelectorAll("#projectsSortDropdown .dropdown-item")
    .forEach((item) =>
      item.addEventListener("click", (e) => {
        e.preventDefault();
        currentProjectsSort = e.target.dataset.sort;
        document.getElementById(
          "projectsSortDropdown"
        ).textContent = `Sort by: ${e.target.textContent}`;
        renderProjectsTab();
      })
    );
  document
    .getElementById("hideCompletedProjectsSwitch")
    .addEventListener("change", (e) => {
      hideCompletedProjects = e.target.checked;
      renderProjectsTab();
    });
  document
    .getElementById("collapseAllProjectsBtn")
    .addEventListener("click", () =>
      document
        .querySelectorAll("#projectsTable .collapse.show")
        .forEach((el) => bootstrap.Collapse.getInstance(el)?.hide())
    );
  document
    .getElementById("expandAllProjectsBtn")
    .addEventListener("click", () =>
      document
        .querySelectorAll("#projectsTable .collapse:not(.show)")
        .forEach((el) => bootstrap.Collapse.getInstance(el)?.show())
    );
  document
    .getElementById("hideCompletedTasksSwitch")
    .addEventListener("change", (e) => {
      hideCompletedTasks = e.target.checked;
      renderTasksTab();
    });
  document
    .getElementById("collapseAllTasksBtn")
    .addEventListener("click", () =>
      document
        .querySelectorAll("#tasksTable .collapse.show")
        .forEach((el) => bootstrap.Collapse.getInstance(el)?.hide())
    );
  document
    .getElementById("expandAllTasksBtn")
    .addEventListener("click", () =>
      document
        .querySelectorAll("#tasksTable .collapse:not(.show)")
        .forEach((el) => bootstrap.Collapse.getInstance(el)?.show())
    );
  document.getElementById("prevMonthBtn").addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() - 1);
    renderCalendarTab();
  });
  document.getElementById("nextMonthBtn").addEventListener("click", () => {
    currentCalendarDate.setMonth(currentCalendarDate.getMonth() + 1);
    renderCalendarTab();
  });
  document.getElementById("todayBtn").addEventListener("click", () => {
    currentCalendarDate = new Date();
    renderCalendarTab();
  });
  monthSelect.addEventListener("change", (e) => {
    currentCalendarDate.setMonth(parseInt(e.target.value));
    renderCalendarTab();
  });
  yearSelect.addEventListener("change", (e) => {
    currentCalendarDate.setFullYear(parseInt(e.target.value));
    renderCalendarTab();
  });
  document
    .querySelectorAll("#calendarViewDropdown .dropdown-item")
    .forEach((item) =>
      item.addEventListener("click", (e) => {
        e.preventDefault();
        currentCalendarView = e.target.dataset.view;
        document.getElementById(
          "calendarViewDropdown"
        ).textContent = `View: ${e.target.textContent}`;
        renderCalendarTab();
      })
    );
  document
    .getElementById("hideCompletedCalendarSwitch")
    .addEventListener("change", (e) => {
      hideCompletedCalendar = e.target.checked;
      renderCalendarTab();
    });
  document
    .getElementById("globalSearchInput")
    .addEventListener("input", (e) => {
      globalSearchTerm = e.target.value.trim();
      refreshAllTabs();
    });
  document.getElementById("clearSearchBtn").addEventListener("click", () => {
    document.getElementById("globalSearchInput").value = "";
    globalSearchTerm = "";
    refreshAllTabs();
  });
  mainTabs.addEventListener("shown.bs.tab", () => refreshAllTabs());
  new bootstrap.Tooltip(document.body, {
    selector: "[data-bs-toggle='tooltip']",
  });
  initializeOffcanvas();
});