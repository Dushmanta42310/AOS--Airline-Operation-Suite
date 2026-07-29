document.addEventListener("DOMContentLoaded", async () => {
    const avatarImg = document.getElementById("profileAvatar");
    const profileName = document.getElementById("profileName");
    const mainContent = document.querySelector(".content");
    const navLinks = document.querySelector(".nav-links") || document.getElementById("navLinks");
    const logoutBtn = document.getElementById("logoutBtn");

    const originalContent = mainContent ? mainContent.innerHTML : "";
    let currentUser = null;
    let allUsers = [];

    const searchInput = document.querySelector(".search-bar input");
    if (searchInput) {
        searchInput.placeholder = "Search users by name or email...";
        searchInput.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase().trim();
            const cards = document.querySelectorAll(".user-glass-card");
            let visibleCount = 0;

            cards.forEach(card => {
                const name = (card.querySelector(".user-name-role h4")?.textContent || "").toLowerCase();
                const cardText = card.textContent.toLowerCase();

                if (name.includes(query) || cardText.includes(query)) {
                    card.style.display = "";
                    visibleCount++;
                } else {
                    card.style.display = "none";
                }
            });

            let emptyState = document.getElementById("usersEmptySearchState");
            if (visibleCount === 0) {
                if (!emptyState) {
                    emptyState = document.createElement("div");
                    emptyState.id = "usersEmptySearchState";
                    emptyState.className = "empty-search-state";
                    emptyState.innerHTML = `
                        <span>🔍</span>
                        <p>No user matches found for "${e.target.value}"</p>
                    `;
                    const grid = document.getElementById("usersGrid");
                    if (grid) grid.appendChild(emptyState);
                } else {
                    emptyState.style.display = "";
                    emptyState.querySelector("p").textContent = `No user matches found for "${e.target.value}"`;
                }
            } else {
                if (emptyState) {
                    emptyState.style.display = "none";
                }
            }
        });
    }

    function setDefaultAvatar(name) {
        const safeName = encodeURIComponent(name || "User");
        const url = `https://ui-avatars.com/api/?name=${safeName}&background=0D8ABC&color=fff`;
        if (avatarImg) avatarImg.src = url;
        const sidebarAvatar = document.getElementById("sidebarAvatar");
        if (sidebarAvatar) sidebarAvatar.src = url;
    }

    function setActiveMenu(clickedLi) {
        if (!navLinks) return;
        navLinks.querySelectorAll("li").forEach(li => li.classList.remove("active"));
        if (clickedLi) clickedLi.classList.add("active");
    }

    function renderCreateUserForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Create New User 👤</h1>
                <p>Register a new employee into the Airline Operation Suite.</p>
            </div>

            <div class="form-container macOS-card">
                <form id="createUserForm" class="mac-form" enctype="multipart/form-data">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Username (Email)</label>
                            <input type="name" name="username" placeholder="name" required>
                        </div>

                        <div class="input-group">
                            <label>Mobile Number</label>
                            <input type="number" name="mobileNo" placeholder="7008XXXXXX" required>
                        </div>

                        <div class="input-group">
                            <label>Password</label>
                            <input type="password" name="password" placeholder="••••••••" required>
                        </div>

                        <div class="input-group">
                            <label>MPIN</label>
                            <input type="number" name="mpin" placeholder="1234" required>
                        </div>

                        <div class="input-group">
                            <label>Status</label>
                            <select name="isActive">
                                <option value="Y">Active</option>
                                <option value="N">Inactive</option>
                            </select>
                        </div>

                        <div class="input-group full-width">
                            <label>Passport Image (Select File)</label>
                            <input type="file" name="passportImg" accept="image/*">
                        </div>
                    </div>

                    <div class="form-footer">
                        <button type="submit" class="submit-btn">Create User</button>
                    </div>
                </form>

                <div id="formMessage" class="form-message"></div>
            </div>
        `;

        const form = document.getElementById("createUserForm");
        const msgDiv = document.getElementById("formMessage");

        if (!form) return;

        form.onsubmit = async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            msgDiv.textContent = "Processing and uploading...";
            msgDiv.className = "form-message info";

            try {
                const res = await fetch("/api/admin/create-user", {
                    method: "POST",
                    body: formData,
                    credentials: "same-origin"
                });

                const result = await res.json();
                console.log("Create user response:", result);

                if (res.ok) {
                    msgDiv.textContent = "✅ " + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                } else {
                    msgDiv.textContent = "❌ " + (result.message || "Failed to create user");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Create user error:", err);
                msgDiv.textContent = "❌ Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderCreateRoleForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create & Manage Roles 🔑</h1>
            <p>Create new administrative roles or remove existing ones.</p>
        </div>

        <div class="form-container macOS-card">
            <!-- CREATE SECTION -->
            <form id="createRoleForm" class="mac-form">
                <div class="form-grid">
                    <div class="input-group">
                        <label>Role Name</label>
                        <input
                            type="text"
                            id="roleName"
                            placeholder="Enter Role Name"
                            required
                        >
                    </div>
                </div>

                <div class="form-footer" style="margin-top: 15px;">
                    <button type="submit" class="submit-btn">
                        Create Role
                    </button>
                </div>
            </form>
            <div id="createRoleMessage" class="form-message"></div>

            <hr class="sidebar-divider" style="margin: 25px 0; border: 0; height: 1px; background: var(--border-color);">

            <!-- DELETE SECTION -->
            <form id="deleteRoleForm" class="mac-form">
                <div class="form-grid">
                    <div class="input-group">
                        <label>Select Role to Delete</label>
                        <div class="select-wrapper">
                            <select id="deleteRoleSelect" required>
                                <option value="" disabled selected>Select a role...</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-footer" style="margin-top: 15px; justify-content: flex-start;">
                    <button type="submit" class="submit-btn" style="background-color: #FF3B30;">
                        Delete Selected Role
                    </button>
                </div>
            </form>
            <div id="deleteRoleMessage" class="form-message"></div>
        </div>
    `;

        const createForm = document.getElementById("createRoleForm");
        const deleteForm = document.getElementById("deleteRoleForm");
        const roleNameInput = document.getElementById("roleName");
        const roleSelect = document.getElementById("deleteRoleSelect");
        const createMsg = document.getElementById("createRoleMessage");
        const deleteMsg = document.getElementById("deleteRoleMessage");

        async function loadRoles() {
            try {
                const res = await fetch("/api/admin/manage-role", {
                    credentials: "same-origin"
                });
                if (!res.ok) throw new Error("Failed to fetch roles");
                const data = await res.json();

                // clear select
                roleSelect.innerHTML = `<option value="" disabled selected>Select a role...</option>`;
                data.roles.forEach(r => {
                    const opt = document.createElement("option");
                    opt.value = r.roleId;
                    opt.textContent = r.roleName;
                    roleSelect.appendChild(opt);
                });
            } catch (err) {
                console.error("Error loading roles:", err);
            }
        }

        // Load initially
        loadRoles();

        createForm.onsubmit = async (e) => {
            e.preventDefault();
            const roleName = roleNameInput.value.trim();
            if (!roleName) return;

            createMsg.textContent = "Processing...";
            createMsg.className = "form-message info";

            try {
                const res = await fetch("/api/admin/manage-role", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ roleName }),
                    credentials: "same-origin"
                });
                const result = await res.json();

                if (res.ok) {
                    createMsg.textContent = "✅ " + result.message;
                    createMsg.className = "form-message success";
                    roleNameInput.value = "";
                    // Refresh list
                    loadRoles();
                } else {
                    createMsg.textContent = "❌ " + (result.message || "Failed to create role");
                    createMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                createMsg.textContent = "❌ Error connecting to server.";
                createMsg.className = "form-message error";
            }
        };

        deleteForm.onsubmit = async (e) => {
            e.preventDefault();
            const roleId = roleSelect.value;
            if (!roleId) {
                alert("Please select a role to delete");
                return;
            }

            const selectedText = roleSelect.options[roleSelect.selectedIndex].text;
            if (!confirm(`Are you sure you want to delete the role "${selectedText}"?`)) {
                return;
            }

            deleteMsg.textContent = "Deleting...";
            deleteMsg.className = "form-message info";

            try {
                const res = await fetch(`/api/admin/manage-role?roleId=${roleId}`, {
                    method: "DELETE",
                    credentials: "same-origin"
                });
                const result = await res.json();

                if (res.ok) {
                    deleteMsg.textContent = "✅ " + result.message;
                    deleteMsg.className = "form-message success";
                    // Refresh list
                    loadRoles();
                } else {
                    deleteMsg.textContent = "❌ " + (result.message || "Failed to delete role");
                    deleteMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                deleteMsg.textContent = "❌ Error connecting to server.";
                deleteMsg.className = "form-message error";
            }
        };
    }

    function renderCreateMenuForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create & Manage Menus 📋</h1>
            <p>Create new dashboard menus or remove existing ones.</p>
        </div>

        <div class="form-container macOS-card">
            <!-- CREATE SECTION -->
            <form id="createMenuForm" class="mac-form">
                <div class="form-grid">
                    <div class="input-group">
                        <label>Menu Name</label>
                        <input
                            type="text"
                            id="menuName"
                            placeholder="Enter Menu Name"
                            required
                        >
                    </div>
                </div>

                <div class="form-footer" style="margin-top: 15px;">
                    <button type="submit" class="submit-btn">
                        Create Menu
                    </button>
                </div>
            </form>
            <div id="createMenuMessage" class="form-message"></div>

            <hr class="sidebar-divider" style="margin: 25px 0; border: 0; height: 1px; background: var(--border-color);">

            <!-- DELETE SECTION -->
            <form id="deleteMenuForm" class="mac-form">
                <div class="form-grid">
                    <div class="input-group">
                        <label>Select Menu to Delete</label>
                        <div class="select-wrapper">
                            <select id="deleteMenuSelect" required>
                                <option value="" disabled selected>Select a menu...</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div class="form-footer" style="margin-top: 15px; justify-content: flex-start;">
                    <button type="submit" class="submit-btn" style="background-color: #FF3B30;">
                        Delete Selected Menu
                    </button>
                </div>
            </form>
            <div id="deleteMenuMessage" class="form-message"></div>
        </div>
    `;

        const createForm = document.getElementById("createMenuForm");
        const deleteForm = document.getElementById("deleteMenuForm");
        const menuNameInput = document.getElementById("menuName");
        const menuSelect = document.getElementById("deleteMenuSelect");
        const createMsg = document.getElementById("createMenuMessage");
        const deleteMsg = document.getElementById("deleteMenuMessage");

        async function loadMenus() {
            try {
                const res = await fetch("/api/admin/manage-menu", {
                    credentials: "same-origin"
                });
                if (!res.ok) throw new Error("Failed to fetch menus");
                const data = await res.json();

                // clear select
                menuSelect.innerHTML = `<option value="" disabled selected>Select a menu...</option>`;
                data.menus.forEach(m => {
                    const opt = document.createElement("option");
                    opt.value = m.menuId;
                    opt.textContent = m.menuName;
                    menuSelect.appendChild(opt);
                });
            } catch (err) {
                console.error("Error loading menus:", err);
            }
        }

        // Load initially
        loadMenus();

        createForm.onsubmit = async (e) => {
            e.preventDefault();
            const menuName = menuNameInput.value.trim();
            if (!menuName) return;

            createMsg.textContent = "Processing...";
            createMsg.className = "form-message info";

            try {
                const res = await fetch("/api/admin/manage-menu", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ menuName }),
                    credentials: "same-origin"
                });
                const result = await res.json();

                if (res.ok) {
                    createMsg.textContent = "✅ " + result.message;
                    createMsg.className = "form-message success";
                    menuNameInput.value = "";
                    // Refresh list
                    loadMenus();
                } else {
                    createMsg.textContent = "❌ " + (result.message || "Failed to create menu");
                    createMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                createMsg.textContent = "❌ Error connecting to server.";
                createMsg.className = "form-message error";
            }
        };

        deleteForm.onsubmit = async (e) => {
            e.preventDefault();
            const menuId = menuSelect.value;
            if (!menuId) {
                alert("Please select a menu to delete");
                return;
            }

            const selectedText = menuSelect.options[menuSelect.selectedIndex].text;
            if (!confirm(`Are you sure you want to delete the menu "${selectedText}"?`)) {
                return;
            }

            deleteMsg.textContent = "Deleting...";
            deleteMsg.className = "form-message info";

            try {
                const res = await fetch(`/api/admin/manage-menu?menuId=${menuId}`, {
                    method: "DELETE",
                    credentials: "same-origin"
                });
                const result = await res.json();

                if (res.ok) {
                    deleteMsg.textContent = "✅ " + result.message;
                    deleteMsg.className = "form-message success";
                    // Refresh list
                    loadMenus();
                } else {
                    deleteMsg.textContent = "❌ " + (result.message || "Failed to delete menu");
                    deleteMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                deleteMsg.textContent = "❌ Error connecting to server.";
                deleteMsg.className = "form-message error";
            }
        };
    }


    function renderAssignRoleForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Role Management 🔐</h1>
                <p>Assign or update application roles for the active system users.</p>
            </div>

            <div class="form-container macOS-card">
                <form id="assignRoleForm" class="mac-form">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Select User</label>
                            <div class="select-wrapper">
                                <select id="assignUserSelect" name="userId" required>
                                    <option value="" disabled selected>Select a user...</option>
                                </select>
                            </div>
                        </div>

                        <div class="input-group">
                            <label>Assign Role</label>
                            <div class="select-wrapper">
                                <select id="assignRoleSelect" name="roleId" required>
                                    <option value="" disabled selected>Select a role...</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div id="roleDetailsBox" class="role-details-box hidden">
                        <p class="role-status-info">ℹ️ Current Status: <span id="currentUserStatus">No Role Assigned</span></p>
                    </div>

                    <div class="form-footer">
                        <button type="submit" id="assignRoleSubmitBtn" class="submit-btn">Assign Role</button>
                    </div>
                </form>

                <div id="assignRoleMessage" class="form-message"></div>
            </div>
        `;

        const userSelect = document.getElementById("assignUserSelect");
        const roleSelect = document.getElementById("assignRoleSelect");
        const roleDetailsBox = document.getElementById("roleDetailsBox");
        const currentUserStatus = document.getElementById("currentUserStatus");
        const form = document.getElementById("assignRoleForm");
        const msgDiv = document.getElementById("assignRoleMessage");
        const submitBtn = document.getElementById("assignRoleSubmitBtn");

        async function loadRoleScreenData() {
            try {
                const res = await fetch("/api/admin/assign-role-user", {
                    credentials: "same-origin"
                });
                if (!res.ok) throw new Error("Failed to load users and roles");

                const data = await res.json();

                data.users.forEach(u => {
                    const opt = document.createElement("option");
                    opt.value = u.userId;
                    opt.textContent = `${u.username} (${u.mobileNo || 'No Mobile'})`;
                    userSelect.appendChild(opt);
                });

                data.roles.forEach(r => {
                    const opt = document.createElement("option");
                    opt.value = r.roleId;
                    opt.textContent = r.roleName;
                    roleSelect.appendChild(opt);
                });
            } catch (err) {
                console.error(err);
                if (msgDiv) {
                    msgDiv.textContent = "❌ Error loading user/role data.";
                    msgDiv.className = "form-message error";
                }
            }
        }



        loadRoleScreenData();

        userSelect.addEventListener("change", async () => {
            const selectedUserId = userSelect.value;
            if (!selectedUserId) return;

            try {
                roleDetailsBox.classList.add("hidden");
                const res = await fetch(`/api/admin/user-role?userId=${selectedUserId}`, {
                    credentials: "same-origin"
                });
                if (res.ok) {
                    const data = await res.json();
                    roleDetailsBox.classList.remove("hidden");
                    if (data.roleId) {
                        roleSelect.value = data.roleId;
                        currentUserStatus.textContent = `Currently assigned to ${data.roleName}`;
                        submitBtn.textContent = "Update Role";
                    } else {
                        roleSelect.value = "";
                        currentUserStatus.textContent = "No Role Assigned";
                        submitBtn.textContent = "Assign Role";
                    }
                }
            } catch (err) {
                console.error("Error fetching user role details:", err);
            }
        });

        form.onsubmit = async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const roleId = roleSelect.value;

            if (!userId || !roleId) {
                msgDiv.textContent = "Please select both user and role.";
                msgDiv.className = "form-message error";
                return;
            }

            msgDiv.textContent = "Processing assignment...";
            msgDiv.className = "form-message info";

            try {
                const res = await fetch("/api/admin/assign-or-update-role", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ userId: parseInt(userId), roleId: parseInt(roleId) }),
                    credentials: "same-origin"
                });

                const result = await res.json();
                if (res.ok) {
                    msgDiv.textContent = "✅ " + result.message;
                    msgDiv.className = "form-message success";

                    const selectedRoleName = roleSelect.options[roleSelect.selectedIndex].text;
                    currentUserStatus.textContent = `Currently assigned to ${selectedRoleName}`;
                    submitBtn.textContent = "Update Role";
                } else {
                    msgDiv.textContent = "❌ " + (result.message || "Failed to update role");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Assign role error:", err);
                msgDiv.textContent = "❌ Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }


    async function renderHomeDashboard() {
        if (!mainContent) return;
        mainContent.innerHTML = originalContent;

        const welcomeBanner = document.querySelector(".welcome-banner h1");
        const welcomeText = document.querySelector(".welcome-banner p");

        if (!currentUser) return;

        let cleanName = currentUser.fullName || "User";
        cleanName = cleanName.replace(/@aos\.com$/i, "").trim();

        if (welcomeBanner) {
            welcomeBanner.innerHTML = `Welcome back, ${cleanName} 👋`;
        }

        if (welcomeText) {
            if ((currentUser.role || "").toUpperCase() === "ADMIN") {
                welcomeText.textContent = `Welcome back, ${cleanName}. You have full administrative access. The system is operating normally.`;
            } else {
                welcomeText.textContent = `Welcome back, ${cleanName}. Your airline operations are flying smoothly today.`;
            }
        }

        const statsGrid = mainContent.querySelector(".stats-grid");
        if (!statsGrid) return;

// Fetch active crew count and update UI
(async () => {
  try {
    const res = await fetch('/api/active-crew-count', { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to fetch active crew count');
    const data = await res.json();
    const count = data.activeCrewCount ?? data.p_active_cnt ?? 0;
    const countElem = document.getElementById('activeCrewCount');
    if (countElem) countElem.textContent = count;
  } catch (err) {
    console.error('Error fetching active crew count:', err);
  }
})();

        const directorySection = document.createElement("div");
        directorySection.className = "users-section";
        directorySection.innerHTML = `
            <h2><span>👥</span> AOS Team Directory</h2>
            <div class="users-grid" id="usersGrid">
                <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted);">
                    Loading user directory...
                </div>
            </div>
        `;
        mainContent.appendChild(directorySection);

        const usersGrid = document.getElementById("usersGrid");

        try {
            const res = await fetch("/api/users", {
                credentials: "same-origin"
            });
            if (!res.ok) throw new Error("Failed to load user list");
            allUsers = await res.json();

            if (!usersGrid) return;
            usersGrid.innerHTML = "";

            if (allUsers && allUsers.length > 0) {
                allUsers.forEach(u => {
                    const isSelf = String(u.userId) === String(currentUser.dbUserId);
                    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(u.fullName)}&background=${isSelf ? '007AFF' : '8E8E93'}&color=fff`;
                    const avatarSrc = u.photoUrl || defaultAvatar;

                    const card = document.createElement("div");
                    card.className = `user-glass-card${isSelf ? ' my-profile-card' : ''}`;
                    card.innerHTML = `
                        <div class="user-card-header">
                            <div class="user-avatar-container">
                                <img src="${avatarSrc}" alt="${u.fullName}" class="user-avatar-circle" onerror="this.src='${defaultAvatar}'">
                                <span class="status-badge-dot ${u.isActive === 'Y' ? 'active' : 'inactive'}"></span>
                            </div>
                            <div class="user-name-role">
                                <h4>${u.fullName}${isSelf ? ' (You)' : ''}</h4>
                                <span class="user-role-badge ${(u.role || 'USER').toLowerCase()}">${u.role || 'User'}</span>
                            </div>
                        </div>
                        <div class="user-card-details">
                            <div class="detail-field">
                                <span class="detail-label">User ID</span>
                                <span class="detail-value">${u.userId}</span>
                            </div>
                            <div class="detail-field">
                                <span class="detail-label">Email</span>
                                <span class="detail-value">${u.username}</span>
                            </div>
                            <div class="detail-field">
                                <span class="detail-label">Mobile</span>
                                <span class="detail-value">${u.mobileNo || 'N/A'}</span>
                            </div>
                            <div class="detail-field">
                                <span class="detail-label">Status</span>
                                <span class="detail-value" style="color: ${u.isActive === 'Y' ? '#34C759' : '#8E8E93'}; font-weight: 700;">
                                    ${u.isActive === 'Y' ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                        </div>
                    `;
                    usersGrid.appendChild(card);
                });
            } else {
                usersGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted);">
                        No other users found in the system.
                    </div>
                `;
            }

            if (searchInput && searchInput.value) {
                searchInput.dispatchEvent(new Event("input"));
            }

        } catch (err) {
            console.error("Error displaying users:", err);
            if (usersGrid) {
                usersGrid.innerHTML = `
                    <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: #FF3B30;">
                        ⚠️ Failed to load user directory.
                    </div>
                `;
            }
        }
    }


    function renderAssignMenuToRoleForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Role Menu Mapping 📋</h1>
            <p>Manage and assign menu permissions to specific roles.</p>
        </div>

        <div class="form-container macOS-card">
            <div class="mac-form">
                <div class="form-grid">
                    <div class="input-group">
                        <label>Select Role</label>
                        <div class="select-wrapper">
                            <select id="roleSelect" required>
                                <option value="" disabled selected>Choose a role...</option>
                            </select>
                        </div>
                    </div>

                    <div class="input-group">
                        <label>Add Menu to Role</label>
                        <div class="select-wrapper">
                            <select id="unmappedSelect" disabled required>
                                <option value="" disabled selected>Select a role first...</option>
                            </select>
                        </div>
                    </div>
                </div>

                <div id="mappedCardContainer" class="hidden" style="margin-top: 15px;">
                    <label style="font-size: 13px; font-weight: 500; color: var(--text-muted); display: block; margin-bottom: 8px;">Mapped Menus</label>
                    <div id="mappedMenusCard" class="transparent-card">
                        <!-- Mapped menus with remove buttons -->
                    </div>
                </div>

                <div id="msg" class="form-message"></div>
            </div>
        </div>
    `;

        const roleSelect = document.getElementById("roleSelect");
        const unmappedSelect = document.getElementById("unmappedSelect");
        const mappedCardContainer = document.getElementById("mappedCardContainer");
        const mappedMenusCard = document.getElementById("mappedMenusCard");
        const msg = document.getElementById("msg");

        let mappedData = [];
        let unmappedData = [];

        // LOAD ROLES
        async function loadRoles() {
            try {
                const res = await fetch("/api/admin/assign-menu-to-role");
                const data = await res.json();

                roleSelect.innerHTML = `<option value="" disabled selected>Choose a role...</option>` +
                    data.roles.map(r => `<option value="${r.roleId}">${r.roleName}</option>`).join("");
            } catch (err) {
                console.error("Error loading roles:", err);
                msg.textContent = "❌ Error loading roles.";
                msg.className = "form-message error";
                msg.style.display = "block";
            }
        }

        // LOAD TABLES
        async function loadMenus(roleId) {
            try {
                const res = await fetch(
                    `/api/admin/assign-menu-to-role?roleId=${roleId}`
                );
                const data = await res.json();

                mappedData = data.mapped || [];
                unmappedData = data.unmapped || [];

                renderLists();
            } catch (err) {
                console.error("Error loading menus:", err);
                msg.textContent = "❌ Error loading menu mapping.";
                msg.className = "form-message error";
                msg.style.display = "block";
            }
        }

        // RENDER LISTS
        function renderLists() {
            // Render mapped menus card list
            if (mappedData.length > 0) {
                mappedCardContainer.classList.remove("hidden");
                mappedMenusCard.innerHTML = mappedData.map(m => `
                <div class="mapped-menu-item" data-id="${m.menuId}">
                    <span class="mapped-menu-name">${m.menuName}</span>
                    <button class="mapped-menu-remove-btn" type="button">Remove</button>
                </div>
            `).join("");

                // Add event listeners to remove buttons
                mappedMenusCard.querySelectorAll(".mapped-menu-remove-btn").forEach(btn => {
                    btn.addEventListener("click", async (e) => {
                        const item = e.target.closest(".mapped-menu-item");
                        const menuId = item.getAttribute("data-id");
                        const roleId = roleSelect.value;
                        await handleRemoveMenu(roleId, menuId);
                    });
                });
            } else {
                mappedCardContainer.classList.remove("hidden");
                mappedMenusCard.innerHTML = `<p style="font-size: 13px; color: var(--text-muted); text-align: center; margin: 10px 0;">No menus mapped to this role yet.</p>`;
            }

            // Render unmapped dropdown select
            unmappedSelect.disabled = false;
            if (unmappedData.length > 0) {
                unmappedSelect.innerHTML = `<option value="" disabled selected>Choose a menu to add...</option>` +
                    unmappedData.map(m => `<option value="${m.menuId}">${m.menuName}</option>`).join("");
            } else {
                unmappedSelect.innerHTML = `<option value="" disabled selected>All menus are mapped</option>`;
            }
        }

        // LISTEN ROLE CHANGE
        roleSelect.addEventListener("change", () => {
            const roleId = roleSelect.value;
            if (roleId) {
                // Hide previous message on role change
                msg.style.display = "none";
                loadMenus(roleId);
            } else {
                unmappedSelect.disabled = true;
                unmappedSelect.innerHTML = `<option value="" disabled selected>Select a role first...</option>`;
                mappedCardContainer.classList.add("hidden");
                mappedMenusCard.innerHTML = "";
                msg.style.display = "none";
            }
        });

        // LISTEN UNMAPPED SELECT CHANGE
        unmappedSelect.addEventListener("change", async () => {
            const menuId = unmappedSelect.value;
            const roleId = roleSelect.value;
            if (!roleId || !menuId) return;

            const selectedOption = unmappedSelect.options[unmappedSelect.selectedIndex];
            const menuName = selectedOption.textContent;

            msg.style.display = "block";
            msg.className = "form-message info";
            msg.textContent = `Adding ${menuName}...`;

            try {
                const res = await fetch("/api/admin/assign-menu-to-role", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        roleId,
                        action: "assign",
                        menuIds: [menuId]
                    })
                });

                const result = await res.json();
                if (res.ok) {
                    msg.style.display = "block";
                    msg.className = "form-message success";
                    msg.textContent = `✅ Successfully added "${menuName}"`;
                    await loadMenus(roleId);
                } else {
                    msg.style.display = "block";
                    msg.className = "form-message error";
                    msg.textContent = "❌ " + (result.message || "Failed to add menu");
                }
            } catch (err) {
                console.error("Assign menu error:", err);
                msg.style.display = "block";
                msg.className = "form-message error";
                msg.textContent = "❌ Error connecting to server.";
            }
        });

        // REMOVE MENU ACTION
        async function handleRemoveMenu(roleId, menuId) {
            if (!roleId || !menuId) return;

            const menuItemName = mappedData.find(m => String(m.menuId) === String(menuId))?.menuName || "menu";

            msg.style.display = "block";
            msg.className = "form-message info";
            msg.textContent = `Removing ${menuItemName}...`;

            try {
                const res = await fetch("/api/admin/assign-menu-to-role", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        roleId,
                        action: "remove",
                        menuIds: [menuId]
                    })
                });

                const result = await res.json();
                if (res.ok) {
                    msg.style.display = "block";
                    msg.className = "form-message success";
                    msg.textContent = `✅ Successfully removed "${menuItemName}"`;
                    await loadMenus(roleId);
                } else {
                    msg.style.display = "block";
                    msg.className = "form-message error";
                    msg.textContent = "❌ " + (result.message || "Failed to remove menu");
                }
            } catch (err) {
                console.error("Remove menu error:", err);
                msg.style.display = "block";
                msg.className = "form-message error";
                msg.textContent = "❌ Error connecting to server.";
            }
        }
        loadRoles();
    }



    function renderManageUserRoleForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>ASSIGN ROLE TO USER 📋</h1>
            <p>Assign a role to an employee.</p>
        </div>

        <div class="form-container macOS-card">
            <form id="assignRoleForm" class="mac-form">
                <div class="form-grid">
                    <div class="input-group">
                        <label>Select User</label>
                        <select id="assignUserSelect" required>
                            <option value="">Select User</option>
                        </select>
                    </div>

                    <div class="input-group">
                        <label>Select Role</label>
                        <select id="assignRoleSelect" required>
                            <option value="">Select Role</option>
                        </select>
                    </div>
                </div>

                <div class="form-footer">
                    <button type="submit" class="submit-btn">Assign Role</button>
                </div>
            </form>
            <div id="ManageUserRoleForm" class="form-message"></div>
        </div>
    `;

        // 1. Corrected IDs to match the HTML above
        const userSelect = document.getElementById("assignUserSelect");
        const roleSelect = document.getElementById("assignRoleSelect");
        const msgDiv = document.getElementById("ManageUserRoleForm");
        const form = document.getElementById("assignRoleForm");

        async function loadData() {
            try {
                const res = await fetch("/api/admin/assign-role-user", {
                    method: "GET",
                    credentials: "same-origin"
                });
                const data = await res.json();

                // 2. Clear and populate using correct keys ('users' and 'roles' from your Flask backend)
                userSelect.innerHTML = `<option value="">Select User</option>`;
                data.users.forEach(user => {
                    userSelect.innerHTML += `<option value="${user.userId}">${user.userName}</option>`;
                });

                roleSelect.innerHTML = `<option value="">Select Role</option>`;
                data.roles.forEach(role => {
                    roleSelect.innerHTML += `<option value="${role.roleId}">${role.roleName}</option>`;
                });
            } catch (err) {
                console.error(err);
                msgDiv.textContent = "❌ Failed to load users and roles.";
                msgDiv.className = "form-message error";
            }
        }

        loadData();

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const roleId = roleSelect.value;

            if (!roleId || !userId) {
                msgDiv.textContent = "❌ Please select User and Role.";
                msgDiv.className = "form-message error";
                return;
            }

            try {
                const res = await fetch("/api/admin/assign-role-user", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "same-origin",
                    body: JSON.stringify({ userId: parseInt(userId), roleId: parseInt(roleId) })
                });

                const result = await res.json();
                if (res.ok) {
                    msgDiv.textContent = "✅ " + result.message;
                    msgDiv.className = "form-message success";
                } else {
                    msgDiv.textContent = "❌ " + result.message;
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                msgDiv.textContent = "❌ Server Error";
                msgDiv.className = "form-message error";
            }
        });
    }

    function renderCreateCityForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create City 🏙️</h1>
            <p>Add a new city to the airline operation route network or click on a location on the 3D Globe to load details.</p>
        </div>

        <div class="split-airport-container">
            <div class="form-column">
                <div class="form-container macOS-card">
                    <form id="createCityForm" class="mac-form">
                        <div class="form-grid">
                            <div class="input-group">
                                <label for="cityNameInput">City Name</label>
                                <input
                                    type="text"
                                    id="cityNameInput"
                                    placeholder="e.g. KHORDHA"
                                    required
                                >
                            </div>
                            <div class="input-group">
                                <label for="stateNameInput">State Name</label>
                                <input
                                    type="text"
                                    id="stateNameInput"
                                    placeholder="e.g. ODISHA"
                                    required
                                >
                            </div>
                            <div class="input-group">
                                <label for="countryNameInput">Country Name</label>
                                <input
                                    type="text"
                                    id="countryNameInput"
                                    placeholder="e.g. INDIA"
                                    required
                                >
                            </div>
                        </div>

                        <div class="form-footer" style="margin-top: 15px;">
                            <button type="submit" class="submit-btn">
                                Create City
                            </button>
                        </div>
                    </form>
                    <div id="createCityMessage" class="form-message"></div>
                </div>

                <div class="existing-airports-card macOS-card" style="margin-top: 20px;">
                    <h3 style="margin-bottom: 12px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                        <span>🏙️</span> Registered Cities
                    </h3>
                    <div class="airport-list-wrapper" id="existingCitiesList">
                        <!-- Rendered items -->
                    </div>
                </div>
            </div>

            <div class="globe-column">
                <div class="globe-card macOS-card">
                    <h3 style="margin-bottom: 12px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                        <span>🌐</span> Interactive Route Globe
                    </h3>
                    <div class="globe-iframe-wrapper">
                        <iframe id="globeIframe" src="/static/globe.html" style="width: 100%; height: 400px; border: none; border-radius: 8px; background: #020617;"></iframe>
                    </div>
                </div>
            </div>
        </div>
    `;

        const form = document.getElementById("createCityForm");
        const cityNameInput = document.getElementById("cityNameInput");
        const stateNameInput = document.getElementById("stateNameInput");
        const countryNameInput = document.getElementById("countryNameInput");
        const msgDiv = document.getElementById("createCityMessage");
        const citiesListContainer = document.getElementById("existingCitiesList");
        const globeIframe = document.getElementById("globeIframe");

        let currentAirports = [];
        let currentCities = [];

        function updateCitiesUI(cities) {
            currentCities = cities || [];
            if (cities && cities.length > 0) {
                citiesListContainer.innerHTML = cities.map(c => `
                    <div class="airport-list-item" data-name="${c.cityName}">
                        <div class="airport-item-info">
                            <span class="airport-item-name">${c.cityName}</span>
                            <span class="airport-item-details">${c.stateName} | ${c.countryName}</span>
                        </div>
                        <span class="airport-item-action">View ➔</span>
                    </div>
                `).join("");

                citiesListContainer.querySelectorAll(".airport-list-item").forEach(item => {
                    item.addEventListener("click", () => {
                        const name = item.getAttribute("data-name");
                        const city = currentCities.find(c => c.cityName === name);
                        if (city) {
                            cityNameInput.value = city.cityName;
                            stateNameInput.value = city.stateName;
                            countryNameInput.value = city.countryName;
                        }

                        if (globeIframe && globeIframe.contentWindow) {
                            globeIframe.contentWindow.postMessage({
                                type: "HIGHLIGHT_CITY",
                                cityName: name
                            }, "*");
                        }
                    });
                });
            } else {
                citiesListContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 13px;">No cities registered yet.</p>`;
            }
        }

        function sendAirportsToGlobe() {
            if (globeIframe && globeIframe.contentWindow) {
                globeIframe.contentWindow.postMessage({
                    type: "SET_DATA",
                    airports: currentAirports,
                    cities: currentCities
                }, "*");
            }
        }

        // Window message listener for communication from/to iframe
        const handleIframeMessage = (event) => {
            if (!event.data) return;
            
            if (event.data.type === "GLOBE_READY") {
                sendAirportsToGlobe();
            } else if (event.data.type === "AIRPORT_SELECTED") {
                const airport = event.data.airport;
                if (airport) {
                    cityNameInput.value = airport.cityName || "";
                    stateNameInput.value = airport.stateName || airport.cityName || ""; // Read stateName correctly
                    countryNameInput.value = airport.countryName || "";
                }
            }
        };

        window.removeEventListener("message", handleIframeMessage);
        window.addEventListener("message", handleIframeMessage);

        async function loadCitiesAndAirports() {
            try {
                // Fetch cities from the city proc and airports from the airport proc in parallel
                const [cityRes, airportRes] = await Promise.all([
                    fetch("/api/admin/create-city", { credentials: "same-origin" }),
                    fetch("/api/admin/create-airport", { credentials: "same-origin" })
                ]);
                if (!cityRes.ok || !airportRes.ok) throw new Error("Failed to fetch data");
                const cityData = await cityRes.json();
                const airportData = await airportRes.json();

                currentCities = cityData.cities || [];
                currentAirports = airportData.airports || [];

                updateCitiesUI(currentCities);
                sendAirportsToGlobe();
            } catch (err) {
                console.error("Error loading cities:", err);
                citiesListContainer.innerHTML = `<p style="text-align: center; color: #FF3B30; padding: 15px;">Failed to load cities.</p>`;
            }
        }

        loadCitiesAndAirports();

        form.onsubmit = async (e) => {
            e.preventDefault();
            const cityName = cityNameInput.value.trim();
            const stateName = stateNameInput.value.trim();
            const countryName = countryNameInput.value.trim();

            if (!cityName || !stateName || !countryName) return;

            msgDiv.textContent = "Creating city...";
            msgDiv.className = "form-message info";
            msgDiv.style.display = "block";

            try {
                const res = await fetch("/api/admin/create-city", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ cityName, stateName, countryName }),
                    credentials: "same-origin"
                });
                const result = await res.json();

                if (res.ok) {
                    msgDiv.textContent = "✅ " + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                    await loadCitiesAndAirports();
                } else {
                    msgDiv.textContent = "❌ " + (result.message || "Failed to create city");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                msgDiv.textContent = "❌ Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderCreateAirportForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create Airport ✈️</h1>
            <p>Add a new airport to the route network or click on an existing one on the 3D Globe to load its details.</p>
        </div>

        <div class="split-airport-container">
            <div class="form-column">
                <div class="form-container macOS-card">
                    <form id="createAirportForm" class="mac-form">
                        <div class="form-grid">
                            <div class="input-group">
                                <label for="airportNameInput">Airport Name</label>
                                <input
                                    type="text"
                                    id="airportNameInput"
                                    placeholder="e.g. BIJU PATNAIK INTERNATIONAL AIRPORT"
                                    required
                                >
                            </div>
                            <div class="input-group">
                                <label for="airportCodeInput">Airport Code</label>
                                <input
                                    type="text"
                                    id="airportCodeInput"
                                    placeholder="e.g. BBI"
                                    required
                                >
                            </div>
                            <div class="input-group">
                                <label for="airportCitySelect">Select City</label>
                                <div class="select-wrapper">
                                    <select id="airportCitySelect" required>
                                        <option value="" disabled selected>Select a city...</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        <div class="form-footer" style="margin-top: 15px;">
                            <button type="submit" class="submit-btn">
                                Create Airport
                            </button>
                        </div>
                    </form>
                    <div id="createAirportMessage" class="form-message"></div>
                </div>

                <div class="existing-airports-card macOS-card" style="margin-top: 20px;">
                    <h3 style="margin-bottom: 12px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                        <span>📋</span> Registered Airports
                    </h3>
                    <div class="airport-list-wrapper" id="existingAirportsList">
                        <!-- Rendered items -->
                    </div>
                </div>
            </div>

            <div class="globe-column">
                <div class="globe-card macOS-card">
                    <h3 style="margin-bottom: 12px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                        <span>🌐</span> Interactive Route Globe
                    </h3>
                    <div class="globe-iframe-wrapper">
                        <iframe id="globeIframe" src="/static/globe.html" style="width: 100%; height: 400px; border: none; border-radius: 8px; background: #020617;"></iframe>
                    </div>
                </div>
            </div>
        </div>
    `;

        const form = document.getElementById("createAirportForm");
        const airportNameInput = document.getElementById("airportNameInput");
        const airportCodeInput = document.getElementById("airportCodeInput");
        const citySelect = document.getElementById("airportCitySelect");
        const msgDiv = document.getElementById("createAirportMessage");
        const airportsListContainer = document.getElementById("existingAirportsList");
        const globeIframe = document.getElementById("globeIframe");

        let currentAirports = [];
        let currentCities = [];

        function updateAirportsUI(airports) {
            currentAirports = airports || [];
            if (airports && airports.length > 0) {
                airportsListContainer.innerHTML = airports.map(a => `
                    <div class="airport-list-item" data-code="${a.airportCode}">
                        <div class="airport-item-info">
                            <span class="airport-item-name">${a.airportName}</span>
                            <span class="airport-item-details">${a.airportCode} | ${a.cityName}, ${a.countryName}</span>
                        </div>
                        <span class="airport-item-action">View ➔</span>
                    </div>
                `).join("");

                airportsListContainer.querySelectorAll(".airport-list-item").forEach(item => {
                    item.addEventListener("click", () => {
                        const code = item.getAttribute("data-code");
                        const airport = currentAirports.find(a => a.airportCode === code);
                        if (airport) {
                            airportNameInput.value = airport.airportName;
                            airportCodeInput.value = airport.airportCode;
                            citySelect.value = airport.cityId;
                        }

                        if (globeIframe && globeIframe.contentWindow) {
                            globeIframe.contentWindow.postMessage({
                                type: "HIGHLIGHT_AIRPORT",
                                code: code
                            }, "*");
                        }
                    });
                });
            } else {
                airportsListContainer.innerHTML = `<p style="text-align: center; color: var(--text-muted); padding: 15px; font-size: 13px;">No airports registered yet.</p>`;
            }
        }

        function sendAirportsToGlobe() {
            if (globeIframe && globeIframe.contentWindow) {
                globeIframe.contentWindow.postMessage({
                    type: "SET_DATA",
                    airports: currentAirports,
                    cities: currentCities
                }, "*");
            }
        }

        // Window message listener for communication from/to iframe
        const handleIframeMessage = (event) => {
            if (!event.data) return;
            
            if (event.data.type === "GLOBE_READY") {
                sendAirportsToGlobe();
            } else if (event.data.type === "AIRPORT_SELECTED") {
                const airport = event.data.airport;
                if (airport) {
                    airportNameInput.value = airport.airportName || "";
                    airportCodeInput.value = airport.airportCode || "";
                    
                    // Reset any previous info messages
                    msgDiv.style.display = "none";
                    msgDiv.textContent = "";

                    if (airport.cityId) {
                        citySelect.value = airport.cityId;
                    } else if (airport.cityName) {
                        const searchCity = airport.cityName.toUpperCase().trim();
                        // Find matching city in current dropdown list
                        const matchedCity = currentCities.find(c => 
                            c.cityName.toUpperCase().trim() === searchCity
                        );

                        if (matchedCity) {
                            citySelect.value = matchedCity.cityId;
                        } else {
                            // Automatically add a temporary city option so the user doesn't have to register it manually first
                            let opt = Array.from(citySelect.options).find(o => o.text.toUpperCase() === searchCity);
                            if (!opt) {
                                opt = document.createElement("option");
                                opt.value = `NEW_CITY:${searchCity}:${(airport.countryName || "INDIA").toUpperCase()}`;
                                opt.textContent = `${searchCity} (Auto-Added)`;
                                citySelect.appendChild(opt);
                            }
                            citySelect.value = opt.value;
                            msgDiv.textContent = `ℹ️ City "${airport.cityName}" is not registered in the database yet. It will be automatically registered when you click "Create Airport".`;
                            msgDiv.className = "form-message info";
                            msgDiv.style.display = "block";
                        }
                    }
                }
            }
        };

        window.removeEventListener("message", handleIframeMessage);
        window.addEventListener("message", handleIframeMessage);

        async function loadCitiesAndAirports() {
            try {
                const res = await fetch("/api/admin/create-airport", {
                    credentials: "same-origin"
                });
                if (!res.ok) throw new Error("Failed to fetch cities");
                const data = await res.json();

                currentCities = data.cities || [];

                citySelect.innerHTML = `<option value="" disabled selected>Select a city...</option>`;
                if (data.cities && data.cities.length > 0) {
                    data.cities.forEach(c => {
                        const opt = document.createElement("option");
                        opt.value = c.cityId;
                        opt.textContent = c.cityName;
                        citySelect.appendChild(opt);
                    });
                } else {
                    citySelect.innerHTML = `<option value="" disabled>No cities found</option>`;
                }

                updateAirportsUI(data.airports);
                sendAirportsToGlobe();
            } catch (err) {
                console.error("Error loading cities:", err);
                msgDiv.textContent = "❌ Failed to load screen data.";
                msgDiv.className = "form-message error";
            }
        }

        loadCitiesAndAirports();

        form.onsubmit = async (e) => {
            e.preventDefault();
            const airportName = airportNameInput.value.trim();
            const airportCode = airportCodeInput.value.trim();
            let cityId = citySelect.value;

            if (!airportName || !airportCode || !cityId) return;

            msgDiv.textContent = "Processing...";
            msgDiv.className = "form-message info";
            msgDiv.style.display = "block";

            try {
                // If it is a new/unregistered city, automatically register it first
                if (typeof cityId === "string" && cityId.startsWith("NEW_CITY:")) {
                    const parts = cityId.split(":");
                    const newCityName = parts[1];
                    const newCountryName = parts[2] || "INDIA";

                    msgDiv.textContent = `Registering city "${newCityName}" in database...`;

                    const cityRes = await fetch("/api/admin/create-city", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            cityName: newCityName,
                            stateName: newCityName,
                            countryName: newCountryName
                        }),
                        credentials: "same-origin"
                    });

                    if (!cityRes.ok) {
                        const errData = await cityRes.json();
                        throw new Error(errData.message || "Failed to auto-register city");
                    }

                    // Reload cities list to retrieve the real database cityId
                    const loadRes = await fetch("/api/admin/create-airport", { credentials: "same-origin" });
                    if (!loadRes.ok) throw new Error("Failed to reload cities list from database");
                    const loadData = await loadRes.json();
                    
                    currentCities = loadData.cities || [];
                    const newlyCreatedCity = currentCities.find(c => 
                        c.cityName.toUpperCase().trim() === newCityName.toUpperCase().trim()
                    );
                    
                    if (!newlyCreatedCity) {
                        throw new Error("City registered but failed to fetch ID from database");
                    }
                    cityId = newlyCreatedCity.cityId;
                }

                msgDiv.textContent = "Creating airport...";

                const res = await fetch("/api/admin/create-airport", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ airportName, airportCode, cityId }),
                    credentials: "same-origin"
                });
                const result = await res.json();

                if (res.ok) {
                    msgDiv.textContent = "✅ " + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                    await loadCitiesAndAirports();
                } else {
                    msgDiv.textContent = "❌ " + (result.message || "Failed to create airport");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                msgDiv.textContent = "❌ Error: " + err.message;
                msgDiv.className = "form-message error";
            }
        };
    }


    function renderCreateFlightCompanyForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create Flight Company ✈️</h1>
            <p>Add a new flight company to the airline operation database and view existing active ones.</p>
        </div>

        <div class="form-container macOS-card">
            <form id="createFlightCompanyForm" class="mac-form">
                <div class="form-grid">
                    <div class="input-group">
                        <label for="companyNameInput">Company Name</label>
                        <input
                            type="text"
                            id="companyNameInput"
                            placeholder="e.g. INDIGO"
                            required
                        >
                    </div>
                    <div class="input-group">
                        <label for="companyCodeInput">Company Code</label>
                        <input
                            type="text"
                            id="companyCodeInput"
                            placeholder="e.g. 6E"
                            required
                        >
                    </div>
                </div>

                <div class="form-footer" style="margin-top: 15px;">
                    <button type="submit" class="submit-btn">
                        Create Flight Company
                    </button>
                </div>
            </form>
            <div id="createFlightCompanyMessage" class="form-message"></div>

            <hr class="sidebar-divider" style="margin: 25px 0; border: 0; height: 1px; background: var(--border-color);">

            <!-- EXISTING FLIGHT COMPANIES SECTION -->
            <div class="existing-cities-container">
                <h3 style="margin-bottom: 15px; font-weight: 600; font-size: 16px;">Active Flight Companies</h3>
                <div class="table-responsive">
                    <table class="data-table">
                        <thead>
                            <tr>
                                <th>Company ID</th>
                                <th>Company Name</th>
                                <th>Company Code</th>
                            </tr>
                        </thead>
                        <tbody id="companiesTableBody">
                            <tr>
                                <td colspan="3" style="text-align: center; padding: 20px; color: var(--text-muted);">Loading companies...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;

        const form = document.getElementById("createFlightCompanyForm");
        const companyNameInput = document.getElementById("companyNameInput");
        const companyCodeInput = document.getElementById("companyCodeInput");
        const msgDiv = document.getElementById("createFlightCompanyMessage");
        const tableBody = document.getElementById("companiesTableBody");

        async function loadCompanies() {
            try {
                const res = await fetch("/api/admin/create-flight-company", {
                    credentials: "same-origin"
                });
                if (!res.ok) throw new Error("Failed to fetch flight companies");
                const data = await res.json();

                if (data.companies && data.companies.length > 0) {
                    tableBody.innerHTML = data.companies.map(c => `
                    <tr>
                        <td style="font-weight: 500; color: var(--text-muted);">${c.companyId}</td>
                        <td style="font-weight: 600;">${c.companyName}</td>
                        <td style="font-weight: 500; color: var(--text-muted);">${c.companyCode || ''}</td>
                    </tr>
                `).join("");
                } else {
                    tableBody.innerHTML = `
                    <tr>
                        <td colspan="3" style="text-align: center; padding: 20px; color: var(--text-muted);">No flight companies found.</td>
                    </tr>
                `;
                }
            } catch (err) {
                console.error("Error loading flight companies:", err);
                tableBody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align: center; padding: 20px; color: #FF3B30;">Failed to load flight companies.</td>
                </tr>
            `;
            }
        }

        loadCompanies();

        form.onsubmit = async (e) => {
            e.preventDefault();
            const companyName = companyNameInput.value.trim();
            const companyCode = companyCodeInput.value.trim();

            if (!companyName || !companyCode) return;

            msgDiv.textContent = "Creating flight company...";
            msgDiv.className = "form-message info";

            try {
                const res = await fetch("/api/admin/create-flight-company", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ companyName, companyCode }),
                    credentials: "same-origin"
                });
                const result = await res.json();

                if (res.ok) {
                    msgDiv.textContent = "✅ " + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                    loadCompanies();
                } else {
                    msgDiv.textContent = "❌ " + (result.message || "Failed to create flight company");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                msgDiv.textContent = "❌ Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderCreateFlightForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Create New Flight ✈️</h1>
                <p>Register a new flight using stored procedure <code>airline_flight_create_usp</code>.</p>
            </div>

            <div class="form-container macOS-card">
                <form id="createFlightForm" class="mac-form">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Flight Number</label>
                            <input type="text" id="flightNoInput" name="flightNo" placeholder="e.g. AI-101" required>
                        </div>

                        <div class="input-group">
                            <label>Flight Company</label>
                            <select id="companySelect" name="companyId" required>
                                <option value="" disabled selected>Loading companies...</option>
                            </select>
                        </div>

                        <div class="input-group full-width">
                            <label>Flight Name / Aircraft</label>
                            <input type="text" id="flightNameInput" name="flightName" placeholder="e.g. Airbus A320 Neo">
                        </div>
                    </div>

                    <div class="form-footer">
                        <button type="submit" class="submit-btn">Create Flight</button>
                    </div>
                </form>

                <div id="flightFormMessage" class="form-message"></div>
            </div>

            <div class="existing-cities-container macOS-card" style="margin-top: 24px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h3 style="font-weight: 600; font-size: 16px; margin: 0;">Registered Flights Table ✈️</h3>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;">Overview of all airline flights stored in database</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="text" id="flightSearchInput" placeholder="🔍 Search flight, company..." style="padding: 8px 14px; border-radius: 8px; border: 1px solid var(--border-color); font-size: 13px; outline: none; background: rgba(255,255,255,0.6); min-width: 200px;">
                        <span id="flightCountBadge" class="badge blue" style="font-size: 12px;">0 Flights</span>
                    </div>
                </div>

                <div class="table-responsive" style="overflow-x: auto;">
                    <table class="data-table mac-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(0, 122, 255, 0.05); text-align: left;">
                                <th style="padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Flight ID</th>
                                <th style="padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Flight No</th>
                                <th style="padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Company Name</th>
                                <th style="padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Aircraft / Flight Name</th>
                                <th style="padding: 12px 16px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                            </tr>
                        </thead>
                        <tbody id="flightsTableBody">
                            <tr>
                                <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading flights data...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const form = document.getElementById("createFlightForm");
        const flightNoInput = document.getElementById("flightNoInput");
        const companySelect = document.getElementById("companySelect");
        const flightNameInput = document.getElementById("flightNameInput");
        const msgDiv = document.getElementById("flightFormMessage");
        const tableBody = document.getElementById("flightsTableBody");
        const flightSearchInput = document.getElementById("flightSearchInput");
        const flightCountBadge = document.getElementById("flightCountBadge");

        let allRegisteredFlights = [];

        function renderFlightRows(flightsList) {
            flightCountBadge.textContent = `${flightsList.length} Flight${flightsList.length === 1 ? '' : 's'}`;

            if (flightsList && flightsList.length > 0) {
                tableBody.innerHTML = flightsList.map(f => `
                    <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <td style="padding: 12px 16px;"><strong>#${f.flightId}</strong></td>
                        <td style="padding: 12px 16px;"><span class="badge blue" style="font-weight: 600;">${f.flightNo}</span></td>
                        <td style="padding: 12px 16px; font-weight: 500;">${f.companyName}</td>
                        <td style="padding: 12px 16px; color: var(--text-muted);">${f.flightName || '—'}</td>
                        <td style="padding: 12px 16px;"><span class="badge green">${f.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}</span></td>
                    </tr>
                `).join("");
            } else {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 24px; color: var(--text-muted);">No matching flights found.</td>
                    </tr>
                `;
            }
        }

        if (flightSearchInput) {
            flightSearchInput.addEventListener("input", (e) => {
                const query = e.target.value.toLowerCase().trim();
                const filtered = allRegisteredFlights.filter(f =>
                    String(f.flightId).includes(query) ||
                    (f.flightNo || '').toLowerCase().includes(query) ||
                    (f.companyName || '').toLowerCase().includes(query) ||
                    (f.flightName || '').toLowerCase().includes(query)
                );
                renderFlightRows(filtered);
            });
        }

        async function loadFlightData() {
            try {
                const res = await fetch("/api/admin/create-flight", {
                    method: "GET",
                    credentials: "same-origin"
                });
                const data = await res.json();

                if (res.ok) {
                    if (data.companies && data.companies.length > 0) {
                        companySelect.innerHTML = '<option value="" disabled selected>Select Flight Company</option>' +
                            data.companies.map(c => `<option value="${c.companyId}">${c.companyName} (${c.companyCode || c.companyId})</option>`).join("");
                    } else {
                        companySelect.innerHTML = '<option value="" disabled>No companies found</option>';
                    }

                    allRegisteredFlights = data.flights || [];
                    renderFlightRows(allRegisteredFlights);
                }
            } catch (err) {
                console.error("Error loading flight data:", err);
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="5" style="text-align: center; padding: 24px; color: #FF3B30;">Failed to load flights data.</td>
                    </tr>
                `;
            }
        }

        loadFlightData();

        form.onsubmit = async (e) => {
            e.preventDefault();
            const flightNo = flightNoInput.value.trim();
            const companyId = companySelect.value;
            const flightName = flightNameInput.value.trim();

            if (!flightNo || !companyId) {
                msgDiv.textContent = "❌ Flight Number and Company are required.";
                msgDiv.className = "form-message error";
                return;
            }

            msgDiv.textContent = "Calling stored procedure airline_flight_create_usp...";
            msgDiv.className = "form-message info";

            try {
                const res = await fetch("/api/admin/create-flight", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        flightId: 0,
                        flightNo: flightNo,
                        companyId: parseInt(companyId),
                        flightName: flightName
                    }),
                    credentials: "same-origin"
                });

                const result = await res.json();

                if (res.ok) {
                    msgDiv.textContent = "✅ " + (result.message || "Data Inserted Sucessfully");
                    msgDiv.className = "form-message success";
                    flightNoInput.value = "";
                    flightNameInput.value = "";
                    loadFlightData();
                    loadDashboardStats();
                } else {
                    msgDiv.textContent = "⚠️ " + (result.message || "Creation failed");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Create flight error:", err);
                msgDiv.textContent = "❌ Network error. Please try again.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderPassengerRegistrationForm() {
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Register Customer / Passenger 🎫</h1>
                <p>Register a new customer into the Airline Operation Suite database.</p>
            </div>

            <div class="form-container macOS-card">
                <form id="registerPassengerForm" class="mac-form">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Passenger Name</label>
                            <input type="text" name="passengerName" placeholder="Enter Full Name" required>
                        </div>

                        <div class="input-group">
                            <label>Gender</label>
                            <select name="gender" required>
                                <option value="" disabled selected>Select Gender</option>
                                <option value="MALE">MALE</option>
                                <option value="FEMALE">FEMALE</option>
                                <option value="OTHER">OTHER</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label>Date of Birth</label>
                            <input type="date" name="dob" required>
                        </div>

                        <div class="input-group">
                            <label>Mobile Number</label>
                            <input type="number" name="mobileNo" placeholder="10 digit mobile number" required>
                        </div>

                        <div class="input-group">
                            <label>Email Address</label>
                            <input type="email" name="emailId" placeholder="customer@example.com" required>
                        </div>

                        <div class="input-group">
                            <label>Passport Number</label>
                            <input type="text" name="passportNo" placeholder="Enter Passport Number" required>
                        </div>
                    </div>

                    <div class="form-footer">
                        <button type="submit" class="submit-btn">Register Customer</button>
                    </div>
                </form>

                <div id="passengerRegMessage" class="form-message"></div>
            </div>
        `;

        const form = document.getElementById("registerPassengerForm");
        const msgDiv = document.getElementById("passengerRegMessage");

        if (!form) return;

        form.onsubmit = async (e) => {
            e.preventDefault();

            const formData = new FormData(form);
            const payload = {
                passengerName: formData.get("passengerName"),
                gender: formData.get("gender"),
                dob: formData.get("dob"),
                mobileNo: formData.get("mobileNo"),
                emailId: formData.get("emailId"),
                passportNo: formData.get("passportNo")
            };

            msgDiv.textContent = "Registering customer...";
            msgDiv.className = "form-message info";

            try {
                const res = await fetch("/api/passenger/register", {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify(payload),
                    credentials: "same-origin"
                });

                const result = await res.json();

                if (res.ok) {
                    msgDiv.textContent = "✅ " + (result.message || "Customer Registered Successfully!");
                    msgDiv.className = "form-message success";
                    form.reset();
                } else {
                    msgDiv.textContent = "❌ " + (result.message || "Registration failed");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Passenger registration error:", err);
                msgDiv.textContent = "❌ Network error. Please try again.";
                msgDiv.className = "form-message error";
            }
        };
    }

    async function loadUserCards() {
        const grid = document.getElementById("usersGrid");
        if (!grid) return;

        try {
            const res = await fetch("/api/users", { credentials: "same-origin" });
            if (!res.ok) {
                grid.innerHTML = `<div class="empty-search-state"><span>⚠️</span><p>Unable to load system users (HTTP ${res.status}).</p></div>`;
                return;
            }
            const data = await res.json();
            const users = data.users || data;

            if (Array.isArray(users) && users.length > 0) {
                allUsers = users;
                grid.innerHTML = users.map(u => {
                    const dbUserId = u.userId || u.USER_ID || u[0];
                    const username = u.username || u.userName || u.USERNAME || u[1] || '';
                    const mobile = u.mobileNo || u.MOBILENO || u[2] || 'N/A';
                    const passportImg = u.passportImg || u.PASSPORT_IMG || u[3];
                    const photoUrl = u.photoUrl;
                    const isActive = (u.isActive || u.IS_ACTIVE || u[4] || 'Y') === 'Y';
                    const roleName = (u.role || u.roleName || u.ROLE_NAME || u[5] || 'USER').toUpperCase();

                    let cleanName = u.fullName;
                    if (!cleanName || cleanName === 'User') {
                        if (username) {
                            cleanName = username.split('@')[0].replace(/[\._]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        } else {
                            cleanName = 'User ' + String(dbUserId).slice(-4);
                        }
                    }

                    const avatarSrc = photoUrl ? photoUrl : (passportImg ? `/api/passport-photo?id=${dbUserId}` : `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=0D8ABC&color=fff`);

                    let roleClass = 'user';
                    if (roleName.includes('ADMIN')) roleClass = 'admin';
                    else if (roleName.includes('OPERATOR')) roleClass = 'operator';

                    return `
                        <div class="user-glass-card ${currentUser && (currentUser.dbUserId == dbUserId || currentUser.userId == dbUserId) ? 'my-profile-card' : ''}">
                            <div class="user-card-header">
                                <div class="user-avatar-container">
                                    <img src="${avatarSrc}" 
                                         alt="${cleanName}" 
                                         class="user-avatar-circle"
                                         onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=0D8ABC&color=fff'">
                                    <span class="status-badge-dot ${isActive ? 'active' : 'inactive'}" title="${isActive ? 'Active User' : 'Inactive User'}"></span>
                                </div>
                                <div class="user-name-role">
                                    <h4>${cleanName}</h4>
                                    <span class="user-role-badge ${roleClass}">${roleName}</span>
                                </div>
                            </div>
                            <div class="user-card-details">
                                <div class="detail-field">
                                    <span class="detail-label">User ID</span>
                                    <span class="detail-value">#${dbUserId}</span>
                                </div>
                                <div class="detail-field">
                                    <span class="detail-label">Username / Email</span>
                                    <span class="detail-value" title="${username || cleanName}">${username || cleanName}</span>
                                </div>
                                <div class="detail-field">
                                    <span class="detail-label">Mobile Number</span>
                                    <span class="detail-value">${mobile}</span>
                                </div>
                                <div class="detail-field">
                                    <span class="detail-label">Account Status</span>
                                    <span class="detail-value">${isActive ? 'Active' : 'Inactive'}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join("");
            } else {
                grid.innerHTML = `<div class="empty-search-state"><span>👥</span><p>No registered system users found.</p></div>`;
            }
        } catch (err) {
            console.error("Failed to load user cards:", err);
            grid.innerHTML = `<div class="empty-search-state"><span>⚠️</span><p>Error connecting to server to load users.</p></div>`;
        }
    }

    async function loadDashboardStats() {
        try {
            const res = await fetch("/api/dashboard-stats", { credentials: "same-origin" });
            if (res.ok) {
                const data = await res.json();
                const activeFlightsCountEl = document.getElementById("activeFlightsCount");
                const activeCrewCountEl = document.getElementById("activeCrewCount");

                if (activeFlightsCountEl && data.activeFlights !== undefined) {
                    activeFlightsCountEl.textContent = data.activeFlights;
                }
                if (activeCrewCountEl && data.activeCrew !== undefined) {
                    activeCrewCountEl.textContent = data.activeCrew;
                }
            }
        } catch (err) {
            console.error("Error loading dashboard stats:", err);
        }
    }

    function renderHomeDashboard() {
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <div class="banner-text">
                    <h1>Welcome back to AOS 👋</h1>
                    <p>Your airline operations are flying smoothly today.</p>
                </div>
            </div>

            <div class="stats-grid">
                <div class="stat-card">
                    <div class="icon-circle blue">✈️</div>
                    <div class="stat-info">
                        <h3>Active Flights</h3>
                        <h2 id="activeFlightsCount">0</h2>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="icon-circle green">✅</div>
                    <div class="stat-info">
                        <h3>On-Time Performance</h3>
                        <h2>98.5%</h2>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="icon-circle orange">👥</div>
                    <div class="stat-info">
                        <h3>Active Crew</h3>
                        <h2 id="activeCrewCount">0</h2>
                    </div>
                </div>

                <div class="stat-card">
                    <div class="icon-circle red">⚠️</div>
                    <div class="stat-info">
                        <h3>Alerts</h3>
                        <h2>0</h2>
                    </div>
                </div>
            </div>

            <!-- Registered System Users / Crew Cards Section -->
            <div class="user-cards-section" style="margin-top: 28px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                    <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0;">Registered System Users / Crew 👥</h3>
                </div>
                <div id="usersGrid" class="users-grid">
                    <div style="grid-column: 1 / -1; text-align: center; padding: 30px; color: var(--text-muted);">Loading system users...</div>
                </div>
            </div>
        `;

        loadDashboardStats();
        loadUserCards();
    }

    function renderPlaceholderPage(menu) {
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>${menu}</h1>
                <p>The interface for ${menu} is under development.</p>
            </div>
        `;
    }

    function bindMenuAction(menuName, li) {
        // 1. Normalize: Remove extra whitespace and force lowercase
        const label = (menuName || "").trim().toLowerCase();

        li.addEventListener("click", (e) => {
            const anchor = e.target.closest("a");
            if (!anchor) return;

            e.preventDefault();
            setActiveMenu(li);

            // 2. Logic: Use clear, readable conditions
            if (label === "dashboard") {
                renderHomeDashboard();
            }

            // Handles "Assign User Role" or "Manage User Role"
            else if (label.includes("assign") && label.includes("menu") && label.includes("role")) {
                renderAssignMenuToRoleForm();
            }
            else if (label.includes("assign") && label.includes("role") && label.includes("user")) {
                renderManageUserRoleForm();
            }

            else if (label.includes("create user")) {
                renderCreateUserForm();
            }
            else if (label.includes("create role")) {
                renderCreateRoleForm();
            }
            else if (label.includes("create menu")) {
                renderCreateMenuForm();
            }
            else if (label.includes("create city")) {
                renderCreateCityForm();
            }
            else if (label.includes("create airport")) {
                renderCreateAirportForm();
            }
            else if (label.includes("create flight company") || label.includes("flight company")) {
                renderCreateFlightCompanyForm();
            }
            else if (label.includes("create flight") || label.includes("flight")) {
                renderCreateFlightForm();
            }
            else if (label.includes("register customer") || label.includes("register passenger") || label.includes("customer registration") || label.includes("passenger registration") || label.includes("customer")) {
                renderPassengerRegistrationForm();
            }
            else {
                console.warn("Unhandled menu click:", label);
                renderPlaceholderPage(menuName);
            }
        });
    }

    function renderMenus(menus) {
        if (!navLinks) {
            console.error("Sidebar nav container not found.");
            return;
        }

        navLinks.innerHTML = "";
        console.log("menus length =", menus ? menus.length : 0, menus);

        const dashboardLi = document.createElement("li");
        dashboardLi.classList.add("active");
        dashboardLi.innerHTML = `<a href="#" class="menu-link" data-menu="DASHBOARD"><span class="icon">📊</span><span class="menu-text">Dashboard</span></a>`;
        navLinks.appendChild(dashboardLi);
        bindMenuAction("DASHBOARD", dashboardLi);

        if (menus && menus.length > 0) {
            const uniqueMenus = [...new Set(menus.map(m => (m || "").trim()).filter(Boolean))];

            uniqueMenus.forEach((menu, index) => {
                if (menu.toUpperCase() === "DASHBOARD") return;

                let icon = "📄";
                const upperMenu = menu.toUpperCase().trim();
                if (upperMenu.includes("DASHBOARD")) icon = "📊";
                else if (upperMenu.includes("CUSTOMER") || upperMenu.includes("PASSENGER")) icon = "🎫";
                else if (upperMenu.includes("CREATE USER")) icon = "👤";
                else if (upperMenu.includes("FLIGHT") || upperMenu.includes("AIRCRAFT")) icon = "✈️";
                else if (upperMenu.includes("CREW") || upperMenu.includes("STAFF") || upperMenu.includes("EMPLOYEE") || upperMenu.includes("USER")) icon = "👥";
                else if (upperMenu.includes("SCHEDULE") || upperMenu.includes("PLAN")) icon = "📅";
                else if (upperMenu.includes("REPORT") || upperMenu.includes("STAT")) icon = "📈";
                else if (upperMenu.includes("SCHEME")) icon = "📋";
                else if (upperMenu.includes("APPLY") || upperMenu.includes("SCHOLARSHIP")) icon = "🎓";
                else if (upperMenu.includes("VIEW") || upperMenu.includes("RENEW") || upperMenu.includes("APPLICATION")) icon = "🔍";
                else if (upperMenu.includes("CITY")) icon = "🏙️";
                else if (upperMenu.includes("AIRPORT")) icon = "✈️";

                const li = document.createElement("li");
                li.innerHTML = `<a href="#" class="menu-link" data-menu="${menu}"><span class="icon">${icon}</span><span class="menu-text">${menu}</span></a>`;
                navLinks.appendChild(li);
                bindMenuAction(menu, li);

                console.log(`Rendered menu ${index + 1}:`, menu);
            });
        } else {
            const li = document.createElement("li");
            li.innerHTML = `<a href="#" class="menu-link" data-menu="NO MENU"><span class="icon">⚠️</span><span class="menu-text">No Menu</span></a>`;
            navLinks.appendChild(li);
        }

        console.log("Rendered nav HTML:", navLinks.innerHTML);
    }

    try {
        const res = await fetch("/api/me", {
            method: "GET",
            credentials: "same-origin"
        });

        const data = await res.json();
        console.log("API /api/me response:", data);

        if (res.ok) {
            currentUser = data;

            let cleanName = data.fullName || "User";
            cleanName = cleanName.replace(/@aos\.com$/i, "").trim();

            let label = "Welcome, " + cleanName;
            if (data.role) label += " | " + data.role;

            if (profileName) {
                profileName.textContent = label;
            }

            // Update sidebar profile elements
            const sidebarName = document.getElementById("sidebarName");
            const sidebarRole = document.getElementById("sidebarRole");
            const sidebarLastLogin = document.getElementById("sidebarLastLogin");
            const sidebarAvatar = document.getElementById("sidebarAvatar");

            if (sidebarName) {
                sidebarName.textContent = cleanName;
            }

            if (sidebarRole) {
                sidebarRole.textContent = "Role: " + (data.role || "User");
            }

            if (sidebarLastLogin) {
                const now = new Date();
                const lastLoginDate = new Date(now.getTime() - 24 * 60 * 60 * 1000 - 30 * 60 * 1000); // 1 day and 30 mins ago
                const day = String(lastLoginDate.getDate()).padStart(2, '0');
                const month = String(lastLoginDate.getMonth() + 1).padStart(2, '0');
                const year = lastLoginDate.getFullYear();
                const hours = String(lastLoginDate.getHours()).padStart(2, '0');
                const minutes = String(lastLoginDate.getMinutes()).padStart(2, '0');
                const seconds = String(lastLoginDate.getSeconds()).padStart(2, '0');
                sidebarLastLogin.textContent = `Last Login: ${day}-${month}-${year} ${hours}:${minutes}:${seconds}`;
            }

            renderMenus(data.menus || []);
            renderHomeDashboard();

            if (data.photoUrl) {
                if (avatarImg) {
                    avatarImg.src = data.photoUrl;
                    avatarImg.onerror = () => {
                        console.warn("Profile image failed, using default avatar.");
                        setDefaultAvatar(cleanName);
                    };
                }
                if (sidebarAvatar) {
                    sidebarAvatar.src = data.photoUrl;
                    sidebarAvatar.onerror = () => {
                        console.warn("Sidebar profile image failed, using default avatar.");
                        setDefaultAvatar(cleanName);
                    };
                }
            } else {
                setDefaultAvatar(cleanName);
            }

        } else if (res.status === 401) {
            console.warn("Session expired or user not logged in.");
            window.location.href = "/";
        } else {
            console.error("API error:", data.message);
        }
    } catch (err) {
        console.error("Failed to load user profile:", err);
    }

    if (logoutBtn) {
        logoutBtn.addEventListener("click", async () => {
            try {
                await fetch("/api/logout", {
                    method: "POST",
                    credentials: "same-origin"
                });
            } catch (err) {
                console.error("Logout failed:", err);
            }
            window.location.href = "/";
        });
    }

    // ==========================================
    // FLOATING ROBO-CHATBOT INTERACTIVE LOGIC
    // ==========================================
    const chatbotFab = document.getElementById("chatbotFab");
    const chatbotWindow = document.getElementById("chatbotWindow");
    const chatbotClose = document.getElementById("chatbotClose");
    const chatbotMessages = document.getElementById("chatbotMessages");
    const chatbotInput = document.getElementById("chatbotInput");
    const chatbotSend = document.getElementById("chatbotSend");

    if (chatbotFab && chatbotWindow) {
        chatbotFab.addEventListener("click", () => {
            chatbotWindow.classList.toggle("hidden");
            if (!chatbotWindow.classList.contains("hidden")) {
                chatbotInput.focus();
            }
        });
    }

    if (chatbotClose && chatbotWindow) {
        chatbotClose.addEventListener("click", (e) => {
            e.stopPropagation();
            chatbotWindow.classList.add("hidden");
        });
    }

    function appendMessage(sender, text) {
        if (!chatbotMessages) return;
        const msgDiv = document.createElement("div");
        msgDiv.className = `message ${sender}`;
        
        // Escape HTML to prevent XSS, but convert newlines to <br>
        const safeText = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;")
            .replace(/\n/g, "<br>");
        
        msgDiv.innerHTML = safeText;
        chatbotMessages.appendChild(msgDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
    }

    function showTypingIndicator() {
        if (!chatbotMessages) return null;
        const indicatorDiv = document.createElement("div");
        indicatorDiv.className = "message bot typing-indicator-container";
        indicatorDiv.innerHTML = `
            <div class="typing-indicator">
                <span></span>
                <span></span>
                <span></span>
            </div>
        `;
        chatbotMessages.appendChild(indicatorDiv);
        chatbotMessages.scrollTop = chatbotMessages.scrollHeight;
        return indicatorDiv;
    }

    async function handleSendMessage() {
        if (!chatbotInput || !chatbotMessages) return;
        const text = chatbotInput.value.trim();
        if (!text) return;

        // Append user message
        appendMessage("user", text);
        chatbotInput.value = "";

        // Show typing indicator
        const typingIndicator = showTypingIndicator();

        try {
            const apiKey = localStorage.getItem("gemini_api_key") || "";
            const response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({ message: text, apiKey: apiKey })
            });

            if (typingIndicator) {
                typingIndicator.remove();
            }

            const data = await response.json();
            if (response.ok && data.response) {
                appendMessage("bot", data.response);
            } else {
                appendMessage("bot", data.error || "Sorry, I encountered an error processing your request. Please try again.");
            }
        } catch (err) {
            console.error("Chat error:", err);
            if (typingIndicator) {
                typingIndicator.remove();
            }
            appendMessage("bot", "Network error. Please make sure the backend server is running.");
        }
    }

    if (chatbotSend) {
        chatbotSend.addEventListener("click", handleSendMessage);
    }

    if (chatbotInput) {
        chatbotInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                handleSendMessage();
            }
        });
    }

    // Settings Toggle and Save Logic
    const chatbotSettingsToggle = document.getElementById("chatbotSettingsToggle");
    const chatbotSettingsPanel = document.getElementById("chatbotSettingsPanel");
    const chatbotApiKeyInput = document.getElementById("chatbotApiKeyInput");
    const chatbotSaveSettingsBtn = document.getElementById("chatbotSaveSettingsBtn");

    if (chatbotApiKeyInput) {
        chatbotApiKeyInput.value = localStorage.getItem("gemini_api_key") || "";
    }

    if (chatbotSettingsToggle && chatbotSettingsPanel) {
        chatbotSettingsToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            chatbotSettingsPanel.classList.toggle("hidden");
        });
    }

    if (chatbotSaveSettingsBtn && chatbotApiKeyInput && chatbotSettingsPanel) {
        chatbotSaveSettingsBtn.addEventListener("click", (e) => {
            e.stopPropagation();
            const keyVal = chatbotApiKeyInput.value.trim();
            localStorage.setItem("gemini_api_key", keyVal);
            chatbotSettingsPanel.classList.add("hidden");
            appendMessage("bot", "🔑 API Key updated successfully!");
        });
    }
});