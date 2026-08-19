// Theme Toggle Switch Handler (Black BG Dark / White BG Light)
function initThemeToggle() {
    const savedTheme = localStorage.getItem("aos_theme") || "dark";
    applyTheme(savedTheme);

    const toggleBtn = document.getElementById("themeToggleBtn");
    if (toggleBtn) {
        toggleBtn.addEventListener("click", () => {
            const currentTheme = document.documentElement.getAttribute("data-theme") || "dark";
            const newTheme = currentTheme === "dark" ? "light" : "dark";
            applyTheme(newTheme);
            localStorage.setItem("aos_theme", newTheme);
        });
    }
}

function applyTheme(theme) {
    document.documentElement.setAttribute("data-theme", theme);
    const textLabel = document.getElementById("themeToggleText");
    if (textLabel) {
        textLabel.textContent = theme === "dark" ? "DARK" : "LIGHT";
    }
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initThemeToggle);
} else {
    initThemeToggle();
}

// Global navigation dispatcher available instantly on script load
window.aosPendingMenu = null;
window.aosNavigateTo = function (menuName, element) {
    console.log("[AOS NAV] Navigating to:", menuName);
    const li = element ? (element.closest ? element.closest('li') : null) : null;
    if (window._aos_navigateToMenu) {
        window._aos_navigateToMenu(menuName, li);
    } else {
        window.aosPendingMenu = { menuName, li };
    }
};

function getMainContentEl() {
    return document.querySelector(".content") || document.querySelector(".main-content") || document.querySelector("main");
}

async function initDashboard() {
    const avatarImg = document.getElementById("profileAvatar");
    const profileName = document.getElementById("profileName");
    const mainContent = document.querySelector(".content");
    const navLinks = document.querySelector(".nav-links") || document.getElementById("navLinks");
    const logoutBtn = document.getElementById("logoutBtn");

    const originalContent = mainContent ? mainContent.innerHTML : "";
    let currentUser = null;
    let allUsers = [];

    // Bind logout button handler immediately so it works in all states
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

    // Immediately render dashboard stats & staff cards on DOM load
    renderHomeDashboard();

    // Fetch logged in user profile immediately from /api/me
    try {
        const res = await fetch("/api/me", {

            method: "GET",
            credentials: "same-origin"
        });

        if (res.status === 401) {
            console.warn("Session expired or user not logged in. Redirecting to login page...");
            window.location.href = "/";
            return;
        }

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

        } else {
            console.error("API error:", data.message);
        }
    } catch (err) {
        console.error("Failed to load user profile:", err);
    }

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
                        <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg></span>
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
        const navContainer = document.querySelector(".nav-links") || document.getElementById("navLinks");
        if (navContainer) {
            navContainer.querySelectorAll("li").forEach(li => li.classList.remove("active"));
        }
        if (clickedLi) clickedLi.classList.add("active");
    }

    function getMainContentEl() {
        return document.querySelector(".content") || document.querySelector(".main-content") || document.querySelector("main");
    }

    function renderHomeDashboard() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        const isPassenger = currentUser && (currentUser.role === 'PASSENGER' || currentUser.role === 'CUSTOMER');

        if (isPassenger) {
            let cleanName = (currentUser && currentUser.fullName) ? currentUser.fullName : "Passenger";
            cleanName = cleanName.replace(/@aos\.com$/i, "").trim();
            const myId = (currentUser && (currentUser.dbUserId || currentUser.userId)) ? (currentUser.dbUserId || currentUser.userId) : "10000003";
            const myEmail = (currentUser && (currentUser.username || currentUser.userId)) ? (currentUser.username || currentUser.userId) : "passenger@aos.com";
            const myMobile = (currentUser && currentUser.mobileNo) ? currentUser.mobileNo : "N/A";
            const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=007AFF&color=fff`;
            const avatarSrc = (currentUser && currentUser.photoUrl) ? currentUser.photoUrl : defaultAvatar;

            mainContent.innerHTML = `
                <div class="welcome-banner" style="background: linear-gradient(135deg, rgba(14, 165, 233, 0.15) 0%, rgba(2, 132, 199, 0.05) 100%); border: 1px solid rgba(56, 189, 248, 0.25);">
                    <div class="banner-text">
                        <h1>Passenger Flight & Reservations Portal <svg class="btn-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg></h1>
                        <p>Search live flight schedules, select executive aircraft seats, and manage your passenger profile.</p>
                    </div>
                </div>

                <div class="stats-grid">
                    <div class="stat-card" style="cursor: pointer;" onclick="window.aosNavigateTo('SEAT BOOKING');">
                        <div class="icon-circle blue">
                            <svg class="stat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>
                        </div>
                        <div class="stat-info">
                            <h3>Available Flights</h3>
                            <h2 id="activeFlightsCount">10</h2>
                        </div>
                    </div>

                    <div class="stat-card">
                        <div class="icon-circle green">
                            <svg class="stat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                        </div>
                        <div class="stat-info">
                            <h3>Loyalty Tier</h3>
                            <h2>VIP Platinum</h2>
                        </div>
                    </div>

                    <div class="stat-card" style="cursor: pointer;" onclick="window.aosNavigateTo('REGISTER CUSTOMER');">
                        <div class="icon-circle orange">
                            <svg class="stat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
                        </div>
                        <div class="stat-info">
                            <h3>My Profile</h3>
                            <h2>Active</h2>
                        </div>
                    </div>

                    <div class="stat-card" style="cursor: pointer;" onclick="window._aos_openTodayMessagesModal();" title="Click to view today's operational notifications">
                        <div class="icon-circle red">
                            <svg class="stat-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        </div>
                        <div class="stat-info">
                            <h3>Today's Messages</h3>
                            <h2 id="todayMessagesCount">0</h2>
                        </div>
                    </div>
                </div>

                <!-- Customer Quick Actions -->
                <div class="macOS-card" style="margin-top: 24px; padding: 24px;">
                    <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 14px;">Customer Flight Services</h3>
                    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
                        <button class="submit-btn" style="padding: 16px; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 10px;" onclick="window.aosNavigateTo('SEAT BOOKING');">
                            <svg class="btn-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg> Book Aircraft Seats & Tickets
                        </button>
                        <button class="submit-btn" style="padding: 16px; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 10px; background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);" onclick="window.aosNavigateTo('REGISTER CUSTOMER');">
                            <svg class="btn-svg" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg> Update Passenger Registration
                        </button>
                    </div>
                </div>

                <!-- Logged In Passenger Profile Card -->
                <div class="user-cards-section" style="margin-top: 28px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h3 style="font-size: 15px; font-weight: 700; color: var(--text-main); margin: 0; text-transform: uppercase; letter-spacing: 0.5px;">My Customer / Passenger Account</h3>
                    </div>
                    <div class="users-grid" style="display: grid; grid-template-columns: minmax(300px, 480px);">
                        <div class="user-glass-card my-profile-card">
                            <div class="user-card-header">
                                <div class="user-avatar-container">
                                    <img src="${avatarSrc}" 
                                         alt="${cleanName}" 
                                         class="user-avatar-circle"
                                         onerror="this.src='${defaultAvatar}'">
                                    <span class="status-badge-dot active" title="Active Customer"></span>
                                </div>
                                <div class="user-name-role">
                                    <h4>${cleanName}</h4>
                                    <span class="user-role-badge" style="background: rgba(14, 165, 233, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); font-weight: 700;">PASSENGER</span>
                                </div>
                            </div>
                            <div class="user-card-details">
                                <div class="detail-field">
                                    <span class="detail-label">Passenger ID</span>
                                    <span class="detail-value">#${myId}</span>
                                </div>
                                <div class="detail-field">
                                    <span class="detail-label">Username / Email</span>
                                    <span class="detail-value" title="${myEmail}">${myEmail}</span>
                                </div>
                                <div class="detail-field">
                                    <span class="detail-label">Mobile Number</span>
                                    <span class="detail-value">${myMobile}</span>
                                </div>
                                <div class="detail-field">
                                    <span class="detail-label">Membership Tier</span>
                                    <span class="detail-value" style="color: #38bdf8; font-weight: 700;">VIP Platinum (15% Flight Discount)</span>
                                </div>
                                <div class="detail-field">
                                    <span class="detail-label">Account Status</span>
                                    <span class="detail-value" style="color: #34C759; font-weight: 700;">Active Customer</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            loadDashboardStats();
        } else {
            if (originalContent) {
                mainContent.innerHTML = originalContent;
            }
            loadDashboardStats();
            loadUserCards();
        }
    }


    function renderCreateUserForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Create New User <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></h1>
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
                            <input type="password" name="password" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" required>
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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                } else {
                    msgDiv.innerHTML = "&times; " + (result.message || "Failed to create user");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Create user error:", err);
                msgDiv.innerHTML = "&times; Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderCreateRoleForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create & Manage Roles <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="7.5" cy="15.5" r="5.5"/><path d="M21 2l-9.6 9.6"/><path d="M15.5 7.5l3 3"/></svg></h1>
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
                    createMsg.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    createMsg.className = "form-message success";
                    roleNameInput.value = "";
                    // Refresh list
                    loadRoles();
                } else {
                    createMsg.innerHTML = "&times; " + (result.message || "Failed to create role");
                    createMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                createMsg.innerHTML = "&times; Error connecting to server.";
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
                    deleteMsg.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    deleteMsg.className = "form-message success";
                    // Refresh list
                    loadRoles();
                } else {
                    deleteMsg.innerHTML = "&times; " + (result.message || "Failed to delete role");
                    deleteMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                deleteMsg.innerHTML = "&times; Error connecting to server.";
                deleteMsg.className = "form-message error";
            }
        };
    }

    function renderCreateMenuForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create & Manage Menus <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></h1>
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
                    createMsg.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    createMsg.className = "form-message success";
                    menuNameInput.value = "";
                    // Refresh list
                    loadMenus();
                } else {
                    createMsg.innerHTML = "&times; " + (result.message || "Failed to create menu");
                    createMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                createMsg.innerHTML = "&times; Error connecting to server.";
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
                    deleteMsg.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    deleteMsg.className = "form-message success";
                    // Refresh list
                    loadMenus();
                } else {
                    deleteMsg.innerHTML = "&times; " + (result.message || "Failed to delete menu");
                    deleteMsg.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                deleteMsg.innerHTML = "&times; Error connecting to server.";
                deleteMsg.className = "form-message error";
            }
        };
    }


    function renderAssignRoleForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Role Management <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></h1>
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
                        <p class="role-status-info"><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> Current Status: <span id="currentUserStatus">No Role Assigned</span></p>
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
                    msgDiv.innerHTML = "&times; Error loading user/role data.";
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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    msgDiv.className = "form-message success";

                    const selectedRoleName = roleSelect.options[roleSelect.selectedIndex].text;
                    currentUserStatus.textContent = `Currently assigned to ${selectedRoleName}`;
                    submitBtn.textContent = "Update Role";
                } else {
                    msgDiv.innerHTML = "&times; " + (result.message || "Failed to update role");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Assign role error:", err);
                msgDiv.innerHTML = "&times; Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }






    function renderAssignMenuToRoleForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Role Menu Mapping <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></h1>
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
                msg.innerHTML = "&times; Error loading roles.";
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
                msg.innerHTML = "&times; Error loading menu mapping.";
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
                    msg.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Successfully added "${menuName}"`;
                    await loadMenus(roleId);
                } else {
                    msg.style.display = "block";
                    msg.className = "form-message error";
                    msg.innerHTML = "&times; " + (result.message || "Failed to add menu");
                }
            } catch (err) {
                console.error("Assign menu error:", err);
                msg.style.display = "block";
                msg.className = "form-message error";
                msg.innerHTML = "&times; Error connecting to server.";
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
                    msg.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> Successfully removed "${menuItemName}"`;
                    await loadMenus(roleId);
                } else {
                    msg.style.display = "block";
                    msg.className = "form-message error";
                    msg.innerHTML = "&times; " + (result.message || "Failed to remove menu");
                }
            } catch (err) {
                console.error("Remove menu error:", err);
                msg.style.display = "block";
                msg.className = "form-message error";
                msg.innerHTML = "&times; Error connecting to server.";
            }
        }
        loadRoles();
    }



    function renderManageUserRoleForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>ASSIGN ROLE TO USER <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></h1>
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
                msgDiv.innerHTML = "&times; Failed to load users and roles.";
                msgDiv.className = "form-message error";
            }
        }

        loadData();

        form.addEventListener("submit", async (e) => {
            e.preventDefault();
            const userId = userSelect.value;
            const roleId = roleSelect.value;

            if (!roleId || !userId) {
                msgDiv.innerHTML = "&times; Please select User and Role.";
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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    msgDiv.className = "form-message success";
                } else {
                    msgDiv.innerHTML = "&times; " + result.message;
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                msgDiv.innerHTML = "&times; Server Error";
                msgDiv.className = "form-message error";
            }
        });
    }

    function renderCreateCityForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create City <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M6 21V7l8-4v18"/><path d="M14 21V11l4-2v12"/></svg>\uFE0F</h1>
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
                        <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18"/><path d="M6 21V7l8-4v18"/><path d="M14 21V11l4-2v12"/></svg>\uFE0F</span> Registered Cities
                    </h3>
                    <div class="airport-list-wrapper" id="existingCitiesList">
                        <!-- Rendered items -->
                    </div>
                </div>
            </div>

            <div class="globe-column">
                <div class="globe-card macOS-card">
                    <h3 style="margin-bottom: 12px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                        <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg></span> Interactive Route Globe
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
                        <span class="airport-item-action">View \u2794</span>
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

        if (globeIframe) {
            globeIframe.onload = () => {
                sendAirportsToGlobe();
            };
        }

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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                    await loadCitiesAndAirports();
                } else {
                    msgDiv.innerHTML = "&times; " + (result.message || "Failed to create city");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                msgDiv.innerHTML = "&times; Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderCreateAirportForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create Airport <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg></h1>
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
                        <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg></span> Registered Airports
                    </h3>
                    <div class="airport-list-wrapper" id="existingAirportsList">
                        <!-- Rendered items -->
                    </div>
                </div>
            </div>

            <div class="globe-column">
                <div class="globe-card macOS-card">
                    <h3 style="margin-bottom: 12px; font-weight: 600; font-size: 15px; display: flex; align-items: center; gap: 8px;">
                        <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/></svg></span> Interactive Route Globe
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
                        <span class="airport-item-action">View \u2794</span>
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
                            msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg> City "${airport.cityName}" is not registered in the database yet. It will be automatically registered when you click "Create Airport".`;
                            msgDiv.className = "form-message info";
                            msgDiv.style.display = "block";
                        }
                    }
                }
            }
        };

        window.removeEventListener("message", handleIframeMessage);
        window.addEventListener("message", handleIframeMessage);

        if (globeIframe) {
            globeIframe.onload = () => {
                sendAirportsToGlobe();
            };
        }

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
                msgDiv.innerHTML = "&times; Failed to load screen data.";
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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                    await loadCitiesAndAirports();
                } else {
                    msgDiv.innerHTML = "&times; " + (result.message || "Failed to create airport");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                msgDiv.innerHTML = "&times; Error: " + err.message;
                msgDiv.className = "form-message error";
            }
        };
    }


    function renderCreateFlightCompanyForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
        <div class="welcome-banner">
            <h1>Create Flight Company <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg></h1>
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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + result.message;
                    msgDiv.className = "form-message success";
                    form.reset();
                    loadCompanies();
                } else {
                    msgDiv.innerHTML = "&times; " + (result.message || "Failed to create flight company");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error(err);
                msgDiv.innerHTML = "&times; Error connecting to server.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderCreateFlightForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Create New Flight <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg></h1>
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
                        <h3 style="font-weight: 600; font-size: 16px; margin: 0;">Registered Flights Table <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg></h3>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;">Overview of all airline flights stored in database</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="text" id="flightSearchInput" placeholder="Search flight, company..." style="padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-input); font-size: 13px; outline: none; background: var(--bg-input); color: var(--text-input); min-width: 220px;">
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
                        <td style="padding: 12px 16px; color: var(--text-muted);">${f.flightName || '\u2014'}</td>
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
                msgDiv.innerHTML = "&times; Flight Number and Company are required.";
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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + (result.message || "Data Inserted Sucessfully");
                    msgDiv.className = "form-message success";
                    flightNoInput.value = "";
                    flightNameInput.value = "";
                    loadFlightData();
                    loadDashboardStats();
                } else {
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ` + (result.message || "Creation failed");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Create flight error:", err);
                msgDiv.innerHTML = "&times; Network error. Please try again.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderPassengerRegistrationForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Register Customer / Passenger <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg></h1>
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

                        <!-- MEMBERSHIP TIER SELECTION WITH ANNUAL FEE -->
                        <div class="input-group" style="grid-column: span 2; background: #f0f9ff; border: 1.5px solid #0284c7; padding: 12px 16px; border-radius: 10px; margin-top: 6px;">
                            <label style="font-weight: 800; color: #0369a1; font-size: 13px; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;">
                                <span> Select Frequent Flyer Membership Tier & Fee (Annual Pass):</span>
                                <span style="background: #0284c7; color: #fff; font-size: 11px; padding: 3px 8px; border-radius: 6px; font-weight: 800;">Live System Linked</span>
                            </label>
                            <select name="memberTier" id="mainMemberTierSelect" style="width: 100%; padding: 10px; border-radius: 8px; border: 1.5px solid #0284c7; font-weight: 800; font-size: 13px; color: #0f172a; background: #ffffff;">
                                <option value="No Membership" selected>❌ No Membership (Regular Customer) — Free (₹0 Fee / 0% Discount)</option>
                                <option value="Executive Platinum">🏅 Executive Platinum (15% Flight Discount) — Fee: ₹1,500/year</option>
                                <option value="Gold Elite">🥇 Gold Elite (10% Flight Discount) — Fee: ₹1,000/year</option>
                                <option value="Silver Preferred">🥈 Silver Preferred (5% Flight Discount) — Fee: ₹500/year</option>
                                <option value="Standard">👤 Standard Member (0% Flight Discount) — Free (₹0)</option>
                            </select>
                            <div style="font-size: 11px; color: #0369a1; margin-top: 6px; font-weight: 600;">
                                 Membership fee details & discount tier will be saved with your customer profile.
                            </div>
                        </div>
                    </div>

                    <div class="form-footer">
                        <button type="submit" class="submit-btn">Register Customer & Save Membership</button>
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
            const tierVal = formData.get("memberTier") || "Executive Platinum";
            const tierFees = {
                "Executive Platinum": 1500,
                "Gold Elite": 1000,
                "Silver Preferred": 500
            };
            const fee = tierFees[tierVal] || 0;
            if (fee > 0) {
                const confirmPay = confirm(`Membership Fee Confirmation:\n\nThe selected membership tier '${tierVal}' is not assigned for free. An annual membership fee of \u20B9${fee.toLocaleString('en-IN')} is required.\n\nDo you want to collect cash payment of \u20B9${fee.toLocaleString('en-IN')} and activate this membership?`);
                if (!confirmPay) {
                    return;
                }
            }

            const payload = {
                passengerName: formData.get("passengerName"),
                gender: formData.get("gender"),
                dob: formData.get("dob"),
                mobileNo: formData.get("mobileNo"),
                emailId: formData.get("emailId"),
                passportNo: formData.get("passportNo"),
                memberTier: tierVal
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
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + (result.message || "Customer Registered Successfully!");
                    msgDiv.className = "form-message success";
                    form.reset();
                } else {
                    msgDiv.innerHTML = "&times; " + (result.message || "Registration failed");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Passenger registration error:", err);
                msgDiv.innerHTML = "&times; Network error. Please try again.";
                msgDiv.className = "form-message error";
            }
        };
    }

    async function renderSeatMapBookingView(targetDpId) {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner" style="margin-bottom: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; width: 100%; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h1>Executive Aircraft Seating & Reservations <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg></h1>
                        <p>Multi-day flight schedule booking, live seat availability matrix & printable E-Tickets.</p>
                    </div>
                    <button id="backToPricingBtn" style="padding: 10px 18px; border-radius: 8px; border: none; background: rgba(255,255,255,0.25); color: #fff; font-weight: 700; cursor: pointer; font-size: 13px; backdrop-filter: blur(8px);">\u2B05 Manage Dynamic Rates</button>
                </div>
            </div>

            <!-- SELECT PLANE / AIRCRAFT DROP-DOWN BAR -->
            <div class="macOS-card" style="margin-bottom: 20px; padding: 16px 20px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #ffffff; border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px; box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; flex-wrap: wrap; gap: 8px;">
                    <label for="planeSelectBar" style="font-weight: 800; font-size: 14px; color: #38bdf8; display: flex; align-items: center; gap: 8px;">
                        <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg></span> Select Plane / Flight:
                    </label>
                    <span style="font-size: 11px; background: rgba(56, 189, 248, 0.15); color: #38bdf8; border: 1px solid rgba(56, 189, 248, 0.3); padding: 4px 10px; border-radius: 6px; font-weight: 700;">
                        Live Fleet & Schedule Sync
                    </span>
                </div>
                <div style="display: flex; gap: 14px; align-items: center; flex-wrap: wrap;">
                    <div style="flex: 1; min-width: 300px;">
                        <select id="planeSelectBar" style="width: 100%; padding: 12px 16px; border-radius: 8px; border: 1.5px solid #0284c7; background: #020617; color: #ffffff; font-weight: 800; font-size: 14px; outline: none; cursor: pointer; box-shadow: 0 4px 12px rgba(2, 132, 199, 0.25);">
                            <option value="" disabled selected>Loading registered planes...</option>
                        </select>
                    </div>
                    <div id="selectedPlaneBadge" style="display: flex; align-items: center; gap: 8px; font-size: 12px; font-weight: 700; color: #f8fafc; background: rgba(255, 255, 255, 0.08); padding: 10px 16px; border-radius: 8px; border: 1px solid rgba(255, 255, 255, 0.15);">
                        <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 22h20"/><path d="M12 2v10"/><path d="M12 6l8 4v2l-8-3-8 3V10l8-4z"/></svg> Aircraft Selected:</span> <span id="planeBadgeText" style="color: #39FF14; font-weight: 800;">Air India AI-101 (Airbus A320)</span>
                    </div>
                </div>
            </div>

            <!-- 7-DAY FLIGHT DATE SELECTOR TABS -->
            <div class="macOS-card" style="margin-bottom: 20px; padding: 16px 20px;">
                <div style="font-weight: 800; font-size: 14px; color: #0f172a; margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                    <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> 7-Day Flight Schedule (SYSDATE Window: Aug 15 \u2013 Aug 21):</span>
                    <span style="font-size: 11px; color: #0284c7; background: #e0f2fe; padding: 4px 10px; border-radius: 6px; font-weight: 700;">Live Schedule Sync</span>
                </div>
                <div class="date-schedule-tabs-container" id="flightDateTabsContainer">
                    <div style="font-size: 12px; color: #64748b;">Loading flight dates...</div>
                </div>
            </div>

            <div id="seatMapContainer"></div>
        `;

        document.getElementById("backToPricingBtn")?.addEventListener("click", () => {
            renderCreateDynamicPriceForm();
        });

        let activeDpId = targetDpId || 16000011;
        const dateTabsContainer = document.getElementById("flightDateTabsContainer");
        const planeSelectBar = document.getElementById("planeSelectBar");
        const planeBadgeText = document.getElementById("planeBadgeText");

        // Fetch registered planes from DB to populate the Selectbar
        let registeredPlanes = [];
        try {
            const planeRes = await fetch("/api/registered-planes", { credentials: "same-origin" });
            if (planeRes.ok) {
                const pData = await planeRes.json();
                registeredPlanes = pData.planes || [];
            }
        } catch (err) {
            console.warn("Could not fetch registered planes for selectbar:", err);
        }
        window._aos_registeredPlanes = registeredPlanes;

        if (planeSelectBar) {
            if (registeredPlanes.length > 0) {
                planeSelectBar.innerHTML = registeredPlanes.map(p => `
                    <option value="${p.dynamicPriceId}" data-flightno="${p.flightNo}" data-company="${p.companyName}" data-model="${p.flightName}" data-route="${p.sourceCode} \u2794 ${p.destCode}">
                        <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg> ${p.companyName} (${p.flightNo}) - ${p.flightName} | Route: ${p.sourceCode} \u2794 ${p.destCode} | Avail: ${p.availableSeats} seats | \u20B9${p.currentPrice.toLocaleString('en-IN')}
                    </option>
                `).join('');

                const matchedPlane = registeredPlanes.find(p => p.dynamicPriceId === parseInt(activeDpId)) || registeredPlanes[0];
                if (matchedPlane) {
                    activeDpId = matchedPlane.dynamicPriceId;
                    planeSelectBar.value = matchedPlane.dynamicPriceId;
                    if (planeBadgeText) {
                        planeBadgeText.textContent = `${matchedPlane.companyName} ${matchedPlane.flightNo} (${matchedPlane.flightName}) \u2022 ${matchedPlane.sourceCode} \u2794 ${matchedPlane.destCode}`;
                    }
                }

                planeSelectBar.addEventListener("change", (e) => {
                    const selectedDpId = parseInt(e.target.value);
                    const selectedPlane = registeredPlanes.find(p => p.dynamicPriceId === selectedDpId);
                    if (selectedPlane && planeBadgeText) {
                        planeBadgeText.textContent = `${selectedPlane.companyName} ${selectedPlane.flightNo} (${selectedPlane.flightName}) \u2022 ${selectedPlane.sourceCode} \u2794 ${selectedPlane.destCode}`;
                    }
                    activeDpId = selectedDpId;
                    loadSeatMap(selectedDpId);
                });
            } else {
                planeSelectBar.innerHTML = `<option value="16000011"><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg> Air India (AI-101) - Airbus A320 | DEL \u2794 BOM | Avail: 180 seats</option>`;
            }
        }

        // Construct 7 rolling days strictly starting from SYSDATE (today, no past dates)
        const sysdateNow = new Date();
        const sysdateDaysList = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(sysdateNow);
            d.setDate(sysdateNow.getDate() + i);
            const dateStr = d.toISOString().split('T')[0];
            sysdateDaysList.push({
                dynamicPriceId: 16000011 + i,
                flightNo: "AI-101",
                companyName: "Air India",
                sourceAirportCode: "DEL",
                destAirportCode: "BOM",
                flightDate: dateStr,
                availableSeats: 180,
                totalSeats: 180
            });
        }

        try {
            const res = await fetch("/api/flight-schedules", { credentials: "same-origin" });
            const data = await res.json();
            const dbPrices = (data && data.dynamicPrices) ? data.dynamicPrices : [];

            // Filter DB prices for dates starting from today onwards (no backward past dates)
            const todayDateStr = sysdateNow.toISOString().split('T')[0];
            const futureDbPrices = dbPrices.filter(p => (p.flightDate || '') >= todayDateStr);

            if (futureDbPrices.length > 0) {
                // Merge DB schedules with 7-day rolling window
                sysdateDaysList.forEach((sItem, idx) => {
                    const matchedDb = futureDbPrices.find(dp => dp.flightDate === sItem.flightDate);
                    if (matchedDb) {
                        sysdateDaysList[idx] = matchedDb;
                    }
                });
            }
        } catch (err) {
            console.warn("Could not fetch DB schedules, using SYSDATE rolling window:", err);
        }
        window._aos_sysdateDaysList = sysdateDaysList;

        const exists = sysdateDaysList.some(p => p.dynamicPriceId === parseInt(activeDpId));
        if (!activeDpId || !exists) {
            activeDpId = sysdateDaysList[0].dynamicPriceId;
        }

        if (dateTabsContainer) {
            dateTabsContainer.innerHTML = sysdateDaysList.map((p) => {
                const dObj = new Date(p.flightDate);
                const dayName = dObj.toLocaleDateString('en-US', { weekday: 'short' });
                const monthDay = dObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                const isActive = p.dynamicPriceId === parseInt(activeDpId);

                return `
                    <div class="date-schedule-tab ${isActive ? 'active' : ''}" data-dpid="${p.dynamicPriceId}">
                        <span class="tab-date"><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${monthDay}</span>
                        <span class="tab-sub">${dayName} \u2022 ${p.flightNo}</span>
                    </div>
                `;
            }).join('');

            dateTabsContainer.querySelectorAll(".date-schedule-tab").forEach(tab => {
                tab.addEventListener("click", () => {
                    dateTabsContainer.querySelectorAll(".date-schedule-tab").forEach(t => t.classList.remove("active"));
                    tab.classList.add("active");
                    const newDpId = parseInt(tab.dataset.dpid);
                    if (planeSelectBar && Array.from(planeSelectBar.options).some(o => parseInt(o.value) === newDpId)) {
                        planeSelectBar.value = newDpId;
                        const matchP = registeredPlanes.find(p => p.dynamicPriceId === newDpId);
                        if (matchP && planeBadgeText) {
                            planeBadgeText.textContent = `${matchP.companyName} ${matchP.flightNo} (${matchP.flightName}) \u2022 ${matchP.sourceCode} \u2794 ${matchP.destCode}`;
                        }
                    }
                    loadSeatMap(newDpId);
                });
            });
        }

        loadSeatMap(parseInt(activeDpId));
    }

    async function loadSeatMap(dynamicPriceId) {
        const container = document.getElementById("seatMapContainer");
        if (!container) return;

        let targetId = parseInt(dynamicPriceId);
        if (!targetId || isNaN(targetId)) targetId = 16000011;

        // Fetch registered customer options from DB
        let registeredCustomersList = [];
        try {
            const passRes = await fetch("/api/registered-passengers", { credentials: "same-origin" });
            if (passRes.ok) {
                const passData = await passRes.json();
                registeredCustomersList = passData.passengers || [];
            }
        } catch (e) {
            console.warn("Could not fetch registered passengers:", e);
        }

        const getSeatShortcut = (s) => {
            if (s.seatClass === 'BUSINESS' || s.row <= 3) return 'BUS';
            const col = (s.col || s.seatNo.slice(-1)).toUpperCase();
            if (col === 'A' || col === 'F') return 'WND';
            if (col === 'B' || col === 'E') return 'MID';
            if (col === 'C' || col === 'D') return 'AIS';
            return 'REG';
        };

        function renderSeatMapUI(fd, seats, passengers) {
            const economyFare = (fd && fd.currentPrice) ? parseFloat(fd.currentPrice) : 3500.0;
            const businessFare = economyFare + 2500.0;

            if (!seats || seats.length === 0) {
                seats = [];
                const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
                for (let r = 1; r <= 20; r++) {
                    for (let col of cols) {
                        const isBusiness = r <= 3;
                        const seatType = (col === 'A' || col === 'F') ? 'WINDOW' : ((col === 'C' || col === 'D') ? 'AISLE' : 'MIDDLE');
                        const seatClass = isBusiness ? 'BUSINESS' : 'ECONOMY';
                        seats.push({
                            seatNo: `${r}${col}`,
                            row: r,
                            col: col,
                            seatClass: seatClass,
                            seatType: seatType,
                            priceSurcharge: isBusiness ? 2500 : 0,
                            status: 'AVAILABLE',
                            finalPrice: isBusiness ? businessFare : economyFare
                        });
                    }
                }
            }

            container.innerHTML = `
                <div class="seat-map-wrapper">
                    <!-- LEFT SIDE: ACCURATE AIRPLANE FUSELAGE SEATING MAP -->
                    <div class="aircraft-cabin-card">
                        <div class="airplane-sketch-outer">
                            <div class="airplane-fuselage-body">
                                <!-- FRONT LAVATORY & CANTEEN AMENITIES -->
                                <div class="plane-cabin-service-bar" style="margin-bottom: 12px; font-size: 11px;">
                                    <span> Lavatory</span>
                                    <span> Canteen / Galley</span>
                                    <span> Lavatory</span>
                                </div>

                                <div class="seat-col-header-row" style="margin-top: 10px;">
                                    <div></div>
                                    <div class="seat-col-letters"><span>A</span><span>B</span><span>C</span></div>
                                    <div class="aisle-gap"></div>
                                    <div class="seat-col-letters"><span>D</span><span>E</span><span>F</span></div>
                                </div>

                                <div class="cabin-rows-container" id="cabinRowsContainer"></div>

                                <!-- REAR LAVATORY & CANTEEN AMENITIES -->
                                <div class="plane-cabin-service-bar" style="margin-top: 14px; font-size: 11px;">
                                    <span> Lavatory</span>
                                    <span> Canteen / Galley</span>
                                    <span> Lavatory</span>
                                </div>
                            </div>
                        </div>
                    </div>


                    <!-- RIGHT SIDE: SUMMARY CARD MATCHING SCREENSHOT -->
                    <div class="booking-summary-card">
                        <div class="flight-route-header-card">
                            <div class="flight-route-title">
                                ${fd.sourceCode || 'BBI'} &nbsp;\u2794&nbsp; ${fd.destCode || 'DEL'}
                            </div>
                            <div class="flight-route-sub">
                                ${fd.flightNo || 'AI-101'} \u2022 ${fd.flightName || 'Airbus A320 Neo'} \u2022 <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${fd.flightDate || 'Date'}
                            </div>
                        </div>

                        <!-- LEGEND GRID MATCHING SCREENSHOT -->
                        <div class="screenshot-legend-grid">
                            <div class="sc-legend-item">
                                <div class="sc-legend-box business"></div>
                                <div class="sc-legend-text">
                                    Business (BUS)<br><span class="sc-legend-price">\u20B9 ${businessFare.toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                            <div class="sc-legend-item">
                                <div class="sc-legend-box economy"></div>
                                <div class="sc-legend-text">
                                    Economy Class<br><span class="sc-legend-price">\u20B9 ${economyFare.toLocaleString('en-IN')}</span>
                                </div>
                            </div>
                            <div class="sc-legend-item">
                                <div class="sc-legend-box selected"></div>
                                <div class="sc-legend-text">Selected Seat</div>
                            </div>
                            <div class="sc-legend-item">
                                <div class="sc-legend-box booked">X</div>
                                <div class="sc-legend-text">Booked Seat</div>
                            </div>
                        </div>

                        <!-- SELECTED SEATS & TOTAL FARE CARD -->
                        <div class="screenshot-total-card">
                            <div>
                                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Selected Seats</div>
                                <div class="selected-seats-badge-group" id="selectedSeatsBadgesGroup">
                                    <span style="font-size: 12px; color: #94a3b8; font-weight: 600;">None</span>
                                </div>
                            </div>
                            <div style="text-align: right;">
                                <div style="font-size: 11px; font-weight: 700; color: #64748b; text-transform: uppercase;">Total</div>
                                <div style="font-size: 20px; font-weight: 900; color: #0f172a;" id="screenshotTotalFareText">\u20B9 0</div>
                            </div>
                        </div>

                        <!-- NOTICE BANNER -->
                        <div class="screenshot-notice-banner">
                            <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg></span>
                            <span>You can select up to 6 seats per booking</span>
                        </div>

                        <!-- PROCEED TO PAY BUTTON -->
                        <button id="proceedToPayBtn" style="width: 100%; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #fff; font-weight: 800; font-size: 15px; cursor: pointer; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4); transition: all 0.2s ease;">
                            Proceed to Pay \u2794
                        </button>
                        <div id="bookingMsg" class="form-message" style="margin-top: 12px;"></div>
                    </div>
                </div>
            `;

            const selectedSeatsMap = new Map();
            const rowsContainer = document.getElementById("cabinRowsContainer");
            let rowsHtml = '';

            for (let r = 1; r <= 20; r++) {
                const rowSeats = seats.filter(s => parseInt(s.row) === r);
                const leftGroup = ['A', 'B', 'C'].map(col => rowSeats.find(s => (s.col || '').trim().toUpperCase() === col));
                const rightGroup = ['D', 'E', 'F'].map(col => rowSeats.find(s => (s.col || '').trim().toUpperCase() === col));

                const renderSeatBtn = (s, colName) => {
                    if (!s) return `<div style="width:36px;"></div>`;
                    const sNo = String(s.seatNo || '').trim().toUpperCase();
                    const stUpper = String(s.status || '').trim().toUpperCase();
                    const isBookedInSet = window._aos_bookedSeatsSet && window._aos_bookedSeatsSet.has(sNo);
                    const isBooked = isBookedInSet || stUpper === 'BOOKED' || stUpper === 'OCCUPIED' || stUpper === 'PAID' || stUpper === 'CONFIRMED' || stUpper.includes('BOOK');
                    const isBusiness = s.seatClass === 'BUSINESS';
                    const btnClass = `seat-btn ${isBooked ? 'booked' : 'available'} ${isBusiness ? 'business-seat' : ''}`;
                    const shortcut = getSeatShortcut(s);

                    return `
                        <button class="${btnClass}" id="seatBtn_${sNo}" data-seat="${sNo}" data-price="${s.finalPrice}" data-surcharge="${s.priceSurcharge}" data-type="${s.seatType}" data-class="${s.seatClass}" ${isBooked ? 'disabled style="pointer-events:none; opacity:0.85;"' : ''}>
                            ${isBooked ? '<span style="font-size:13px; font-weight:900; color:#dc2626;">X</span>' : `
                                <span class="seat-num-text">${sNo}</span>
                                <span class="seat-shortcut-text">${shortcut}</span>
                            `}
                        </button>
                    `;
                };

                rowsHtml += `
                    <div class="seat-row-grid">
                        <div class="row-number-badge">${r}</div>
                        <div class="seat-group">${leftGroup.map((s, idx) => renderSeatBtn(s, ['A', 'B', 'C'][idx])).join('')}</div>
                        <div class="aisle-gap"></div>
                        <div class="seat-group">${rightGroup.map((s, idx) => renderSeatBtn(s, ['D', 'E', 'F'][idx])).join('')}</div>
                    </div>
                `;
            }

            if (rowsContainer) rowsContainer.innerHTML = rowsHtml;


            const updateSelectedSummary = () => {
                const badgeGroup = document.getElementById("selectedSeatsBadgesGroup");
                const totalFareElem = document.getElementById("screenshotTotalFareText");

                const seatCount = selectedSeatsMap.size;

                if (seatCount === 0) {
                    if (badgeGroup) badgeGroup.innerHTML = `<span style="font-size: 12px; color: #94a3b8; font-weight: 600;">None</span>`;
                    if (totalFareElem) totalFareElem.textContent = "\u20B9 0";
                    return;
                }

                let grandTotal = 0;
                let badgeHtml = '';

                selectedSeatsMap.forEach((seatData, seatNo) => {
                    grandTotal += (seatData.finalPrice || 3500);
                    badgeHtml += `<span class="seat-tag-pill">${seatNo}</span>`;
                });

                if (badgeGroup) badgeGroup.innerHTML = badgeHtml;
                if (totalFareElem) totalFareElem.textContent = `\u20B9 ${grandTotal.toLocaleString('en-IN')}`;
            };

            if (rowsContainer) {
                rowsContainer.querySelectorAll('.seat-btn.available, .seat-btn.in-transition').forEach(btn => {
                    btn.addEventListener('click', () => {
                        const seatNo = btn.dataset.seat;
                        const finalPrice = parseFloat(btn.dataset.price);
                        const surcharge = parseFloat(btn.dataset.surcharge);
                        const seatType = btn.dataset.type;
                        const seatClass = btn.dataset.class;

                        if (selectedSeatsMap.has(seatNo)) {
                            selectedSeatsMap.delete(seatNo);
                            btn.classList.remove('in-transition', 'selected');
                            btn.classList.add('available');
                        } else {
                            if (selectedSeatsMap.size >= 6) {
                                alert("You can select up to 6 seats per booking!");
                                return;
                            }
                            selectedSeatsMap.set(seatNo, { seatNo, finalPrice, surcharge, seatType, seatClass, btnElement: btn });
                            btn.classList.remove('available');
                            btn.classList.add('in-transition', 'selected');
                        }
                        updateSelectedSummary();
                    });
                });
            }

            // PROCEED TO PAY CLICK HANDLER (OPENS CUSTOMER DETAILS FORM & MEMBERSHIP DISCOUNT MODAL)
            const proceedBtn = document.getElementById("proceedToPayBtn");
            const bookingMsg = document.getElementById("bookingMsg");

            if (proceedBtn) {
                proceedBtn.addEventListener("click", () => {
                    if (selectedSeatsMap.size === 0) {
                        if (bookingMsg) {
                            bookingMsg.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Please click available seats on the airplane layout to select your seats!`;
                            bookingMsg.className = "form-message error";
                        }
                        return;
                    }

                    const existingModal = document.getElementById("customerPaymentModalOverlay");
                    if (existingModal) existingModal.remove();

                    let baseTotal = 0;
                    selectedSeatsMap.forEach(s => baseTotal += s.finalPrice);

                    const modalHtml = `
                        <div class="payment-modal-overlay" id="customerPaymentModalOverlay">
                            <div class="payment-modal-card" style="max-width: 560px;">
                                <div class="payment-modal-header">
                                    <div>
                                        <div style="font-weight: 800; font-size: 16px;"><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg> Passenger Details & Checkout</div>
                                        <div style="font-size: 11px; opacity: 0.85;">Fill customer information & select membership tier discount</div>
                                    </div>
                                    <button id="closeCustomerModalBtn" style="background: none; border: none; color: #fff; font-size: 20px; cursor: pointer;">\u2715</button>
                                </div>

                                <div class="payment-modal-body">
                                    <!-- REGISTERED CUSTOMER SELECTION & INLINE REGISTRATION -->
                                    <div style="background: #f8fafc; border-radius: 12px; padding: 14px; margin-bottom: 16px; border: 1px solid #e2e8f0;">
                                        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                                            <label style="font-size: 12px; font-weight: 800; color: #0f172a;">
                                                <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Select Registered Customer:
                                            </label>
                                            <button id="toggleNewCustFormBtn" type="button" style="background: #e0f2fe; color: #0284c7; border: 1px solid #bae6fd; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 6px; cursor: pointer;">
                                                + Add New Customer / Member
                                            </button>
                                        </div>

                                        <select id="regCustomerSelect" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1.5px solid #cbd5e1; font-size: 12px; font-weight: 700; outline: none; background: #ffffff; color: #0f172a; margin-bottom: 10px;">
                                            ${registeredCustomersList.map(c => `
                                                <option value="${c.passengerId}" data-name="${c.passengerName}" data-mobile="${c.mobileNo}" data-email="${c.emailId || ''}" data-passport="${c.passportNo || 'N/A'}" data-tier="${c.memberTier || 'Executive Platinum'}">
                                                    ID ${c.passengerId} - ${c.passengerName} (${c.mobileNo}) [${c.memberTier || 'VIP'}]
                                                </option>
                                            `).join('')}
                                        </select>

                                        <!-- INLINE NEW CUSTOMER REGISTRATION FORM -->
                                        <div id="newMemberRegistrationCard" style="display: none; background: #ffffff; border: 1.5px solid #0284c7; border-radius: 12px; padding: 14px; margin-top: 10px;">
                                            <div style="font-size: 13px; font-weight: 800; color: #0284c7; margin-bottom: 8px;">+ Register New Customer</div>
                                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                                                <input type="text" id="newCustNameInput" placeholder="Full Name *" style="padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px;">
                                                <input type="text" id="newCustMobileInput" placeholder="Mobile Number *" style="padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px;">
                                                <input type="email" id="newCustEmailInput" placeholder="Email Address" style="padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px;">
                                                <input type="text" id="newCustPassportInput" placeholder="Passport No" style="padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px;">
                                            </div>
                                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 10px;">
                                                <select id="newCustGenderSelect" style="padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px;">
                                                    <option value="M">Male</option>
                                                    <option value="F">Female</option>
                                                    <option value="O">Other</option>
                                                </select>
                                                <select id="newCustTierSelect" style="padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 700;">
                                                    <option value="Executive Platinum">Executive Platinum (15% Off) \u2014 Fee: \u20B91,500/yr</option>
                                                    <option value="Gold Elite">Gold Elite (10% Off) \u2014 Fee: \u20B91,000/yr</option>
                                                    <option value="Silver Preferred">Silver Preferred (5% Off) \u2014 Fee: \u20B9500/yr</option>
                                                    <option value="Standard">Standard Customer \u2014 Free (\u20B90)</option>
                                                </select>
                                            </div>
                                            <button id="saveNewCustDbBtn" type="button" style="width: 100%; padding: 9px; border-radius: 8px; border: none; background: #0284c7; color: #fff; font-weight: 800; font-size: 12px; cursor: pointer;">
                                                Save New Customer
                                            </button>
                                            <div id="newCustMsg" style="font-size: 11px; margin-top: 6px;"></div>
                                        </div>

                                        <!-- MEMBERSHIP TIER DISCOUNT SELECTION -->
                                        <div style="margin-top: 10px;">
                                            <label style="font-size: 12px; font-weight: 800; color: #0f172a; display: block; margin-bottom: 6px;">
                                                 Select Membership Tier Discount:
                                            </label>
                                            <select id="membershipTierSelect" style="width: 100%; padding: 9px 12px; border-radius: 8px; border: 1.5px solid #3b82f6; font-size: 12px; font-weight: 800; outline: none; background: #eff6ff; color: #1e3a8a;">
                                                <option value="15" selected>Executive Platinum (15% Special Discount)</option>
                                                <option value="10">Gold Elite (10% Special Discount)</option>
                                                <option value="5">Silver Preferred (5% Special Discount)</option>
                                                <option value="0">Standard Customer (No Discount)</option>
                                            </select>
                                        </div>
                                    </div>

                                    <!-- PASSENGER ROSTER FOR SELECTED SEATS -->
                                    <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                                        <div style="font-weight: 800; font-size: 12px; color: #334155; margin-bottom: 10px; text-transform: uppercase; display: flex; justify-content: space-between; align-items: center;">
                                            <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Passenger Details & Membership Tiers (${selectedSeatsMap.size} Seats):</span>
                                            <span style="font-size: 11px; color: #0284c7; font-weight: 700;">Search Passport / Register</span>
                                        </div>
                                        <div id="modalPassengerInputsContainer"></div>
                                    </div>

                                    <!-- DYNAMIC PRICE BREAKDOWN & DISCOUNT CALCULATION -->
                                    <div style="background: #f0fdf4; border: 1.5px solid #16a34a; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                                        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #475569; margin-bottom: 6px;">
                                            <span>Subtotal Base Fare (${selectedSeatsMap.size} seats):</span>
                                            <span style="font-weight: 700;" id="subtotalFareValText">\u20B9${baseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; font-size: 13px; color: #16a34a; font-weight: 700; margin-bottom: 6px;">
                                            <span>Total Membership Tier Discounts:</span>
                                            <span id="discountValText">-\u20B90.00</span>
                                        </div>
                                        <div style="display: flex; justify-content: space-between; font-size: 17px; font-weight: 900; color: #065f46; border-top: 2px dashed #bbf7d0; padding-top: 8px;">
                                            <span>Net Payable Amount:</span>
                                            <span id="netPayableValText">\u20B9${baseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                                        </div>
                                    </div>

                                    <!-- COUNTER CASH METHOD & PAID ACTION -->
                                    <div style="background: #ffffff; border: 1.5px solid #cbd5e1; border-radius: 12px; padding: 14px; margin-bottom: 16px;">
                                        <div style="font-weight: 800; font-size: 13px; color: #0f172a; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
                                            <span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/></svg> Counter Cash Collection Details</span>
                                            <span style="font-size: 10px; background: #16a34a; color: #fff; padding: 2px 6px; border-radius: 4px; font-weight: 700;">Counter Cash</span>
                                        </div>
                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #475569; display: block; margin-bottom: 2px;">Amount Paid (Cash Tendered):</label>
                                                <input type="number" id="cashPaidAmountInput" value="${baseTotal}" style="width: 100%; padding: 8px; border-radius: 8px; border: 1.5px solid #16a34a; font-size: 14px; font-weight: 800; outline: none; color: #065f46;">
                                            </div>
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #475569; display: block; margin-bottom: 2px;">Change to Return (\u20B9):</label>
                                                <input type="text" id="cashChangeValInput" value="\u20B90.00" readonly style="width: 100%; padding: 8px; border-radius: 8px; border: 1px solid #cbd5e1; font-size: 14px; font-weight: 800; background: #f1f5f9; color: #334155;">
                                            </div>
                                        </div>
                                    </div>

                                    <button id="finalPaidSubmitBtn" style="width: 100%; padding: 14px; border-radius: 12px; border: none; background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); color: #fff; font-weight: 900; font-size: 16px; cursor: pointer; box-shadow: 0 4px 14px rgba(22, 163, 74, 0.4); text-transform: uppercase; letter-spacing: 1px;">
                                        Paid & Generate Ticket PDF <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>
                                    </button>
                                </div>
                            </div>
                        </div>
                    `;

                    document.body.insertAdjacentHTML("beforeend", modalHtml);
                    const modalOverlay = document.getElementById("customerPaymentModalOverlay");
                    const closeModalBtn = document.getElementById("closeCustomerModalBtn");
                    const inputsContainer = document.getElementById("modalPassengerInputsContainer");
                    const subtotalText = document.getElementById("subtotalFareValText");
                    const discountValText = document.getElementById("discountValText");
                    const netPayableText = document.getElementById("netPayableValText");
                    const cashPaidInput = document.getElementById("cashPaidAmountInput");
                    const cashChangeInput = document.getElementById("cashChangeValInput");
                    const paidSubmitBtn = document.getElementById("finalPaidSubmitBtn");

                    if (closeModalBtn) closeModalBtn.addEventListener("click", () => modalOverlay.remove());

                    let currentNetPayable = baseTotal;

                    // Per-Seat Passenger Assignment Map
                    const seatPassengerMap = new Map();

                    const getTierDiscountPct = (tierName) => {
                        if (!tierName) return 0;
                        const t = tierName.toLowerCase();
                        if (t.includes("executive") || t.includes("platinum")) return 15;
                        if (t.includes("gold")) return 10;
                        if (t.includes("silver")) return 5;
                        return 0;
                    };

                    // Default customer initialization for each seat
                    let passIdx = 0;
                    selectedSeatsMap.forEach((seatData, seatNo) => {
                        const defaultCust = registeredCustomersList[passIdx % registeredCustomersList.length] || { passengerId: 10000001, passengerName: "Dushmanta Das", mobileNo: "7008233179", passportNo: "Z9842103", memberTier: "Executive Platinum" };
                        seatPassengerMap.set(seatNo, { ...defaultCust });
                        passIdx++;
                    });

                    const renderPerSeatPassengerCards = () => {
                        if (!inputsContainer) return;

                        let html = '';
                        selectedSeatsMap.forEach((seatData, seatNo) => {
                            const pass = seatPassengerMap.get(seatNo) || {};
                            const discPct = getTierDiscountPct(pass.memberTier);

                            html += `
                                <div class="passenger-seat-card" id="seatCard_${seatNo}">
                                    <div class="seat-card-header">
                                        <div class="seat-title-tag">
                                            <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 18v3M20 18v3M4 11V6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v5M4 11h16M4 11v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg> Seat ${seatNo} (${seatData.seatClass} - \u20B9${seatData.finalPrice.toLocaleString('en-IN')})
                                        </div>
                                        <button type="button" class="register-seat-cust-btn" id="toggleSeatRegBtn_${seatNo}">
                                            + Register Customer for Seat ${seatNo}
                                        </button>
                                    </div>

                                    <!-- DROPDOWN SELECT EXISTING REGISTERED CUSTOMER -->
                                    <div class="existing-cust-select-row" style="margin-bottom: 8px;">
                                        <label style="font-size: 11px; font-weight: 800; color: #0369a1; display: block; margin-bottom: 3px;">
                                            👤 Select Existing Registered Customer:
                                        </label>
                                        <select class="existing-cust-dropdown" id="selectExistingCust_${seatNo}" style="width: 100%; padding: 8px; border-radius: 8px; border: 1.5px solid #0284c7; font-size: 12px; font-weight: 700; color: #0f172a; background: #ffffff;">
                                            <option value="">-- Select Existing Customer from Database --</option>
                                            ${registeredCustomersList.map(c => `
                                                <option value="${c.passengerId}" ${pass.passengerId === c.passengerId ? 'selected' : ''}>
                                                    ID: ${c.passengerId} | ${c.passengerName} (${c.mobileNo}) - ${c.memberTier || 'Standard'} [Passport: ${c.passportNo || 'N/A'}]
                                                </option>
                                            `).join('')}
                                        </select>
                                    </div>

                                    <!-- PASSPORT / NAME / MOBILE AUTO-SUGGEST SEARCH INPUT -->
                                    <div class="seat-cust-search-row">
                                        <label style="font-size: 11px; font-weight: 700; color: #475569; display: block; margin-bottom: 2px;">
                                            🔍 Or Search Passport / Customer:
                                        </label>
                                        <input type="text" class="passport-search-input" id="passportSearch_${seatNo}" placeholder="Type Passport No, Name or Mobile..." value="${pass.passportNo && pass.passportNo !== 'N/A' ? pass.passportNo + ' (' + pass.passengerName + ')' : pass.passengerName}" autocomplete="off">
                                        <div class="search-suggestions-box" id="suggestionsBox_${seatNo}" style="display: none;"></div>
                                    </div>

                                    <!-- SELECTED PASSENGER SUMMARY INFO BOX -->
                                    <div class="seat-pass-info-box" id="seatInfoBox_${seatNo}">
                                        <div>
                                            <b>${pass.passengerName}</b> (${pass.mobileNo || 'No Mobile'}) <span style="font-size:11px; color:#64748b;">| Passport: ${pass.passportNo || 'N/A'}</span>
                                        </div>
                                        <span class="suggestion-badge" style="background:${discPct > 0 ? '#dcfce7' : '#f1f5f9'}; color:${discPct > 0 ? '#15803d' : '#475569'};">
                                            ${pass.memberTier || 'Standard'} (${discPct}% Off)
                                        </span>
                                    </div>

                                    <!-- INLINE REGISTRATION FORM FOR THIS SEAT (MATCHES REGD CUSTOMER FORM MENU) -->
                                    <div class="seat-reg-form" id="seatRegForm_${seatNo}" style="display: none; background: #f8fafc; border: 1.5px solid #0284c7; border-radius: 12px; padding: 14px; margin-top: 10px;">
                                        <div style="font-size: 13px; font-weight: 800; color: #0284c7; margin-bottom: 10px; display: flex; align-items: center; gap: 6px;">
                                            <span>➕</span> Register New Customer for Seat ${seatNo}
                                        </div>

                                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 8px;">
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 2px;">Passenger Name *</label>
                                                <input type="text" id="regName_${seatNo}" placeholder="Enter Full Name" value="${pass.passengerName || ''}" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 600;">
                                            </div>
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 2px;">Gender *</label>
                                                <select id="regGender_${seatNo}" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 600; background: #fff;">
                                                    <option value="MALE" ${pass.gender === 'MALE' || pass.gender === 'M' ? 'selected' : ''}>MALE</option>
                                                    <option value="FEMALE" ${pass.gender === 'FEMALE' || pass.gender === 'F' ? 'selected' : ''}>FEMALE</option>
                                                    <option value="OTHER" ${pass.gender === 'OTHER' || pass.gender === 'O' ? 'selected' : ''}>OTHER</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 2px;">Date of Birth *</label>
                                                <input type="date" id="regDob_${seatNo}" value="${pass.dob || '1995-05-15'}" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 600;">
                                            </div>
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 2px;">Mobile Number *</label>
                                                <input type="number" id="regMobile_${seatNo}" placeholder="10 digit mobile number" value="${pass.mobileNo || ''}" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 600;">
                                            </div>
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 2px;">Email Address *</label>
                                                <input type="email" id="regEmail_${seatNo}" placeholder="customer@example.com" value="${pass.emailId || ''}" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 600;">
                                            </div>
                                            <div>
                                                <label style="font-size: 11px; font-weight: 700; color: #0f172a; display: block; margin-bottom: 2px;">Passport Number *</label>
                                                <input type="text" id="regPassport_${seatNo}" placeholder="Enter Passport Number" value="${pass.passportNo || ''}" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid #cbd5e1; font-size: 11px; font-weight: 600;">
                                            </div>
                                        </div>

                                        <!-- MEMBERSHIP OPTION FIELD AT BOTTOM OF CUSTOMER REGISTRATION FORM -->
                                        <div class="membership-field-group" style="margin-top: 6px;">
                                            <label style="font-size: 11px; font-weight: 800; color: #0369a1; display: block; margin-bottom: 4px;">🏆 Select Frequent Flyer Membership Tier (Membership Fee & Discount):</label>
                                            <select id="regTier_${seatNo}" style="width: 100%; padding: 7px; border-radius: 6px; border: 1px solid #0284c7; font-size: 11px; font-weight: 800; color: #0f172a; background: #ffffff;">
                                                <option value="No Membership" ${(!pass.memberTier || pass.memberTier === 'No Membership') ? 'selected' : ''}>❌ No Membership (Regular Customer) — Free (₹0 Fee / 0% Discount)</option>
                                                <option value="Executive Platinum" ${pass.memberTier === 'Executive Platinum' ? 'selected' : ''}>🏅 Executive Platinum (15% Flight Discount) — Fee: ₹1,500/yr</option>
                                                <option value="Gold Elite" ${pass.memberTier === 'Gold Elite' ? 'selected' : ''}>🥇 Gold Elite (10% Flight Discount) — Fee: ₹1,000/yr</option>
                                                <option value="Silver Preferred" ${pass.memberTier === 'Silver Preferred' ? 'selected' : ''}>🥈 Silver Preferred (5% Flight Discount) — Fee: ₹500/yr</option>
                                                <option value="Standard" ${pass.memberTier === 'Standard' ? 'selected' : ''}>👤 Standard Customer (0% Discount) — Free (₹0)</option>
                                            </select>
                                        </div>

                                        <button type="button" class="save-seat-cust-btn" id="saveCustBtn_${seatNo}" style="margin-top: 10px;">
                                            Save Customer & Apply Membership
                                        </button>
                                        <div id="seatRegMsg_${seatNo}" style="font-size: 11px; margin-top: 6px;"></div>
                                    </div>
                                </div>
                            `;
                        });

                        inputsContainer.innerHTML = html;

                        // Event Listeners for each per-seat card
                        selectedSeatsMap.forEach((seatData, seatNo) => {
                            const existingSelect = document.getElementById(`selectExistingCust_${seatNo}`);
                            const toggleBtn = document.getElementById(`toggleSeatRegBtn_${seatNo}`);
                            const regForm = document.getElementById(`seatRegForm_${seatNo}`);
                            const searchInput = document.getElementById(`passportSearch_${seatNo}`);
                            const sugBox = document.getElementById(`suggestionsBox_${seatNo}`);
                            const saveBtn = document.getElementById(`saveCustBtn_${seatNo}`);
                            const msgDiv = document.getElementById(`seatRegMsg_${seatNo}`);

                            if (existingSelect) {
                                existingSelect.addEventListener("change", () => {
                                    const selectedId = parseInt(existingSelect.value);
                                    if (selectedId) {
                                        const matchedPass = registeredCustomersList.find(c => c.passengerId === selectedId);
                                        if (matchedPass) {
                                            seatPassengerMap.set(seatNo, { ...matchedPass });
                                            renderPerSeatPassengerCards();
                                            updatePriceCalculations();
                                        }
                                    }
                                });
                            }

                            if (toggleBtn && regForm) {
                                toggleBtn.addEventListener("click", () => {
                                    regForm.style.display = regForm.style.display === "none" ? "block" : "none";
                                });
                            }

                            // Auto-suggest Passport / Name Search
                            if (searchInput && sugBox) {
                                searchInput.addEventListener("input", () => {
                                    const query = searchInput.value.trim().toLowerCase();
                                    if (!query) {
                                        sugBox.style.display = "none";
                                        return;
                                    }

                                    const matches = registeredCustomersList.filter(c =>
                                        (c.passportNo || '').toLowerCase().includes(query) ||
                                        (c.passengerName || '').toLowerCase().includes(query) ||
                                        (c.mobileNo || '').includes(query) ||
                                        (c.passengerId + '').includes(query)
                                    );

                                    if (matches.length > 0) {
                                        sugBox.innerHTML = matches.map(c => `
                                            <div class="suggestion-item" data-id="${c.passengerId}">
                                                <div>
                                                    <b>${c.passportNo || 'No Passport'}</b> - ${c.passengerName} (${c.mobileNo})
                                                </div>
                                                <span class="suggestion-badge">${c.memberTier || 'Standard'}</span>
                                            </div>
                                        `).join('');

                                        sugBox.style.display = "block";

                                        sugBox.querySelectorAll(".suggestion-item").forEach(item => {
                                            item.addEventListener("click", () => {
                                                const pId = parseInt(item.dataset.id);
                                                const matchedPass = registeredCustomersList.find(c => c.passengerId === pId);
                                                if (matchedPass) {
                                                    seatPassengerMap.set(seatNo, { ...matchedPass });
                                                    sugBox.style.display = "none";
                                                    renderPerSeatPassengerCards();
                                                    updatePriceCalculations();
                                                }
                                            });
                                        });
                                    } else {
                                        sugBox.innerHTML = `<div style="padding:8px 12px; font-size:11px; color:#64748b;">No matching customer. Click 'Register Customer' to add new.</div>`;
                                        sugBox.style.display = "block";
                                    }
                                });

                                document.addEventListener("click", (e) => {
                                    if (!searchInput.contains(e.target) && !sugBox.contains(e.target)) {
                                        sugBox.style.display = "none";
                                    }
                                });
                            }

                            // Save customer & membership to DB
                            if (saveBtn) {
                                saveBtn.addEventListener("click", async () => {
                                    const nameVal = document.getElementById(`regName_${seatNo}`)?.value.trim();
                                    const genderVal = document.getElementById(`regGender_${seatNo}`)?.value || 'MALE';
                                    const dobVal = document.getElementById(`regDob_${seatNo}`)?.value || '1995-05-15';
                                    const mobVal = document.getElementById(`regMobile_${seatNo}`)?.value.trim();
                                    const emailVal = document.getElementById(`regEmail_${seatNo}`)?.value.trim() || 'customer@example.com';
                                    const passportVal = document.getElementById(`regPassport_${seatNo}`)?.value.trim() || 'N/A';
                                    const tierVal = document.getElementById(`regTier_${seatNo}`)?.value || 'Executive Platinum';

                                    if (!nameVal || !mobVal) {
                                        if (msgDiv) {
                                            msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> Passenger Name and Mobile Number are required!`;
                                            msgDiv.style.color = "#dc2626";
                                        }
                                        return;
                                    }

                                    const tierFees = {
                                        "Executive Platinum": 1500,
                                        "Gold Elite": 1000,
                                        "Silver Preferred": 500
                                    };
                                    const fee = tierFees[tierVal] || 0;
                                    if (fee > 0) {
                                        const confirmPay = confirm(`Membership Fee Confirmation:\n\nThe selected membership tier '${tierVal}' is not assigned for free. An annual membership fee of \u20B9${fee.toLocaleString('en-IN')} is required.\n\nDo you want to collect cash payment of \u20B9${fee.toLocaleString('en-IN')} and activate this membership?`);
                                        if (!confirmPay) {
                                            return;
                                        }
                                    }

                                    saveBtn.disabled = true;
                                    saveBtn.textContent = "\u23F3 Saving...";

                                    try {
                                        const regRes = await fetch("/api/registered-passengers/register", {
                                            method: "POST",
                                            headers: { "Content-Type": "application/json" },
                                            body: JSON.stringify({
                                                passengerName: nameVal,
                                                gender: genderVal,
                                                dob: dobVal,
                                                mobileNo: mobVal,
                                                emailId: emailVal,
                                                passportNo: passportVal,
                                                memberTier: tierVal
                                            }),
                                            credentials: "same-origin"
                                        });

                                        const regData = await regRes.json();
                                        if (regRes.ok && regData.passenger) {
                                            const p = regData.passenger;
                                            registeredCustomersList.push(p);
                                            seatPassengerMap.set(seatNo, { ...p });

                                            if (msgDiv) {
                                                msgDiv.textContent = ` ${p.passengerName} registered successfully with ${p.memberTier}!`;
                                                msgDiv.style.color = "#16a34a";
                                            }

                                            regForm.style.display = "none";
                                            renderPerSeatPassengerCards();
                                            updatePriceCalculations();
                                        } else {
                                            if (msgDiv) {
                                                msgDiv.innerHTML = `&times; ${regData.message || 'Error registering customer'}`;
                                                msgDiv.style.color = "#dc2626";
                                            }
                                        }
                                    } catch (err) {
                                        console.error("Error saving seat customer:", err);
                                    } finally {
                                        saveBtn.disabled = false;
                                        saveBtn.textContent = "Save Customer & Apply Membership";
                                    }
                                });
                            }
                        });
                    };

                    const updatePriceCalculations = () => {
                        let totalDiscountAmount = 0;
                        let netTotalFare = 0;

                        selectedSeatsMap.forEach((seatData, seatNo) => {
                            const pass = seatPassengerMap.get(seatNo) || {};
                            const discPct = getTierDiscountPct(pass.memberTier);
                            const seatDiscount = (seatData.finalPrice * discPct) / 100.0;
                            const seatNet = Math.max(0, seatData.finalPrice - seatDiscount);

                            totalDiscountAmount += seatDiscount;
                            netTotalFare += seatNet;
                        });

                        currentNetPayable = netTotalFare;

                        if (subtotalText) subtotalText.textContent = `\u20B9${baseTotal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                        if (discountValText) discountValText.textContent = `-\u20B9${totalDiscountAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                        if (netPayableText) netPayableText.textContent = `\u20B9${netTotalFare.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                        if (cashPaidInput) cashPaidInput.value = currentNetPayable;

                        updateCashReturn();
                    };

                    const updateCashReturn = () => {
                        if (!cashPaidInput || !cashChangeInput) return;
                        const paidAmount = parseFloat(cashPaidInput.value) || 0;
                        const changeVal = Math.max(0, paidAmount - currentNetPayable);
                        cashChangeInput.value = `\u20B9${changeVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
                    };

                    renderPerSeatPassengerCards();
                    updatePriceCalculations();

                    if (cashPaidInput) cashPaidInput.addEventListener("input", updateCashReturn);

                    // WHEN PAID BUTTON IS CLICKED -> SET STATUS TO PAID AND GENERATE TICKET PDF
                    if (paidSubmitBtn) {
                        paidSubmitBtn.addEventListener("click", async () => {
                            const howMuchPaid = parseFloat(cashPaidInput ? cashPaidInput.value : currentNetPayable) || currentNetPayable;
                            if (howMuchPaid < currentNetPayable) {
                                alert(`Paid amount (₹${howMuchPaid}) cannot be less than Net Payable Fare (₹${currentNetPayable})!`);
                                return;
                            }

                            paidSubmitBtn.disabled = true;
                            paidSubmitBtn.textContent = "\u23F3 Generating Ticket PDF & Reserving Seats...";

                            const liveBookingTimeStr = new Date().toLocaleString('en-US', { year: 'numeric', month: 'short', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });

                            const bookedPnrs = [];
                            const ticketPassengerList = [];

                            const bookingPromises = Array.from(selectedSeatsMap.entries()).map(async ([seatNo, seatData]) => {
                                try {
                                    const pass = seatPassengerMap.get(seatNo) || {};
                                    const discPct = getTierDiscountPct(pass.memberTier);
                                    const seatDiscount = (seatData.finalPrice * discPct) / 100.0;
                                    const seatNetPrice = Math.max(0, seatData.finalPrice - seatDiscount);

                                    const bookRes = await fetch("/api/ticket-booking/book-seat", {
                                        method: "POST",
                                        headers: { "Content-Type": "application/json" },
                                        body: JSON.stringify({
                                            dynamicPriceId: targetId,
                                            passengerId: pass.passengerId || 10000001,
                                            seatNo: seatNo,
                                            finalSeatPrice: seatNetPrice,
                                            discountAmount: seatDiscount,
                                            memberTier: pass.memberTier || "Standard",
                                            paymentMethod: "CASH",
                                            amountPaid: howMuchPaid,
                                            bookingTimestamp: liveBookingTimeStr
                                        }),
                                        credentials: "same-origin"
                                    });

                                    const bookData = await bookRes.json();
                                    if (bookRes.ok) {
                                        const finalPnr = bookData.pnrNo || ("PNR" + Math.floor(10000 + Math.random() * 90000));
                                        bookedPnrs.push(`${seatNo}: ${finalPnr}`);
                                        ticketPassengerList.push({
                                            seatNo: seatNo,
                                            pnrNo: finalPnr,
                                            passengerName: pass.passengerName || "Passenger",
                                            mobileNo: pass.mobileNo || "N/A",
                                            passportNo: pass.passportNo || "N/A",
                                            memberTier: pass.memberTier || "Standard",
                                            discountAmount: seatDiscount,
                                            seatClass: seatData.seatClass,
                                            finalPrice: seatNetPrice
                                        });

                                        if (!window._aos_bookedSeatsSet) window._aos_bookedSeatsSet = new Set();
                                        window._aos_bookedSeatsSet.add(String(seatNo).trim().toUpperCase());

                                        if (seatData.btnElement) {
                                            seatData.btnElement.classList.remove('in-transition', 'selected', 'available');
                                            seatData.btnElement.classList.add('booked');
                                            seatData.btnElement.disabled = true;
                                            seatData.btnElement.style.pointerEvents = 'none';
                                            seatData.btnElement.style.opacity = '0.85';
                                            seatData.btnElement.innerHTML = `<span style="font-size:13px; font-weight:900; color:#dc2626;">X</span>`;
                                        }
                                    }
                                } catch (err) {
                                    console.error("Error booking seat:", err);
                                }
                            });

                            await Promise.all(bookingPromises);

                            if (bookedPnrs.length > 0) {
                                modalOverlay.remove();
                                if (bookingMsg) {
                                    bookingMsg.textContent = ` Tickets Issued & Confirmed! PNRs: ${bookedPnrs.join(" | ")}`;
                                    bookingMsg.className = "form-message success";
                                }

                                const primaryPass = ticketPassengerList[0] || {};

                                // GENERATE PLANE TICKET PDF / E-TICKET BOARDING PASS MODAL
                                showPlaneTicketModal({
                                    pnrNo: primaryPass.pnrNo || "AOS-98412",
                                    flightNo: fd.flightNo || "6E 532",
                                    companyName: fd.companyName || "IndiGo / AOS Airlines",
                                    flightName: fd.flightName || "Airbus A320",
                                    sourceCode: fd.sourceCode || "DEL",
                                    destCode: fd.destCode || "BOM",
                                    sourceCity: fd.sourceCity || "Delhi",
                                    destCity: fd.destCity || "Mumbai",
                                    flightDate: fd.flightDate || "2026-08-15",
                                    departureTime: fd.departureTime || "08:00 AM",
                                    arrivalTime: fd.arrivalTime || "10:30 AM",
                                    bookingTimestamp: liveBookingTimeStr,
                                    primaryCustName: primaryPass.passengerName,
                                    primaryCustId: primaryPass.passengerId,
                                    primaryCustMobile: primaryPass.mobileNo,
                                    primaryCustTier: primaryPass.memberTier,
                                    passengers: ticketPassengerList,
                                    baseTotal: baseTotal,
                                    discountVal: baseTotal - currentNetPayable,
                                    netPayable: currentNetPayable,
                                    howMuchPaid: howMuchPaid,
                                    paymentMethod: "CASH",
                                    paymentStatus: "PAID"
                                });

                                loadSeatMap(targetId);
                            } else {
                                alert(" Booking failed for selected seats.");
                                paidSubmitBtn.disabled = false;
                                paidSubmitBtn.innerHTML = `Paid & Generate Ticket PDF <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg>`;
                            }
                        });
                    }
                }); // END proceedBtn listener
            } // END if (proceedBtn)
        } // END renderSeatMapUI

        // Render default seat matrix
        // Find selected plane & date schedule to populate initial dynamic flight info
        const regPlanes = window._aos_registeredPlanes || [];
        const scheduleList = window._aos_sysdateDaysList || [];

        const selectedPlane = (regPlanes && regPlanes.length > 0)
            ? regPlanes.find(p => p.dynamicPriceId === targetId)
            : null;

        const selectedSchedule = (scheduleList && scheduleList.length > 0)
            ? scheduleList.find(p => p.dynamicPriceId === targetId)
            : null;

        const activeTab = document.querySelector(".date-schedule-tab.active");
        const activeTabDateText = activeTab ? activeTab.querySelector(".tab-date")?.textContent?.replace('<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', '')?.trim() : null;

        const initialFd = {
            dynamicPriceId: targetId,
            flightNo: selectedPlane?.flightNo || selectedSchedule?.flightNo || "AI-101",
            flightName: selectedPlane?.flightName || "Airbus A320 Neo",
            companyName: selectedPlane?.companyName || selectedSchedule?.companyName || "Air India",
            sourceCode: selectedPlane?.sourceCode || selectedSchedule?.sourceAirportCode || "BBI",
            sourceCity: selectedPlane?.sourceCode || "Bhubaneswar",
            destCode: selectedPlane?.destCode || selectedSchedule?.destAirportCode || "DEL",
            destCity: selectedPlane?.destCode || "Delhi",
            flightDate: selectedSchedule?.flightDate || selectedPlane?.flightDate || activeTabDateText || new Date().toISOString().split('T')[0],
            currentPrice: selectedPlane?.currentPrice || selectedSchedule?.currentPrice || 3500.0,
            availableSeats: selectedPlane?.availableSeats || selectedSchedule?.availableSeats || 180,
            totalSeats: selectedPlane?.totalSeats || selectedSchedule?.totalSeats || 180
        };

        const defaultSeats = [];
        const cols = ['A', 'B', 'C', 'D', 'E', 'F'];
        for (let r = 1; r <= 20; r++) {
            for (let col of cols) {
                const isBusiness = r <= 3;
                const seatType = (col === 'A' || col === 'F') ? 'WINDOW' : ((col === 'C' || col === 'D') ? 'AISLE' : 'MIDDLE');
                const seatClass = isBusiness ? 'BUSINESS' : 'ECONOMY';
                defaultSeats.push({
                    seatNo: `${r}${col}`,
                    row: r,
                    col: col,
                    seatClass: seatClass,
                    seatType: seatType,
                    priceSurcharge: isBusiness ? 2500 : 0,
                    status: 'AVAILABLE',
                    finalPrice: isBusiness ? (initialFd.currentPrice + 2500.0) : initialFd.currentPrice
                });
            }
        }

        // Fetch booked seats set FIRST before rendering initial UI
        try {
            const bookedRes = await fetch(`/api/booked-seat-list/${targetId}`, { credentials: "same-origin" });
            if (bookedRes.ok) {
                const bookedData = await bookedRes.json();
                const list = bookedData.bookedSeats || [];
                window._aos_bookedSeatsSet = new Set(list.map(s => String(s).trim().toUpperCase()));
            }
        } catch (bookedErr) {
            console.warn("[AOS] Could not fetch booked seat list:", bookedErr);
        }

        renderSeatMapUI(initialFd, defaultSeats, registeredCustomersList);

        try {
            const res = await fetch(`/api/flight-seats/${targetId}`, { credentials: "same-origin" });
            if (res.ok) {
                const data = await res.json();
                const realFd = Object.assign({}, initialFd, data.flightDetails || {});
                const realSeats = (data.seats && data.seats.length > 0) ? data.seats : defaultSeats;
                renderSeatMapUI(realFd, realSeats, registeredCustomersList);
            }
        } catch (err) {
            console.warn("Could not fetch flight seats from API, keeping initial dynamic matrix:", err);
        }
    } // END renderSeatMapBookingView


    // FUNCTION TO DISPLAY OFFICIAL PRINTABLE E-TICKET & BOARDING PASS MODAL
    function showPlaneTicketModal(t) {
        const existingTicket = document.getElementById("planeTicketOverlay");
        if (existingTicket) existingTicket.remove();

        // Calculate dynamic valid boarding time (45 minutes prior to flight departure, or sysdate time)
        const calcBoardingTime = (depStr) => {
            if (depStr) {
                const match = String(depStr).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
                if (match) {
                    let h = parseInt(match[1], 10);
                    let m = parseInt(match[2], 10);
                    const ap = match[3] ? match[3].toUpperCase() : null;
                    if (ap === 'PM' && h < 12) h += 12;
                    if (ap === 'AM' && h === 12) h = 0;

                    const d = new Date();
                    d.setHours(h, m, 0);
                    d.setMinutes(d.getMinutes() - 45);
                    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
                }
            }
            const now = new Date();
            return now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
        };

        const boardingTimeVal = calcBoardingTime(t.departureTime);
        const primaryCustIdVal = t.primaryCustId || 10000001;

        const seatNumbersStr = t.passengers.map(p => p.seatNo).join(", ");
        const passengersRows = t.passengers.map(p => `
            <div style="display: flex; justify-content: space-between; font-size: 12px; color: #0f172a; padding: 4px 0; border-bottom: 1px solid #e2e8f0;">
                <span><b>Seat ${p.seatNo}</b> - ${p.passengerName} (${p.seatClass})</span>
                <span style="font-weight: 700;">PNR: ${p.pnrNo} | \u20B9${p.finalPrice.toLocaleString('en-IN')}</span>
            </div>
        `).join('');

        const totalPayableVal = t.totalPayable || t.netPayable || t.baseTotal || 0;
        const howMuchPaidVal = t.howMuchPaid || totalPayableVal;
        const changeAmount = Math.max(0, howMuchPaidVal - totalPayableVal);

        const ticketHtml = `
            <div class="plane-ticket-overlay" id="planeTicketOverlay">
                <div class="plane-boarding-pass-card">
                    <!-- HEADER STRIP -->
                    <div class="ticket-header-strip">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="font-size: 28px;">✈️</div>
                            <div>
                                <div style="font-size: 18px; font-weight: 900; letter-spacing: 1px;">AOS AIRLINES</div>
                                <div style="font-size: 11px; opacity: 0.85;">Official Flight E-Ticket & Boarding Pass</div>
                            </div>
                        </div>
                        <div style="text-align: right;">
                            <div style="font-size: 10px; opacity: 0.8; text-transform: uppercase;">Booking Reference (PNR)</div>
                            <div class="ticket-pnr-badge">${t.pnrNo}</div>
                        </div>
                    </div>

                    <!-- MAIN TICKET CONTENT -->
                    <div class="ticket-body-grid">
                        <div class="ticket-main-section">
                            <!-- ROUTE DISPLAY -->
                            <div class="ticket-route-display">
                                <div style="text-align: center;">
                                    <div class="ticket-city-code">${t.sourceCode}</div>
                                    <div style="font-size: 11px; font-weight: 700; color: #64748b;">${t.sourceCity}</div>
                                </div>
                                <div style="text-align: center; flex: 1; padding: 0 16px;">
                                    <div style="font-size: 11px; font-weight: 800; color: #0284c7;">${t.flightNo} (${t.flightName})</div>
                                    <div style="border-top: 2px dashed #0284c7; margin: 6px 0; position: relative;">
                                        <span style="position: absolute; top: -10px; left: 45%; background: #f1f5f9; padding: 0 4px; font-size: 12px;">✈️</span>
                                    </div>
                                    <div style="font-size: 10px; color: #64748b;">Non-stop Direct Flight</div>
                                </div>
                                <div style="text-align: center;">
                                    <div class="ticket-city-code">${t.destCode}</div>
                                    <div style="font-size: 11px; font-weight: 700; color: #64748b;">${t.destCity}</div>
                                </div>
                            </div>

                            <!-- FLIGHT INFO GRID -->
                            <div class="ticket-info-grid">
                                <div class="ticket-field">
                                    <span class="ticket-label">Flight Date</span>
                                    <span class="ticket-val">${t.flightDate}</span>
                                </div>
                                <div class="ticket-field">
                                    <span class="ticket-label">Departure</span>
                                    <span class="ticket-val">${t.departureTime}</span>
                                </div>
                                <div class="ticket-field">
                                    <span class="ticket-label">Arrival</span>
                                    <span class="ticket-val">${t.arrivalTime}</span>
                                </div>
                                <div class="ticket-field">
                                    <span class="ticket-label">Gate / Terminal</span>
                                    <span class="ticket-val">Gate T2-04</span>
                                </div>
                                <div class="ticket-field">
                                    <span class="ticket-label">Baggage Allowance</span>
                                    <span class="ticket-val">25 Kg Check-in</span>
                                </div>
                                <div class="ticket-field">
                                    <span class="ticket-label">Booking Time</span>
                                    <span class="ticket-val" style="font-size: 11px;">${t.bookingTimestamp}</span>
                                </div>
                            </div>

                            <!-- PASSENGERS & SEATS SECTION -->
                            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; margin-bottom: 16px;">
                                <div style="font-size: 11px; font-weight: 800; color: #475569; text-transform: uppercase; margin-bottom: 6px;">
                                    👥 Registered Customer & Passenger Roster
                                </div>
                                <div style="font-size: 12px; font-weight: 800; color: #0284c7; margin-bottom: 4px;">
                                    Registered Booked By: ${t.primaryCustName} (ID: ${primaryCustIdVal} | Mobile: ${t.primaryCustMobile || 'N/A'})
                                </div>
                                ${passengersRows}
                            </div>

                            <!-- CASH RECEIPT & BILL BREAKDOWN -->
                            <div style="background: #f0fdf4; border: 1.5px solid #059669; border-radius: 10px; padding: 12px; display: flex; justify-content: space-between; align-items: center;">
                                <div>
                                    <div style="font-size: 11px; font-weight: 800; color: #065f46; text-transform: uppercase;">Financial Cash Receipt & Invoice</div>
                                    <div style="font-size: 12px; color: #047857; margin-top: 2px;">
                                        Payment Method: <b>${t.paymentMethod}</b> | Total Fare: <b>\u20B9${totalPayableVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>
                                    </div>
                                    <div style="font-size: 11px; color: #047857;">
                                        Cash Received: <b>\u20B9${howMuchPaidVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b> | Change Returned: <b>\u20B9${changeAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>
                                    </div>
                                </div>
                                <div class="ticket-paid-stamp">
                                    PAID <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                                </div>
                            </div>
                        </div>

                        <!-- TICKET STUB / BOARDING PASS SIDEBAR -->
                        <div class="ticket-stub-section">
                            <div>
                                <div style="font-size: 12px; font-weight: 900; color: #0f172a; border-bottom: 2px solid #0f172a; padding-bottom: 4px; margin-bottom: 12px;">
                                    BOARDING PASS
                                </div>
                                <div class="ticket-field" style="margin-bottom: 10px;">
                                    <span class="ticket-label">Passenger</span>
                                    <span class="ticket-val">${t.primaryCustName}</span>
                                </div>
                                <div class="ticket-field" style="margin-bottom: 10px;">
                                    <span class="ticket-label">Flight</span>
                                    <span class="ticket-val">${t.flightNo}</span>
                                </div>
                                <div class="ticket-field" style="margin-bottom: 10px;">
                                    <span class="ticket-label">Seat(s)</span>
                                    <span class="ticket-val" style="font-size: 18px; color: #0284c7;">${seatNumbersStr}</span>
                                </div>
                                <div class="ticket-field" style="margin-bottom: 10px;">
                                    <span class="ticket-label">Boarding Time</span>
                                    <span class="ticket-val">${boardingTimeVal}</span>
                                </div>
                            </div>

                            <!-- BARCODE GRAPHIC -->
                            <div style="text-align: center; margin-top: 16px;">
                                <div style="font-family: monospace; font-size: 24px; letter-spacing: 4px; font-weight: 900; color: #0f172a; user-select: none;">
                                    |||||||||||||||||||||||||
                                </div>
                                <div style="font-size: 9px; color: #64748b; font-weight: 700; margin-top: 2px;">PNR: ${t.pnrNo} | SECURITY VERIFIED</div>
                            </div>
                        </div>
                    </div>

                    <!-- FOOTER ACTION BAR -->
                    <div class="ticket-footer-bar">
                        <div style="font-size: 11px; color: #64748b; font-weight: 700;">
                            AOS Operations Suite - Official Boarding Pass & Tax Invoice
                        </div>
                        <div style="display: flex; gap: 10px;">
                            <button id="downloadPlaneTicketPdfBtn" style="padding: 9px 18px; border-radius: 8px; border: none; background: #16a34a; color: #fff; font-weight: 900; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px; box-shadow: 0 4px 12px rgba(22, 163, 74, 0.35);">
                                <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Download Boarding Pass PDF
                            </button>
                            <button id="printPlaneTicketBtn" style="padding: 9px 18px; border-radius: 8px; border: none; background: #0284c7; color: #fff; font-weight: 800; font-size: 13px; cursor: pointer; display: flex; align-items: center; gap: 6px;">
                                <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>\uFE0F Print Ticket
                            </button>
                            <button id="closePlaneTicketBtn" style="padding: 9px 16px; border-radius: 8px; border: 1px solid #cbd5e1; background: #ffffff; color: #334155; font-weight: 800; font-size: 13px; cursor: pointer;">
                                Close Ticket
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        document.body.insertAdjacentHTML("beforeend", ticketHtml);

        document.getElementById("closePlaneTicketBtn")?.addEventListener("click", () => {
            document.getElementById("planeTicketOverlay")?.remove();
        });

        const triggerPdfDownload = () => {
            const ticketCard = document.querySelector(".plane-boarding-pass-card");
            if (!ticketCard) return;

            const footerBar = ticketCard.querySelector(".ticket-footer-bar");
            if (footerBar) footerBar.style.display = "none"; // Hide action buttons in PDF document

            if (typeof html2pdf !== 'undefined') {
                const btn = document.getElementById("downloadPlaneTicketPdfBtn");
                if (btn) btn.textContent = "⏳ Downloading PDF...";

                const opt = {
                    margin: [0.15, 0.15, 0.15, 0.15],
                    filename: `BoardingPass_${t.pnrNo || 'TICKET'}.pdf`,
                    image: { type: 'jpeg', quality: 0.92 },
                    html2canvas: { scale: 1.2, useCORS: true, logging: false, allowTaint: true },
                    jsPDF: { unit: 'in', format: 'letter', orientation: 'landscape' }
                };

                html2pdf().set(opt).from(ticketCard).save().then(() => {
                    if (footerBar) footerBar.style.display = "flex"; // Restore buttons in modal UI
                    if (btn) btn.textContent = "✅ PDF Downloaded!";
                    setTimeout(() => {
                        if (btn) btn.textContent = "📥 Download Boarding Pass PDF";
                    }, 3000);
                }).catch(err => {
                    if (footerBar) footerBar.style.display = "flex";
                    console.error("PDF generation error:", err);
                    window.print();
                });
            } else {
                if (footerBar) footerBar.style.display = "flex";
                window.print();
            }
        };

        document.getElementById("downloadPlaneTicketPdfBtn")?.addEventListener("click", triggerPdfDownload);

        document.getElementById("printPlaneTicketBtn")?.addEventListener("click", () => {
            const ticketCard = document.querySelector(".plane-boarding-pass-card");
            const footerBar = ticketCard ? ticketCard.querySelector(".ticket-footer-bar") : null;
            if (footerBar) footerBar.style.display = "none";
            window.print();
            setTimeout(() => {
                if (footerBar) footerBar.style.display = "flex";
            }, 1000);
        });
    }


    function renderCreateDynamicPriceForm() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        const todayStr = new Date().toISOString().split('T')[0];
        const nowStr = new Date().toISOString().slice(0, 16);

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>Flight Dynamic Pricing Management <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg></h1>
                <p>Configure dynamic pricing rules, seat capacities, departure & arrival times using procedure <code>AIRLINE_FLIGHT_DYNAMIC_PRICE_CREATE_USP</code>.</p>
            </div>

            <div class="form-container macOS-card">
                <form id="createDynamicPriceForm" class="mac-form">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Select Flight</label>
                            <select id="dpFlightSelect" required>
                                <option value="" disabled selected>Loading flights...</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label>Source Airport</label>
                            <select id="dpSourceAirportSelect" required>
                                <option value="" disabled selected>Loading airports...</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label>Destination Airport</label>
                            <select id="dpDestAirportSelect" required>
                                <option value="" disabled selected>Loading airports...</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label>Flight Date</label>
                            <input type="date" id="dpFlightDate" value="${todayStr}" required>
                        </div>

                        <div class="input-group">
                            <label>Departure Time</label>
                            <input type="datetime-local" id="dpDepartureTime" value="${nowStr}" required>
                        </div>

                        <div class="input-group">
                            <label>Arrival Time</label>
                            <input type="datetime-local" id="dpArrivalTime" value="${nowStr}" required>
                        </div>

                        <div class="input-group">
                            <label>Total Seats</label>
                            <input type="number" id="dpTotalSeats" value="180" min="1" max="1000" required>
                        </div>

                        <div class="input-group">
                            <label>Available Seats</label>
                            <input type="number" id="dpAvailableSeats" value="180" min="0" max="1000" required>
                        </div>

                        <div class="input-group full-width">
                            <label>Current Ticket Price (\u20B9)</label>
                            <input type="number" id="dpCurrentPrice" step="0.01" value="4500.00" placeholder="e.g. 4500.00" required>
                            <div id="dpRouteDistanceBadge" style="display: none; margin-top: 8px; font-size: 12px; background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 8px 12px; border-radius: 8px;"></div>
                        </div>
                    </div>

                    <div class="form-footer" style="margin-top: 15px;">
                        <button type="submit" class="submit-btn">Save Dynamic Price</button>
                    </div>
                </form>

                <div id="dpFormMessage" class="form-message"></div>
            </div>

            <div class="existing-cities-container macOS-card" style="margin-top: 24px; padding: 20px;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h3 style="font-weight: 600; font-size: 16px; margin: 0;">Dynamic Pricing Master Records <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>\uFE0F</h3>
                        <p style="font-size: 12px; color: var(--text-muted); margin: 2px 0 0 0;">Overview of active dynamic flight rates & seat availability</p>
                    </div>
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <input type="text" id="dpSearchInput" placeholder="Search flight, airport, city..." style="padding: 10px 14px; border-radius: 8px; border: 1px solid var(--border-input); font-size: 13px; outline: none; background: var(--bg-input); color: var(--text-input); min-width: 240px;">
                        <span id="dpCountBadge" class="badge blue" style="font-size: 12px;">0 Records</span>
                    </div>
                </div>

                <div class="table-responsive" style="overflow-x: auto;">
                    <table class="data-table mac-table" style="width: 100%; border-collapse: collapse;">
                        <thead>
                            <tr style="background: rgba(0, 122, 255, 0.05); text-align: left;">
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">ID</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Flight</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Airline Company</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Source Route</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Destination Route</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Flight Date</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Seats (Avail/Total)</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Price (\u20B9)</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Status</th>
                                <th style="padding: 12px 14px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="dpTableBody">
                            <tr>
                                <td colspan="10" style="text-align: center; padding: 24px; color: var(--text-muted);">Loading dynamic pricing records...</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const form = document.getElementById("createDynamicPriceForm");
        const flightSelect = document.getElementById("dpFlightSelect");
        const sourceSelect = document.getElementById("dpSourceAirportSelect");
        const destSelect = document.getElementById("dpDestAirportSelect");
        const flightDateInput = document.getElementById("dpFlightDate");
        const depTimeInput = document.getElementById("dpDepartureTime");
        const arrTimeInput = document.getElementById("dpArrivalTime");
        const totalSeatsInput = document.getElementById("dpTotalSeats");
        const availSeatsInput = document.getElementById("dpAvailableSeats");
        const currentPriceInput = document.getElementById("dpCurrentPrice");
        const msgDiv = document.getElementById("dpFormMessage");
        const tableBody = document.getElementById("dpTableBody");
        const searchInput = document.getElementById("dpSearchInput");
        const countBadge = document.getElementById("dpCountBadge");

        async function updateDistanceFare() {
            const srcId = sourceSelect.value;
            const dstId = destSelect.value;
            const routeBadge = document.getElementById("dpRouteDistanceBadge");

            if (srcId && dstId && srcId !== dstId) {
                try {
                    const res = await fetch(`/api/calculate-route-fare?sourceId=${srcId}&destId=${dstId}`);
                    const data = await res.json();
                    if (res.ok && data.suggestedPrice) {
                        currentPriceInput.value = data.suggestedPrice.toFixed(2);
                        if (routeBadge) {
                            routeBadge.style.display = "block";
                            routeBadge.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> <strong>Route Distance:</strong> ${data.distanceKm} km | <strong>Distance-Based Fare (\u20B9${data.ratePerKm}/km):</strong> <span style="color:#059669; font-weight:800;">\u20B9${data.suggestedPrice.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>`;
                        }
                    }
                } catch (e) {
                    console.warn("Distance fare error:", e);
                }
            }
        }

        sourceSelect.addEventListener("change", updateDistanceFare);
        destSelect.addEventListener("change", updateDistanceFare);

        let allDynamicPrices = [];

        function renderRows(records) {
            countBadge.textContent = `${records.length} Record${records.length === 1 ? '' : 's'}`;

            if (records && records.length > 0) {
                tableBody.innerHTML = records.map(r => `
                    <tr style="border-bottom: 1px solid rgba(0,0,0,0.05);">
                        <td style="padding: 12px 14px;"><strong>#${r.dynamicPriceId}</strong></td>
                        <td style="padding: 12px 14px;"><span class="badge blue" style="font-weight: 600;">${r.flightNo}</span><br><span style="font-size: 11px; color: var(--text-muted);">${r.flightName || ''}</span></td>
                        <td style="padding: 12px 14px; font-weight: 500;">${r.companyName || '\u2014'}</td>
                        <td style="padding: 12px 14px;"><span style="font-weight: 600; color: #0D8ABC;">${r.sourceAirportCode || r.sourceAirportId}</span><br><span style="font-size: 11px; color: var(--text-muted);">${r.sourceCityName || r.sourceAirportName || ''}</span></td>
                        <td style="padding: 12px 14px;"><span style="font-weight: 600; color: #FF9500;">${r.destAirportCode || r.destAirportId}</span><br><span style="font-size: 11px; color: var(--text-muted);">${r.destCityName || r.destAirportName || ''}</span></td>
                        <td style="padding: 12px 14px; font-size: 12px; white-space: nowrap;"><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${r.flightDate || ''}</td>
                        <td style="padding: 12px 14px;"><span class="badge green">${r.availableSeats} / ${r.totalSeats}</span></td>
                        <td style="padding: 12px 14px; font-weight: 700; color: #34C759;">\u20B9${Number(r.currentPrice).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</td>
                        <td style="padding: 12px 14px;"><span class="badge green">${r.isActive === 'Y' ? 'ACTIVE' : 'INACTIVE'}</span></td>
                        <td style="padding: 12px 14px;">
                            <button class="select-seats-btn" data-dpid="${r.dynamicPriceId}" style="padding: 6px 12px; border-radius: 6px; border: none; background: linear-gradient(135deg, #10b981 0%, #059669 100%); color: #fff; font-weight: 700; font-size: 12px; cursor: pointer; box-shadow: 0 2px 6px rgba(16,185,129,0.3);">
                                <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/></svg> Book Seats
                            </button>
                        </td>
                    </tr>
                `).join("");

                // Attach click listeners for Book Seats button
                tableBody.querySelectorAll(".select-seats-btn").forEach(btn => {
                    btn.addEventListener("click", (e) => {
                        const dpId = e.currentTarget.dataset.dpid;
                        if (dpId) {
                            renderSeatMapBookingView(parseInt(dpId));
                        }
                    });
                });
            } else {
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align: center; padding: 24px; color: var(--text-muted);">No dynamic pricing records found.</td>
                    </tr>
                `;
            }
        }

        if (searchInput) {
            searchInput.addEventListener("input", (e) => {
                const query = e.target.value.toLowerCase().trim();
                const filtered = allDynamicPrices.filter(r =>
                    String(r.dynamicPriceId).includes(query) ||
                    (r.flightNo || '').toLowerCase().includes(query) ||
                    (r.companyName || '').toLowerCase().includes(query) ||
                    (r.sourceAirportCode || '').toLowerCase().includes(query) ||
                    (r.sourceCityName || '').toLowerCase().includes(query) ||
                    (r.destAirportCode || '').toLowerCase().includes(query) ||
                    (r.destCityName || '').toLowerCase().includes(query) ||
                    (r.flightDate || '').toLowerCase().includes(query)
                );
                renderRows(filtered);
            });
        }

        async function loadDynamicPriceData() {
            try {
                const res = await fetch("/api/admin/create-dynamic-price", {
                    method: "GET",
                    credentials: "same-origin"
                });
                const data = await res.json();

                if (res.ok) {
                    if (data.flights && data.flights.length > 0) {
                        flightSelect.innerHTML = '<option value="" disabled selected>Select Flight</option>' +
                            data.flights.map(f => `<option value="${f.flightId}">${f.flightNo} - ${f.flightName || 'Flight'}</option>`).join("");
                    } else {
                        flightSelect.innerHTML = '<option value="" disabled>No flights found</option>';
                    }

                    if (data.airports && data.airports.length > 0) {
                        const airportOptions = '<option value="" disabled selected>Select Airport</option>' +
                            data.airports.map(a => `<option value="${a.airportId}">${a.airportCode} (${a.airportName} - ${a.cityName})</option>`).join("");
                        sourceSelect.innerHTML = airportOptions;
                        destSelect.innerHTML = airportOptions;
                    } else {
                        sourceSelect.innerHTML = '<option value="" disabled>No airports found</option>';
                        destSelect.innerHTML = '<option value="" disabled>No airports found</option>';
                    }

                    allDynamicPrices = data.dynamicPrices || [];
                    renderRows(allDynamicPrices);
                } else {
                    tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align: center; padding: 24px; color: #FF3B30; font-weight: 700;">
                            ⚠️ ${data.message || 'Unable to load dynamic pricing records.'}
                        </td>
                    </tr>
                `;
                }
            } catch (err) {
                console.error("Error loading dynamic price data:", err);
                tableBody.innerHTML = `
                    <tr>
                        <td colspan="10" style="text-align: center; padding: 24px; color: #FF3B30;">Failed to load dynamic price records.</td>
                    </tr>
                `;
            }
        }

        loadDynamicPriceData();

        form.onsubmit = async (e) => {
            e.preventDefault();

            const flightId = flightSelect.value;
            const sourceAirportId = sourceSelect.value;
            const destAirportId = destSelect.value;
            const flightDate = flightDateInput.value;
            const departureTime = depTimeInput.value;
            const arrivalTime = arrTimeInput.value;
            const totalSeats = totalSeatsInput.value;
            const availableSeats = availSeatsInput.value;
            const currentPrice = currentPriceInput.value;

            if (!flightId || !sourceAirportId || !destAirportId || !flightDate || !departureTime || !arrivalTime) {
                msgDiv.innerHTML = "&times; Please fill in all required fields.";
                msgDiv.className = "form-message error";
                return;
            }

            if (sourceAirportId === destAirportId) {
                msgDiv.innerHTML = "&times; Source and Destination airports cannot be the same.";
                msgDiv.className = "form-message error";
                return;
            }

            msgDiv.textContent = "Calling stored procedure AIRLINE_FLIGHT_DYNAMIC_PRICE_CREATE_USP...";
            msgDiv.className = "form-message info";

            try {
                const res = await fetch("/api/admin/create-dynamic-price", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        flightId: parseInt(flightId),
                        sourceAirportId: parseInt(sourceAirportId),
                        destAirportId: parseInt(destAirportId),
                        flightDate: flightDate,
                        departureTime: departureTime,
                        arrivalTime: arrivalTime,
                        totalSeats: parseInt(totalSeats),
                        availableSeats: parseInt(availableSeats),
                        currentPrice: parseFloat(currentPrice)
                    }),
                    credentials: "same-origin"
                });

                const result = await res.json();

                if (res.ok) {
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + (result.message || "Dynamic Price Saved Successfully!");
                    msgDiv.className = "form-message success";
                    if (result.dynamicPrices) {
                        allDynamicPrices = result.dynamicPrices;
                        renderRows(allDynamicPrices);
                    } else {
                        loadDynamicPriceData();
                    }
                } else {
                    msgDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ` + (result.message || "Failed to save dynamic price");
                    msgDiv.className = "form-message error";
                }
            } catch (err) {
                console.error("Save dynamic price error:", err);
                msgDiv.innerHTML = "&times; Server or connection error.";
                msgDiv.className = "form-message error";
            }
        };
    }

    function renderMessageCenterPage() {
        const mainContent = getMainContentEl();
        if (!mainContent) return;

        mainContent.innerHTML = `
            <div class="welcome-banner">
                <div class="banner-text">
                    <h1>Operational Messaging & Broadcast Portal <svg class="btn-svg" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></h1>
                    <p>Transmit instant role-targeted alerts, operational advisories, or company-wide announcements across AOS terminals.</p>
                </div>
            </div>

            <!-- Message Compose Form -->
            <div class="form-container macOS-card" style="margin-bottom: 28px;">
                <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    Compose Role Broadcast
                </h3>

                <form id="sendMessageForm" class="mac-form">
                    <div class="form-grid">
                        <div class="input-group">
                            <label>Target Recipient Role</label>
                            <select id="msgTargetRoleSelect" name="targetRole" required>
                                <option value="" disabled selected>Loading available roles...</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label>Priority Level</label>
                            <select id="msgPrioritySelect" name="priority">
                                <option value="NORMAL" selected>NORMAL - Standard Notice</option>
                                <option value="INFO">INFO - Operational Update</option>
                                <option value="IMPORTANT">IMPORTANT - Action Required</option>
                                <option value="URGENT">URGENT - Immediate Safety / Gate Alert</option>
                            </select>
                        </div>

                        <div class="input-group full-width">
                            <label>Broadcast Title / Subject</label>
                            <input type="text" id="msgTitleInput" name="title" placeholder="e.g., Gate Change Alert: Flight AOS-204 to Terminal 2B" required maxlength="180">
                        </div>

                        <div class="input-group full-width">
                            <label>Message Content &amp; Instructions</label>
                            <textarea id="msgBodyTextarea" name="body" placeholder="Type your detailed operational broadcast message here..." required rows="4" style="width: 100%; border-radius: 12px; padding: 12px 16px; background: rgba(255, 255, 255, 0.05); border: 1px solid rgba(255, 255, 255, 0.12); color: var(--text-main); font-family: inherit; font-size: 14px; resize: vertical;"></textarea>
                        </div>
                    </div>

                    <div id="msgStatusDiv" class="form-message" style="display: none; margin-top: 14px;"></div>

                    <div class="form-actions" style="margin-top: 20px; display: flex; justify-content: flex-end; gap: 12px;">
                        <button type="reset" class="submit-btn secondary" style="background: rgba(255, 255, 255, 0.08); color: var(--text-main); border: 1px solid rgba(255, 255, 255, 0.15);">Clear Fields</button>
                        <button type="submit" id="msgSubmitBtn" class="submit-btn" style="min-width: 180px;">
                            <svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                            <span>Send Broadcast</span>
                        </button>
                    </div>
                </form>
            </div>

            <!-- Broadcast History & Live Transmission Log -->
            <div class="table-container macOS-card">
                <div class="table-header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; flex-wrap: wrap; gap: 12px;">
                    <div>
                        <h3 style="font-size: 16px; font-weight: 700; color: var(--text-main); margin: 0;">Transmission Logs &amp; Sent Messages</h3>
                        <p style="font-size: 12.5px; color: var(--text-muted); margin: 4px 0 0;">Review all operational messages transmitted across AOS roles.</p>
                    </div>
                    <div style="display: flex; gap: 10px;">
                        <button id="refreshMsgBtn" class="submit-btn secondary" style="padding: 8px 14px; font-size: 12.5px; display: flex; align-items: center; gap: 6px;">
                            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                            Refresh
                        </button>
                    </div>
                </div>

                <div class="table-scroll-wrapper" style="overflow-x: auto;">
                    <table class="mac-table" id="messagesTable">
                        <thead>
                            <tr>
                                <th>ID</th>
                                <th>Sent Date &amp; Time</th>
                                <th>Target Role</th>
                                <th>Priority</th>
                                <th>Subject / Title</th>
                                <th>Message Details</th>
                                <th>Dispatched By</th>
                                <th style="text-align: center;">Action</th>
                            </tr>
                        </thead>
                        <tbody id="messagesTableBody">
                            <tr>
                                <td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">
                                    Loading broadcast logs...
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </div>
        `;

        const form = document.getElementById("sendMessageForm");
        const roleSelect = document.getElementById("msgTargetRoleSelect");
        const statusDiv = document.getElementById("msgStatusDiv");
        const submitBtn = document.getElementById("msgSubmitBtn");
        const tableBody = document.getElementById("messagesTableBody");
        const refreshBtn = document.getElementById("refreshMsgBtn");

        // 1. Fetch available roles
        async function loadRolesDropdown() {
            try {
                const res = await fetch("/api/messages/roles", { credentials: "same-origin" });
                if (res.ok) {
                    const data = await res.json();
                    const roles = data.roles || [];
                    roleSelect.innerHTML = `<option value="ALL ROLES" selected>ALL ROLES (Global Broadcast)</option>` +
                        roles.filter(r => r.roleName && !r.roleName.startsWith("ALL ROLES")).map(r => `<option value="${r.roleName}">${r.roleName}</option>`).join("");
                } else {
                    roleSelect.innerHTML = `
                        <option value="ALL ROLES" selected>ALL ROLES (Global Broadcast)</option>
                        <option value="PASSENGER">PASSENGER</option>
                        <option value="OPERATOR">OPERATOR</option>
                        <option value="GROUND STAFF">GROUND STAFF</option>
                        <option value="CABIN CREW">CABIN CREW</option>
                        <option value="PILOT / CAPTAIN">PILOT / CAPTAIN</option>
                        <option value="ADMIN">ADMIN</option>
                    `;
                }
            } catch (err) {
                console.error("Failed to load message roles:", err);
                roleSelect.innerHTML = `
                    <option value="ALL ROLES" selected>ALL ROLES (Global Broadcast)</option>
                    <option value="PASSENGER">PASSENGER</option>
                    <option value="OPERATOR">OPERATOR</option>
                    <option value="GROUND STAFF">GROUND STAFF</option>
                    <option value="CABIN CREW">CABIN CREW</option>
                `;
            }
        }

        // 2. Fetch and render messages log
        async function loadMessagesList() {
            try {
                tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: var(--text-muted);">Fetching messages...</td></tr>`;
                const res = await fetch("/api/messages/list", { credentials: "same-origin" });
                if (res.ok) {
                    const data = await res.json();
                    const msgs = data.messages || [];
                    if (msgs.length === 0) {
                        tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 28px; color: var(--text-muted);">No broadcast messages transmitted yet.</td></tr>`;
                        return;
                    }

                    tableBody.innerHTML = msgs.map(m => {
                        let prioColor = "#38BDF8";
                        let prioBg = "rgba(56, 189, 248, 0.15)";
                        const p = (m.priority || "NORMAL").toUpperCase();
                        if (p === "URGENT") { prioColor = "#EF4444"; prioBg = "rgba(239, 68, 68, 0.18)"; }
                        else if (p === "IMPORTANT") { prioColor = "#F59E0B"; prioBg = "rgba(245, 158, 11, 0.18)"; }
                        else if (p === "INFO") { prioColor = "#38BDF8"; prioBg = "rgba(56, 189, 248, 0.15)"; }
                        else { prioColor = "#10B981"; prioBg = "rgba(16, 185, 129, 0.15)"; }

                        const targetRole = m.targetRole || "ALL ROLES";
                        const isAll = targetRole.toUpperCase().includes("ALL");

                        return `
                            <tr>
                                <td style="font-weight: 700; color: var(--text-main);">#${m.messageId}</td>
                                <td style="color: var(--text-muted); font-size: 13px; white-space: nowrap;">${m.sentTime || 'Just now'}</td>
                                <td>
                                    <span class="user-role-badge" style="background: ${isAll ? 'rgba(168, 85, 247, 0.15)' : 'rgba(56, 189, 248, 0.15)'}; color: ${isAll ? '#C084FC' : '#38BDF8'}; border: 1px solid rgba(255, 255, 255, 0.1); font-weight: 700;">
                                        ${targetRole}
                                    </span>
                                </td>
                                <td>
                                    <span style="display: inline-block; padding: 3px 8px; border-radius: 6px; font-size: 11.5px; font-weight: 700; background: ${prioBg}; color: ${prioColor};">
                                        ${p}
                                    </span>
                                </td>
                                <td style="font-weight: 600; color: var(--text-main);">${m.title || 'No Title'}</td>
                                <td style="color: var(--text-muted); max-width: 320px; word-break: break-word; font-size: 13px;">${m.body || ''}</td>
                                <td style="font-size: 13px; color: var(--text-main); font-weight: 500;">
                                    ${(m.sender && !m.sender.toLowerCase().includes('dushmanta')) ? m.sender : 'Pratigayan Pattnaik'}
                                </td>
                                <td style="text-align: center;">
                                    <button class="delete-btn" onclick="window._aos_deleteMsg(${m.messageId})" title="Delete Message" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.3); color: #EF4444; border-radius: 6px; padding: 5px 10px; cursor: pointer; font-size: 12px; font-weight: 600;">
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        `;
                    }).join("");
                } else {
                    tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: #EF4444;">Failed to load messages (HTTP ${res.status}).</td></tr>`;
                }
            } catch (err) {
                console.error("Error loading messages list:", err);
                tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; padding: 24px; color: #EF4444;">Connection error loading messages.</td></tr>`;
            }
        }

        // Global delete handler
        window._aos_deleteMsg = async function(id) {
            if (!confirm(`Are you sure you want to remove message #${id}?`)) return;
            try {
                const res = await fetch(`/api/messages/delete/${id}`, { method: "POST", credentials: "same-origin" });
                const result = await res.json();
                if (res.ok) {
                    loadMessagesList();
                } else {
                    alert(result.message || "Failed to delete message");
                }
            } catch (err) {
                console.error("Delete message error:", err);
                alert("Server error deleting message.");
            }
        };

        if (refreshBtn) {
            refreshBtn.onclick = () => loadMessagesList();
        }

        // Form Submission
        if (form) {
            form.onsubmit = async (e) => {
                e.preventDefault();
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<span class="spinner" style="display:inline-block; width:14px; height:14px; border:2px solid #fff; border-top-color:transparent; border-radius:50%; animation: spin 0.6s linear infinite; margin-right:6px;"></span> Transmitting...`;

                const payload = {
                    targetRole: roleSelect.value || "ALL ROLES",
                    priority: document.getElementById("msgPrioritySelect").value || "NORMAL",
                    title: document.getElementById("msgTitleInput").value.trim(),
                    body: document.getElementById("msgBodyTextarea").value.trim()
                };

                try {
                    const res = await fetch("/api/messages/send", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        credentials: "same-origin",
                        body: JSON.stringify(payload)
                    });

                    const result = await res.json();
                    if (res.ok) {
                        statusDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg> ` + (result.message || "Broadcast transmitted successfully!");
                        statusDiv.className = "form-message success";
                        statusDiv.style.display = "block";
                        form.reset();
                        loadRolesDropdown();
                        loadMessagesList();
                        setTimeout(() => { statusDiv.style.display = "none"; }, 4500);
                    } else {
                        statusDiv.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg> ` + (result.message || "Failed to transmit message.");
                        statusDiv.className = "form-message error";
                        statusDiv.style.display = "block";
                    }
                } catch (err) {
                    console.error("Send message error:", err);
                    statusDiv.innerHTML = "&times; Server or network connection error.";
                    statusDiv.className = "form-message error";
                    statusDiv.style.display = "block";
                } finally {
                    submitBtn.disabled = false;
                    submitBtn.innerHTML = `<svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> <span>Send Broadcast</span>`;
                }
            };
        }

        loadRolesDropdown();
        loadMessagesList();
    }

    async function loadUserCards() {
        if (currentUser && (currentUser.role === 'PASSENGER' || currentUser.role === 'CUSTOMER')) {
            return;
        }

        const grid = document.getElementById("usersGrid");
        if (!grid) return;

        grid.innerHTML = `
            <div style="grid-column: 1/-1; text-align: center; padding: 30px; color: var(--text-muted);">
                Loading system user directory...
            </div>
        `;

        try {
            const res = await fetch("/api/users", { credentials: "same-origin" });
            if (!res.ok) {
                grid.innerHTML = `<div class="empty-search-state"><span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><p>Unable to load system users (HTTP ${res.status}).</p></div>`;
                return;
            }
            const data = await res.json();
            const users = Array.isArray(data) ? data : (data.users || []);

            if (Array.isArray(users) && users.length > 0) {
                allUsers = users;
                grid.innerHTML = users.map(u => {
                    const dbUserId = u.userId || u.USER_ID || u.dbUserId || u[0];
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

                    const myId = (currentUser && (currentUser.dbUserId || currentUser.userId)) ? (currentUser.dbUserId || currentUser.userId) : 10000001;
                    const isSelf = String(dbUserId) === String(myId);

                    const defaultAvatar = `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=${isSelf ? '007AFF' : '8E8E93'}&color=fff`;
                    const avatarSrc = photoUrl ? photoUrl : (passportImg ? `/api/passport-photo?id=${dbUserId}` : defaultAvatar);

                    let roleClass = 'user';
                    if (roleName.includes('ADMIN')) roleClass = 'admin';
                    else if (roleName.includes('OPERATOR')) roleClass = 'operator';

                    return `
                        <div class="user-glass-card ${isSelf ? 'my-profile-card' : ''}">
                            <div class="user-card-header">
                                <div class="user-avatar-container">
                                    <img src="${avatarSrc}" 
                                         alt="${cleanName}" 
                                         class="user-avatar-circle"
                                         onerror="this.src='${defaultAvatar}'">
                                    <span class="status-badge-dot ${isActive ? 'active' : 'inactive'}" title="${isActive ? 'Active User' : 'Inactive User'}"></span>
                                </div>
                                <div class="user-name-role">
                                    <h4>${cleanName}${isSelf ? ' (You)' : ''}</h4>
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
                                    <span class="detail-value" style="color: ${isActive ? '#34C759' : '#8E8E93'}; font-weight: 700;">${isActive ? 'Active' : 'Inactive'}</span>
                                </div>
                            </div>
                        </div>
                    `;
                }).join("");
            } else {
                grid.innerHTML = `<div class="empty-search-state"><span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></span><p>No registered system users found.</p></div>`;
            }
        } catch (err) {
            console.error("Failed to load user cards:", err);
            grid.innerHTML = `<div class="empty-search-state"><span><svg class="btn-svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg></span><p>Error connecting to server to load users.</p></div>`;
        }
    }

    async function loadDashboardStats() {
        try {
            const res = await fetch("/api/dashboard-stats", { credentials: "same-origin" });
            if (res.ok) {
                const data = await res.json();
                const activeFlightsCountEl = document.getElementById("activeFlightsCount");
                const activeCrewCountEl = document.getElementById("activeCrewCount");
                const todayMessagesCountEls = document.querySelectorAll("#todayMessagesCount");

                if (activeFlightsCountEl && data.activeFlights !== undefined) {
                    activeFlightsCountEl.textContent = data.activeFlights;
                }
                if (activeCrewCountEl && data.activeCrew !== undefined) {
                    activeCrewCountEl.textContent = data.activeCrew;
                }
                if (data.todayMessages !== undefined) {
                    todayMessagesCountEls.forEach(el => { el.textContent = data.todayMessages; });
                }
            }
        } catch (err) {
            console.error("Error loading dashboard stats:", err);
        }

        // Active crew count fallback
        try {
            const resCrew = await fetch("/api/active-crew-count", { credentials: "same-origin" });
            if (resCrew.ok) {
                const dataCrew = await resCrew.json();
                const crewCount = dataCrew.activeCrewCount ?? dataCrew.p_active_cnt ?? 0;
                const activeCrewCountEl = document.getElementById("activeCrewCount");
                if (activeCrewCountEl && (crewCount > 0 || activeCrewCountEl.textContent === "0")) {
                    activeCrewCountEl.textContent = crewCount;
                }
            }
        } catch (err) {
            console.warn("Crew count fallback error:", err);
        }

        // Check for persistent popup alert for messages sent today
        checkAndShowUrgentPopupAlert();
    }

    // Check and trigger persistent popup alert until cross (X) is clicked
    async function checkAndShowUrgentPopupAlert() {
        try {
            const res = await fetch("/api/messages/today", { credentials: "same-origin" });
            if (!res.ok) return;
            const data = await res.json();
            const msgs = data.messages || [];

            if (msgs.length === 0) return;

            const latestMsg = msgs[0];
            const dismissedKey = "aos_dismissed_msg_" + latestMsg.messageId;
            if (sessionStorage.getItem(dismissedKey)) {
                return; // User already acknowledged this message in this session
            }

            const overlay = document.getElementById("urgentMessagePopupOverlay");
            if (!overlay) return;

            const header = document.getElementById("popupAlertHeader");
            const timeEl = document.getElementById("popupAlertTime");
            const roleBadge = document.getElementById("popupAlertRoleBadge");
            const prioBadge = document.getElementById("popupAlertPrioBadge");
            const titleEl = document.getElementById("popupAlertTitle");
            const bodyEl = document.getElementById("popupAlertBody");
            const closeBtn = document.getElementById("closePopupAlertBtn");
            const ackBtn = document.getElementById("ackPopupAlertBtn");

            if (header) header.textContent = (latestMsg.priority === "URGENT") ? "🚨 Critical Operational Alert" : "📢 Admin Operational Notice";
            if (timeEl) timeEl.textContent = latestMsg.sentTime || "Today";
            if (roleBadge) roleBadge.textContent = latestMsg.targetRole || "ALL ROLES";
            if (prioBadge) {
                prioBadge.textContent = latestMsg.priority || "NORMAL";
                if (latestMsg.priority === "URGENT") {
                    prioBadge.style.background = "rgba(239, 68, 68, 0.2)";
                    prioBadge.style.color = "#EF4444";
                } else if (latestMsg.priority === "IMPORTANT") {
                    prioBadge.style.background = "rgba(245, 158, 11, 0.2)";
                    prioBadge.style.color = "#F59E0B";
                } else {
                    prioBadge.style.background = "rgba(56, 189, 248, 0.2)";
                    prioBadge.style.color = "#38BDF8";
                }
            }
            if (titleEl) titleEl.textContent = latestMsg.title || "Operational Notice";
            if (bodyEl) bodyEl.textContent = latestMsg.body || "";

            overlay.style.display = "flex";
            overlay.classList.remove("hidden");

            function dismissAlert() {
                overlay.style.display = "none";
                overlay.classList.add("hidden");
                sessionStorage.setItem(dismissedKey, "true");
            }

            if (closeBtn) closeBtn.onclick = dismissAlert;
            if (ackBtn) ackBtn.onclick = dismissAlert;

        } catch (err) {
            console.error("Error checking today message alerts:", err);
        }
    }

    // Open Today's Messages Interactive Modal
    window._aos_openTodayMessagesModal = async function() {
        const overlay = document.getElementById("todayMessagesModalOverlay");
        const listContainer = document.getElementById("todayMessagesListContainer");
        const closeBtn = document.getElementById("closeTodayMessagesModalBtn");

        if (!overlay || !listContainer) return;

        overlay.style.display = "flex";
        overlay.classList.remove("hidden");

        if (closeBtn) {
            closeBtn.onclick = () => {
                overlay.style.display = "none";
                overlay.classList.add("hidden");
            };
        }

        listContainer.innerHTML = `<div style="text-align: center; padding: 30px; color: var(--text-muted);">Fetching today's messages...</div>`;

        try {
            const res = await fetch("/api/messages/today", { credentials: "same-origin" });
            if (!res.ok) {
                listContainer.innerHTML = `<div style="text-align: center; padding: 30px; color: #EF4444;">Failed to load messages (HTTP ${res.status}).</div>`;
                return;
            }

            const data = await res.json();
            const msgs = data.messages || [];

            if (msgs.length === 0) {
                listContainer.innerHTML = `
                    <div style="text-align: center; padding: 40px; color: var(--text-muted);">
                        <svg class="btn-svg" viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.5" style="margin-bottom: 12px; opacity: 0.5;"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                        <h4 style="color: var(--text-main); font-size: 15px; margin: 0 0 4px;">No Messages Sent Today</h4>
                        <p style="font-size: 13px; margin: 0;">No active operational messages or announcements have been broadcast today.</p>
                    </div>
                `;
                return;
            }

            listContainer.innerHTML = msgs.map(m => {
                let prioColor = "#10B981";
                let prioBg = "rgba(16, 185, 129, 0.15)";
                const p = (m.priority || "NORMAL").toUpperCase();
                if (p === "URGENT") { prioColor = "#EF4444"; prioBg = "rgba(239, 68, 68, 0.2)"; }
                else if (p === "IMPORTANT") { prioColor = "#F59E0B"; prioBg = "rgba(245, 158, 11, 0.2)"; }
                else if (p === "INFO") { prioColor = "#38BDF8"; prioBg = "rgba(56, 189, 248, 0.15)"; }

                return `
                    <div class="user-glass-card" style="padding: 16px; border-radius: 12px; background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08);">
                        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; flex-wrap: wrap; gap: 8px;">
                            <div style="display: flex; gap: 8px; align-items: center;">
                                <span class="user-role-badge" style="background: rgba(56, 189, 248, 0.15); color: #38BDF8; font-weight: 700;">${m.targetRole || 'ALL ROLES'}</span>
                                <span style="display: inline-block; padding: 2px 7px; border-radius: 5px; font-size: 11px; font-weight: 700; background: ${prioBg}; color: ${prioColor};">${p}</span>
                            </div>
                            <span style="font-size: 12px; color: var(--text-muted);">${m.sentTime || 'Today'}</span>
                        </div>
                        <h4 style="font-size: 15px; font-weight: 700; color: var(--text-main); margin: 0 0 6px;">${m.title || 'Operational Notice'}</h4>
                        <div style="font-size: 13.5px; line-height: 1.5; color: #CBD5E1; white-space: pre-wrap;">${m.body || ''}</div>
                        <div style="font-size: 11.5px; color: var(--text-muted); margin-top: 8px; text-align: right;">
                            Dispatched by: <strong style="color: var(--text-main);">${(m.sender && !m.sender.toLowerCase().includes('dushmanta')) ? m.sender : 'Pratigayan Pattnaik'}</strong>
                        </div>
                    </div>
                `;
            }).join("");

        } catch (err) {
            console.error("Error fetching today messages modal:", err);
            listContainer.innerHTML = `<div style="text-align: center; padding: 30px; color: #EF4444;">Server error loading today's messages.</div>`;
        }
    };


    function renderPlaceholderPage(menu) {
        const mainContent = getMainContentEl();
        if (!mainContent) return;
        mainContent.innerHTML = `
            <div class="welcome-banner">
                <h1>${menu}</h1>
                <p>The interface for ${menu} is under development.</p>
            </div>`;
    }

    function navigateToMenu(menuName, li) {
        console.log("[NAV] Navigating to menu:", menuName);
        const label = (menuName || "").trim().toLowerCase();
        if (li) setActiveMenu(li);

        if (label.includes("dashboard")) {
            renderHomeDashboard();
        }
        else if (label.includes("assign") && (label.includes("menu") || label.includes("role to menu"))) {
            renderAssignMenuToRoleForm();
        }
        else if (label.includes("assign") && (label.includes("user") || label.includes("role to user"))) {
            renderManageUserRoleForm();
        }
        else if (label.includes("create user") || label.includes("register user")) {
            renderCreateUserForm();
        }
        else if (label.includes("create role")) {
            renderCreateRoleForm();
        }
        else if (label.includes("create menu")) {
            renderCreateMenuForm();
        }
        else if (label.includes("create city") || label.includes("city")) {
            renderCreateCityForm();
        }
        else if (label.includes("create airport") || label.includes("airport")) {
            renderCreateAirportForm();
        }
        else if (label.includes("seat") || label.includes("booking") || label.includes("book ticket")) {
            renderSeatMapBookingView();
        }
        else if (label.includes("dynamic price") || label.includes("price")) {
            renderCreateDynamicPriceForm();
        }
        else if (label.includes("flight company") || label.includes("airline")) {
            renderCreateFlightCompanyForm();
        }
        else if (label.includes("flight")) {
            renderCreateFlightForm();
        }
        else if (label.includes("customer") || label.includes("passenger")) {
            renderPassengerRegistrationForm();
        }
        else if (label.includes("message") || label.includes("broadcast") || label.includes("announcement")) {
            renderMessageCenterPage();
        }
        else {
            console.warn("Unhandled menu click:", label);
            renderPlaceholderPage(menuName);
        }
    }

    window._aos_navigateToMenu = navigateToMenu;
    if (window.aosPendingMenu) {
        navigateToMenu(window.aosPendingMenu.menuName, window.aosPendingMenu.li);
        window.aosPendingMenu = null;
    }

    // Document-wide event delegation for sidebar navigation
    document.addEventListener("click", (e) => {
        const link = e.target.closest(".menu-link");
        if (!link) return;

        // Only target sidebar menu links
        const sidebar = link.closest(".sidebar");
        if (!sidebar) return;

        e.preventDefault();
        e.stopPropagation();

        const li = link.closest("li");
        const menuName = link.getAttribute("data-menu") || link.textContent.trim();
        navigateToMenu(menuName, li);
    });

    function renderMenus(menus) {
        const navContainer = document.querySelector(".nav-links") || document.getElementById("navLinks");
        if (!navContainer) {
            console.error("Sidebar nav container not found.");
            return;
        }

        navContainer.innerHTML = "";

        const defaultAdminMenus = [
            "CREATE CITY",
            "CREATE AIRPORT",
            "CREATE FLIGHT",
            "REGISTER CUSTOMER",
            "CREATE USER",
            "ASSIGN ROLE TO USER",
            "CREATE MENU",
            "ASSIGN ROLE TO MENU",
            "CREATE FLIGHT COMPANY",
            "SEAT BOOKING",
            "CREATE DYNAMIC PRICE"
        ];

        const isPassenger = currentUser && (currentUser.role === 'PASSENGER' || currentUser.role === 'CUSTOMER');
        const defaultMenus = isPassenger ? ["REGISTER CUSTOMER", "SEAT BOOKING"] : defaultAdminMenus;

        const activeMenus = (menus && menus.length > 0) ? menus : defaultMenus;

        const dashboardLi = document.createElement("li");
        dashboardLi.classList.add("active");
        dashboardLi.innerHTML = `<a href="javascript:void(0)" class="menu-link" data-menu="DASHBOARD" onclick="window.aosNavigateTo('DASHBOARD', this); return false;"><svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg><span class="menu-text">Dashboard</span></a>`;
        navContainer.appendChild(dashboardLi);

        const uniqueMenus = [...new Set(activeMenus.map(m => (m || "").trim()).filter(Boolean))];
        uniqueMenus.forEach(menu => {
            if (menu.toUpperCase() === "DASHBOARD") return;

            let icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;
            const u = menu.toUpperCase();
            if (u.includes("PRICE") || u.includes("DYNAMIC")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>`;
            else if (u.includes("CUSTOMER") || u.includes("PASSENGER") || u.includes("REGISTER CUSTOMER")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="16" y1="11" x2="22" y2="11"/></svg>`;
            else if (u.includes("CREATE USER")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
            else if (u.includes("CITY")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18"/><path d="M6 21V7l8-4v18"/><path d="M14 21V11l4-2v12"/><path d="M9 9h2"/><path d="M9 13h2"/><path d="M9 17h2"/></svg>`;
            else if (u.includes("AIRPORT")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 22h20"/><path d="M12 2v10"/><path d="M12 6l8 4v2l-8-3-8 3V10l8-4z"/><path d="M9 16h6"/></svg>`;
            else if (u.includes("FLIGHT COMPANY")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`;
            else if (u.includes("FLIGHT")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.8 19.2L16 11l3.5-3.5C20.1 6.9 20 5 18.6 3.6c-1.4-1.4-3.3-1.5-3.9-.9L11.2 6.2 3 4.4l-1 2 5.5 3.5L4 13.4l-2.5-.5-1 1 3.5 2.5 2.5 3.5 1-1-.5-2.5 3.5-3.5 3.5 5.5 2-1z"/></svg>`;
            else if (u.includes("SEAT") || u.includes("BOOKING")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v2z"/><line x1="13" y1="5" x2="13" y2="19" stroke-dasharray="2 2"/></svg>`;
            else if (u.includes("ASSIGN") && u.includes("MENU")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`;
            else if (u.includes("ASSIGN") && u.includes("ROLE")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`;
            else if (u.includes("MESSAGE") || u.includes("BROADCAST")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`;
            else if (u.includes("MENU")) icon = `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>`;

            const li = document.createElement("li");
            li.innerHTML = `<a href="javascript:void(0)" class="menu-link" data-menu="${menu}" onclick="window.aosNavigateTo('${menu}', this); return false;">${icon}<span class="menu-text">${menu}</span></a>`;
            navContainer.appendChild(li);
        });
    }

} // END initDashboard



// =====================================================================
// FLOATING ROBO-CHATBOT & GAGAN SAATHI INTERACTIVE LOGIC
// =====================================================================
const chatbotFab = document.getElementById("chatbotFab");
const chatbotWindow = document.getElementById("chatbotWindow");
const chatbotClose = document.getElementById("chatbotClose");
const chatbotMessages = document.getElementById("chatbotMessages");
const chatbotInput = document.getElementById("chatbotInput");
const chatbotSend = document.getElementById("chatbotSend");
const chatbotExpandBtn = document.getElementById("chatbotExpandBtn");
const expandIcon = document.getElementById("expandIcon");
const compressIcon = document.getElementById("compressIcon");
const chatbotHeaderTitle = document.getElementById("chatbotHeaderTitle");
const chatbotModeTag = document.getElementById("chatbotModeTag");

// Gagan Saathi Tray & Form Elements
const gaganSaathiToggleBtn = document.getElementById("gaganSaathiToggleBtn");
const chatbotGaganShortcutBtn = document.getElementById("chatbotGaganShortcutBtn");
const gaganSaathiTray = document.getElementById("gaganSaathiTray");
const closeGaganTrayBtn = document.getElementById("closeGaganTrayBtn");
const gaganSaathiSubmitBtn = document.getElementById("gaganSaathiSubmitBtn");

const gsPassengerName = document.getElementById("gsPassengerName");
const gsTravelDate = document.getElementById("gsTravelDate");
const gsFromAirport = document.getElementById("gsFromAirport");
const gsToAirport = document.getElementById("gsToAirport");
const gsBudget = document.getElementById("gsBudget");
const gsFoodPref = document.getElementById("gsFoodPref");
const gsAllergies = document.getElementById("gsAllergies");
const gsSafetyNotes = document.getElementById("gsSafetyNotes");

const fromSuggestionsBox = document.getElementById("fromSuggestionsBox");
const toSuggestionsBox = document.getElementById("toSuggestionsBox");

let isGaganMode = false;

// Set default travel date to today or tomorrow
if (gsTravelDate && !gsTravelDate.value) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    gsTravelDate.value = tomorrow.toISOString().split("T")[0];
}

// 1. FAB Open / Close Toggle
if (chatbotFab && chatbotWindow) {
    chatbotFab.addEventListener("click", () => {
        chatbotWindow.classList.toggle("hidden");
        if (!chatbotWindow.classList.contains("hidden")) {
            chatbotInput && chatbotInput.focus();
        }
    });
}

if (chatbotClose && chatbotWindow) {
    chatbotClose.addEventListener("click", (e) => {
        e.stopPropagation();
        chatbotWindow.classList.add("hidden");
    });
}

// 2. Expand / Fullscreen Toggle
if (chatbotExpandBtn && chatbotWindow) {
    chatbotExpandBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        chatbotWindow.classList.toggle("expanded");
        const isExp = chatbotWindow.classList.contains("expanded");
        if (expandIcon && compressIcon) {
            if (isExp) {
                expandIcon.classList.add("hidden");
                compressIcon.classList.remove("hidden");
            } else {
                expandIcon.classList.remove("hidden");
                compressIcon.classList.add("hidden");
            }
        }
    });
}

// 3. Gagan Saathi Tray Toggle Function
function openGaganSaathiMode(focusInput = true) {
    isGaganMode = true;
    if (gaganSaathiTray) {
        gaganSaathiTray.classList.remove("hidden");
    }
    if (chatbotHeaderTitle) {
        chatbotHeaderTitle.textContent = "Gagan Saathi (गगन साथी)";
    }
    if (chatbotModeTag) {
        chatbotModeTag.textContent = "GAGAN SAATHI";
        chatbotModeTag.classList.add("gagan-active");
    }
    if (focusInput && gsFromAirport) {
        setTimeout(() => gsFromAirport.focus(), 150);
    }
}

function closeGaganSaathiMode() {
    isGaganMode = false;
    if (gaganSaathiTray) {
        gaganSaathiTray.classList.add("hidden");
    }
    if (chatbotHeaderTitle) {
        chatbotHeaderTitle.textContent = "AOS Operational Assistant";
    }
    if (chatbotModeTag) {
        chatbotModeTag.textContent = "AOS ASSISTANT";
        chatbotModeTag.classList.remove("gagan-active");
    }
}

if (gaganSaathiToggleBtn) {
    gaganSaathiToggleBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        if (gaganSaathiTray && !gaganSaathiTray.classList.contains("hidden")) {
            closeGaganSaathiMode();
        } else {
            openGaganSaathiMode(true);
        }
    });
}

if (chatbotGaganShortcutBtn) {
    chatbotGaganShortcutBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        openGaganSaathiMode(true);
    });
}

if (closeGaganTrayBtn) {
    closeGaganTrayBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        closeGaganSaathiMode();
    });
}

// 4. Live Airport Suggestions (3 to 4 matches as typing)
function setupAirportAutocomplete(inputEl, suggestionsBoxEl) {
    if (!inputEl || !suggestionsBoxEl) return;

    let debounceTimer = null;

    inputEl.addEventListener("input", () => {
        const query = inputEl.value.trim();
        clearTimeout(debounceTimer);

        if (query.length < 2) {
            suggestionsBoxEl.innerHTML = "";
            suggestionsBoxEl.classList.add("hidden");
            return;
        }

        debounceTimer = setTimeout(async () => {
            try {
                const res = await fetch(`/api/airports/search?q=${encodeURIComponent(query)}&limit=4`);
                if (!res.ok) return;
                const data = await res.json();
                const airports = data.results || [];

                if (airports.length === 0) {
                    suggestionsBoxEl.innerHTML = `<div style="padding: 8px 12px; font-size: 11px; color: var(--text-muted);">No matching airports found</div>`;
                    suggestionsBoxEl.classList.remove("hidden");
                    return;
                }

                suggestionsBoxEl.innerHTML = airports.map(apt => `
                    <div class="gs-suggestion-item" data-code="${apt.iata || ''}" data-city="${apt.city || ''}" data-name="${apt.name || ''}">
                        <div>
                            <div class="gs-sugg-name">${apt.name}</div>
                            <div class="gs-sugg-loc">${apt.city}${apt.country ? ', ' + apt.country : ''}</div>
                        </div>
                        ${apt.iata ? `<span class="gs-sugg-code">${apt.iata}</span>` : ''}
                    </div>
                `).join("");

                suggestionsBoxEl.classList.remove("hidden");

                suggestionsBoxEl.querySelectorAll(".gs-suggestion-item").forEach(item => {
                    item.addEventListener("click", () => {
                        const code = item.dataset.code;
                        const city = item.dataset.city;
                        const name = item.dataset.name;
                        inputEl.value = code ? `${code} (${city || name})` : `${name}, ${city}`;
                        suggestionsBoxEl.innerHTML = "";
                        suggestionsBoxEl.classList.add("hidden");
                    });
                });

            } catch (err) {
                console.error("Airport search error:", err);
            }
        }, 150);
    });

    // Close suggestion box on outside click
    document.addEventListener("click", (e) => {
        if (!inputEl.contains(e.target) && !suggestionsBoxEl.contains(e.target)) {
            suggestionsBoxEl.classList.add("hidden");
        }
    });
}

setupAirportAutocomplete(gsFromAirport, fromSuggestionsBox);
setupAirportAutocomplete(gsToAirport, toSuggestionsBox);

// 5. Markdown & Rich Card Parser
function formatBotMessage(text, travelData = null) {
    if (!text) return "";

    // Escape basic angle brackets but keep formatting
    let formatted = text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");

    // Convert markdown tables | col | col | to sleek HTML tables
    formatted = formatted.replace(/((?:\|[^\n]+\|\r?\n)+)/g, (match) => {
        const rows = match.trim().split(/\r?\n/).filter(r => r.includes('|'));
        if (rows.length < 2) return match;
        
        let html = '<div class="gs-table-responsive"><table class="gs-markdown-table">';
        let isHeader = true;
        
        rows.forEach((row, i) => {
            if (/^\|[\s\-:]+\|\s*$/.test(row)) {
                isHeader = false;
                return;
            }
            const cells = row.split('|').slice(1, -1).map(c => c.trim());
            if (isHeader && i === 0) {
                html += '<thead><tr>' + cells.map(c => `<th>${c}</th>`).join('') + '</tr></thead><tbody>';
            } else {
                html += '<tr>' + cells.map(c => `<td>${c}</td>`).join('') + '</tr>';
            }
        });
        html += '</tbody></table></div>';
        return html;
    });

    // Horizontal Rule Dividers
    formatted = formatted.replace(/^---$/gim, '<hr class="gs-chat-divider">');

    // Headers
    formatted = formatted.replace(/^### (.*$)/gim, '<h4 style="margin: 12px 0 4px 0; color: #38BDF8; font-size: 14px; font-weight: 800;">$1</h4>');
    formatted = formatted.replace(/^## (.*$)/gim, '<h3 style="margin: 14px 0 6px 0; color: #0284C7; font-size: 15px; font-weight: 800;">$1</h3>');
    formatted = formatted.replace(/^# (.*$)/gim, '<h2 style="margin: 16px 0 8px 0; color: #0284C7; font-size: 16px; font-weight: 800;">$1</h2>');

    // Bold and Italic
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong style="color: #38BDF8; font-weight: 700;">$1</strong>');
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');

    // Bullet points
    formatted = formatted.replace(/^\s*[\-\*•]\s+(.*$)/gim, '<div style="display: flex; gap: 6px; margin: 4px 0;"><span style="color: #38BDF8;">•</span><span>$1</span></div>');

    // Numbered lists
    formatted = formatted.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<div style="display: flex; gap: 6px; margin: 4px 0;"><span style="color: #F59E0B; font-weight: 800;">$1.</span><span>$2</span></div>');

    // Convert newlines
    formatted = formatted.replace(/\n\n/g, '<div style="height: 8px;"></div>');
    formatted = formatted.replace(/\n/g, '<br>');

    // Image Fallback Libraries
    const hotelImages = [
        "https://images.unsplash.com/photo-1566073771259-6a8506099945?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1582719478250-c89cae4dc85b?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1542314831-068cd1dbfeeb?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1571896349842-33c89424de2d?w=500&auto=format&fit=crop&q=80"
    ];

    const placeImages = [
        "https://images.unsplash.com/photo-1477959858617-67f30bc75b82?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1508807526345-15e9b5f4eaff?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1513635269975-59663e0ac1ad?w=500&auto=format&fit=crop&q=80"
    ];

    const foodImages = [
        "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1504674900247-0877df9cc836?w=500&auto=format&fit=crop&q=80",
        "https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=500&auto=format&fit=crop&q=80"
    ];

    // Build Rich Widgets if travelData is provided
    let richWidgets = "";
    if (travelData) {
        const destCity = travelData.destination_city || "";

        // 1. Weather & Umbrella Alert Widget
        if (travelData.umbrella_needed || travelData.weather_alert) {
            richWidgets += `
                <div class="gs-weather-box" style="margin-top: 12px;">
                    <div class="gs-section-title">🌤️ 3-Day Weather Prediction & Advisory</div>
                    ${travelData.umbrella_needed ? `
                        <div class="gs-umbrella-alert">
                            <span style="font-size: 20px;">☔</span>
                            <div>
                                <strong>Precipitation & Umbrella Advisory:</strong>
                                <div>Rain expected during your travel window. Please pack an umbrella and rain gear!</div>
                            </div>
                        </div>
                    ` : ''}
                    ${travelData.weather_alert ? `<div style="font-size: 11.5px; color: var(--text-main); margin-top: 4px;"><strong>Forecast Summary:</strong> ${travelData.weather_alert}</div>` : ''}
                </div>
            `;
        }

        // 2. Hotel Recommendations Cards with Google Maps Button
        if (Array.isArray(travelData.hotels) && travelData.hotels.length > 0) {
            richWidgets += `
                <div style="margin-top: 14px;">
                    <div class="gs-section-title">🏨 Nearest Budget-Matched Hotels (with Google Maps)</div>
                    <div class="gs-hotels-grid">
                        ${travelData.hotels.map((h, idx) => {
                            const mapQuery = encodeURIComponent(`${h.name || 'Hotel'} ${destCity}`.trim());
                            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
                            const wTag = h.weather_tag || '☀️ Full AC & Covered';
                            return `
                                <div class="gs-hotel-card">
                                    <div style="position: relative;">
                                        <img src="${hotelImages[idx % hotelImages.length]}" alt="${h.name || 'Hotel'}" class="gs-hotel-img" loading="lazy">
                                        <span class="gs-weather-badge">${wTag}</span>
                                    </div>
                                    <div class="gs-hotel-info">
                                        <div class="gs-hotel-name">${h.name || 'Premium Living Stay'}</div>
                                        <div class="gs-hotel-meta">
                                            <span>📍 ${h.distance || 'Near Airport'}</span>
                                            <span>⭐ ${h.rating || '4.5/5'}</span>
                                        </div>
                                        <div class="gs-hotel-price">${h.price || 'Best Available Rate'}</div>
                                        ${h.why_recommended ? `<div class="gs-card-why"><strong>💡 Why Good:</strong> ${h.why_recommended}</div>` : ''}
                                        ${h.cautions_requirements ? `<div class="gs-card-caution"><strong>⚠️ Caution:</strong> ${h.cautions_requirements}</div>` : ''}
                                        ${h.amenities ? `<div style="font-size: 10px; color: var(--text-muted); line-height: 1.3; margin-top: 2px;">${h.amenities}</div>` : ''}
                                        <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="gs-map-link-btn" title="View ${h.name} on Google Maps">
                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                                            <span>Google Maps</span>
                                        </a>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        }

        // 3. Famous Places & Viewpoints Cards with Google Maps Button
        const placesList = Array.isArray(travelData.famous_places) && travelData.famous_places.length > 0 
            ? travelData.famous_places 
            : Array.isArray(travelData.top_viewpoints) && travelData.top_viewpoints.length > 0 
                ? travelData.top_viewpoints.map(p => typeof p === 'string' ? { name: p } : p) 
                : [];

        if (placesList.length > 0) {
            richWidgets += `
                <div style="margin-top: 14px;">
                    <div class="gs-section-title">📍 Famous Places & City Attractions (with Google Maps)</div>
                    <div class="gs-places-grid">
                        ${placesList.map((p, idx) => {
                            const pName = p.name || 'Scenic Viewpoint';
                            const mapQuery = encodeURIComponent(`${pName} ${destCity}`.trim());
                            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
                            const wTag = p.weather_tag || '⛅ Scenic Attraction';
                            return `
                                <div class="gs-place-card">
                                    <div style="position: relative;">
                                        <img src="${placeImages[idx % placeImages.length]}" alt="${pName}" class="gs-place-img" loading="lazy">
                                        <span class="gs-weather-badge">${wTag}</span>
                                    </div>
                                    <div class="gs-place-info">
                                        <div class="gs-place-name">${pName}</div>
                                        <div class="gs-place-meta">
                                            <span>🕒 ${p.best_time || 'Daytime / Sunset'}</span>
                                            <span>🎟️ ${p.entry_fee || 'Free / Standard'}</span>
                                        </div>
                                        ${p.why_recommended ? `<div class="gs-card-why"><strong>💡 Why Good:</strong> ${p.why_recommended}</div>` : ''}
                                        ${p.cautions_requirements ? `<div class="gs-card-caution"><strong>⚠️ Caution:</strong> ${p.cautions_requirements}</div>` : ''}
                                        ${p.description ? `<div class="gs-place-desc">${p.description}</div>` : ''}
                                        <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="gs-map-link-btn" title="Explore ${pName} on Google Maps">
                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
                                            <span>Explore on Map</span>
                                        </a>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        }

        // 4. Foodlets & Dining Centers Cards with Google Maps Button
        const foodList = Array.isArray(travelData.foodlets) && travelData.foodlets.length > 0 
            ? travelData.foodlets 
            : Array.isArray(travelData.food_recommendations) && travelData.food_recommendations.length > 0 
                ? travelData.food_recommendations 
                : [];

        if (foodList.length > 0) {
            richWidgets += `
                <div style="margin-top: 14px;">
                    <div class="gs-section-title">🍽️ Food Outlets & Dining Centers (with Google Maps)</div>
                    <div class="gs-foodlets-grid">
                        ${foodList.map((f, idx) => {
                            const fName = f.name || 'Local Food Center';
                            const mapQuery = encodeURIComponent(`${fName} restaurant ${destCity}`.trim());
                            const mapUrl = `https://www.google.com/maps/search/?api=1&query=${mapQuery}`;
                            const isVeg = (f.type || '').toLowerCase().includes('veg') && !(f.type || '').toLowerCase().includes('non');
                            const wTag = f.weather_tag || '☀️ Indoor AC Dining';
                            return `
                                <div class="gs-foodlet-card">
                                    <div style="position: relative;">
                                        <img src="${foodImages[idx % foodImages.length]}" alt="${fName}" class="gs-foodlet-img" loading="lazy">
                                        <span class="gs-weather-badge">${wTag}</span>
                                    </div>
                                    <div class="gs-foodlet-info">
                                        <div class="gs-foodlet-header">
                                            <span class="gs-foodlet-name">${fName}</span>
                                            <span class="gs-diet-badge ${isVeg ? 'veg' : 'non-veg'}">${f.type || 'Dining'}</span>
                                        </div>
                                        <div class="gs-foodlet-meta">
                                            <span>🍲 ${f.cuisine || 'Regional Cuisine'}</span>
                                            <span>💰 ${f.price_range || 'Budget-Friendly'}</span>
                                        </div>
                                        ${f.special_dish ? `<div style="font-size: 10.5px; color: #38BDF8; font-weight: 600;">✨ Must Try: ${f.special_dish}</div>` : ''}
                                        ${f.why_recommended ? `<div class="gs-card-why"><strong>💡 Why Good:</strong> ${f.why_recommended}</div>` : ''}
                                        ${f.cautions_requirements ? `<div class="gs-card-caution"><strong>⚠️ Allergy Caution:</strong> ${f.cautions_requirements}</div>` : ''}
                                        <a href="${mapUrl}" target="_blank" rel="noopener noreferrer" class="gs-map-link-btn" title="Locate ${fName} on Google Maps">
                                            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>
                                            <span>Locate on Map</span>
                                        </a>
                                    </div>
                                </div>
                            `;
                        }).join("")}
                    </div>
                </div>
            `;
        }

        // 5. Safety & Night Crime Alert Widget
        if (travelData.night_safety_summary || travelData.safety_level) {
            const levelClass = (travelData.safety_level || "").toLowerCase().includes("safe") ? "safe" : (travelData.safety_level || "").toLowerCase().includes("caution") ? "caution" : "moderate";
            richWidgets += `
                <div class="gs-safety-box" style="margin-top: 14px;">
                    <div class="gs-safety-header">
                        <div class="gs-section-title" style="color: #EF4444; margin: 0;">🛡️ Night Safety & Crime Alert</div>
                        <span class="gs-safety-level-badge ${levelClass}">${travelData.safety_level || 'Safe'}</span>
                    </div>
                    <div class="gs-safety-text">${travelData.night_safety_summary || 'Use registered airport taxi counters and avoid isolated dark alleyways after midnight.'}</div>
                </div>
            `;
        }

        // 6. Interactive Quick Google Map Destination Hub
        if (destCity) {
            const allHotelsMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Hotels in ' + destCity)}`;
            const allFoodMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Restaurants and Food in ' + destCity)}`;
            const allPlacesMap = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Top Attractions and Viewpoints in ' + destCity)}`;

            richWidgets += `
                <div class="gs-map-hub-box" style="margin-top: 14px;">
                    <div class="gs-section-title">🗺️ Google Maps Live Explorer Hub (${destCity})</div>
                    <div class="gs-map-hub-buttons">
                        <a href="${allHotelsMap}" target="_blank" rel="noopener noreferrer" class="gs-hub-btn">🏨 Search All Hotels</a>
                        <a href="${allFoodMap}" target="_blank" rel="noopener noreferrer" class="gs-hub-btn">🍽️ Search All Foodlets</a>
                        <a href="${allPlacesMap}" target="_blank" rel="noopener noreferrer" class="gs-hub-btn">📍 Search All Places</a>
                    </div>
                </div>
            `;
        }
    }

    return `<div class="bot-content">${formatted}</div>${richWidgets}`;
}

function appendMessage(sender, text, travelData = null) {
    if (!chatbotMessages) return;
    const msgDiv = document.createElement("div");
    msgDiv.className = `message ${sender}`;

    if (sender === "bot") {
        msgDiv.innerHTML = formatBotMessage(text, travelData);
    } else {
        // User message
        const safeText = text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\n/g, "<br>");
        msgDiv.innerHTML = safeText;
    }

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

// 6. Handle Standard Chat Message Send
async function handleSendMessage() {
    if (!chatbotInput || !chatbotMessages) return;
    const text = chatbotInput.value.trim();
    if (!text) return;

    // Check if user is typing "gagansaathi" or "gagan saathi" -> open the form!
    const lowerText = text.toLowerCase();
    if (lowerText === "gagansaathi" || lowerText === "gagan saathi" || lowerText === "gagan" || lowerText === "saathi" || lowerText.includes("trip planner") || lowerText.includes("plan trip")) {
        appendMessage("user", text);
        chatbotInput.value = "";
        openGaganSaathiMode(true);
        appendMessage("bot", `✨ **Gagan Saathi (गगन साथी) Mode Activated!**\n\nI have opened the smart travel planning form for you above. Please verify your **Origin**, **Destination**, **Travel Date**, and **Food/Dietary Preferences**, then click the arrow button to generate your complete travel dossier! ✈️`);
        return;
    }

    // Append user message
    appendMessage("user", text);
    chatbotInput.value = "";

    // Show typing indicator
    const typingIndicator = showTypingIndicator();

    try {
        const apiKey = localStorage.getItem("gemini_api_key") || "";
        const groqApiKey = localStorage.getItem("groq_api_key") || "";
        const response = await fetch("/api/chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                message: text,
                mode: isGaganMode ? "gagansaathi" : "standard",
                apiKey: apiKey,
                groqApiKey: groqApiKey
            })
        });

        if (typingIndicator) typingIndicator.remove();

        const data = await response.json();
        if (response.ok && data.response) {
            appendMessage("bot", data.response, data.travelData);
        } else {
            appendMessage("bot", data.error || "Sorry, I encountered an error processing your request. Please check your AI API keys in settings ⚙️.");
        }
    } catch (err) {
        console.error("Chat error:", err);
        if (typingIndicator) typingIndicator.remove();
        appendMessage("bot", "Network error. Please make sure the backend server is running.");
    }
}

// 7. Handle Gagan Saathi Multi-Field Form Submission
if (gaganSaathiSubmitBtn) {
    gaganSaathiSubmitBtn.addEventListener("click", async () => {
        const pName = gsPassengerName ? gsPassengerName.value.trim() : "Passenger";
        const tDate = gsTravelDate ? gsTravelDate.value : "";
        const fromApt = gsFromAirport ? gsFromAirport.value.trim() : "";
        const toApt = gsToAirport ? gsToAirport.value.trim() : "";
        const budget = gsBudget ? gsBudget.value : "Moderate";
        const foodPref = gsFoodPref ? gsFoodPref.value : "Non-Vegetarian";
        const allergies = gsAllergies ? gsAllergies.value.trim() : "None";
        const safetyNotes = gsSafetyNotes ? gsSafetyNotes.value.trim() : "";

        if (!fromApt && !toApt) {
            alert("Please enter both Origin and Destination airports/cities to plan your trip.");
            if (gsFromAirport) gsFromAirport.focus();
            return;
        }

        // Build User Prompt Summary
        const userPrompt = `✈️ **Trip Request (Gagan Saathi)**:\n• Passenger: ${pName}\n• Route: ${fromApt || 'Current Location'} ➔ ${toApt || 'Destination'}\n• Date: ${tDate}\n• Budget: ${budget}\n• Diet: ${foodPref}${allergies ? ' (Allergies: ' + allergies + ')' : ''}\n${safetyNotes ? '• Safety/Viewpoints: ' + safetyNotes : ''}`;

        appendMessage("user", userPrompt);

        // Show typing indicator
        const typingIndicator = showTypingIndicator();

        try {
            const apiKey = localStorage.getItem("gemini_api_key") || "";
            const groqApiKey = localStorage.getItem("groq_api_key") || "";
            const payload = {
                mode: "gagansaathi",
                isGaganSaathi: true,
                message: `Please generate a comprehensive Gagan Saathi travel guide for ${pName} traveling from ${fromApt} to ${toApt} on ${tDate}. Include 3-day weather prediction, umbrella advisory, budget hotels, food/allergy recommendations, night crime safety alert, and city viewpoints.`,
                travelDetails: {
                    passengerName: pName,
                    travelDate: tDate,
                    fromAirport: fromApt,
                    toAirport: toApt,
                    budget: budget,
                    foodPreference: foodPref,
                    allergies: allergies,
                    safetyNotes: safetyNotes
                },
                apiKey: apiKey,
                groqApiKey: groqApiKey
            };

            const response = await fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });

            if (typingIndicator) typingIndicator.remove();

            const data = await response.json();
            if (response.ok && data.response) {
                appendMessage("bot", data.response, data.travelData);
            } else {
                appendMessage("bot", data.error || "Sorry, could not generate travel dossier. Please verify your AI API keys in settings ⚙️.");
            }
        } catch (err) {
            console.error("Gagan Saathi submit error:", err);
            if (typingIndicator) typingIndicator.remove();
            appendMessage("bot", "Network error communicating with the server. Please check your connection.");
        }
    });
}

// 8. Event Listeners for Chat Controls & Quick Action Chips
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

// Quick action chips inside chat messages
document.addEventListener("click", (e) => {
    const chip = e.target.closest(".chip-btn");
    if (!chip) return;

    const action = chip.dataset.action;
    if (action === "open-gagan") {
        openGaganSaathiMode(true);
    } else if (action === "prompt") {
        const text = chip.dataset.text || chip.textContent;
        if (chatbotInput) {
            chatbotInput.value = text;
            handleSendMessage();
        }
    }
});

// 9. Settings Toggle and Save Logic
// 9. Settings Toggle and Multi-LLM Key Persistence
const chatbotSettingsToggle = document.getElementById("chatbotSettingsToggle");
const chatbotSettingsPanel = document.getElementById("chatbotSettingsPanel");
const chatbotApiKeyInput = document.getElementById("chatbotApiKeyInput");
const chatbotGroqKeyInput = document.getElementById("chatbotGroqKeyInput");
const chatbotSaveSettingsBtn = document.getElementById("chatbotSaveSettingsBtn");

if (chatbotApiKeyInput) {
    chatbotApiKeyInput.value = localStorage.getItem("gemini_api_key") || "";
}
if (chatbotGroqKeyInput) {
    chatbotGroqKeyInput.value = localStorage.getItem("groq_api_key") || "";
}

if (chatbotSettingsToggle && chatbotSettingsPanel) {
    chatbotSettingsToggle.addEventListener("click", (e) => {
        e.stopPropagation();
        chatbotSettingsPanel.classList.toggle("hidden");
        if (!chatbotSettingsPanel.classList.contains("hidden")) {
            if (chatbotApiKeyInput) chatbotApiKeyInput.value = localStorage.getItem("gemini_api_key") || "";
            if (chatbotGroqKeyInput) chatbotGroqKeyInput.value = localStorage.getItem("groq_api_key") || "";
        }
    });
}

if (chatbotSaveSettingsBtn && chatbotSettingsPanel) {
    chatbotSaveSettingsBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const geminiVal = chatbotApiKeyInput ? chatbotApiKeyInput.value.trim() : "";
        const groqVal = chatbotGroqKeyInput ? chatbotGroqKeyInput.value.trim() : "";
        
        localStorage.setItem("gemini_api_key", geminiVal);
        localStorage.setItem("groq_api_key", groqVal);
        chatbotSettingsPanel.classList.add("hidden");
        appendMessage("bot", `🔑 **AI Multi-Engine Keys Saved Successfully!**\n\n• Primary Engine: **Google Gemini AI**\n• Backup Engine: **Groq High-Speed Llama-3.3-70B**\n\nGagan Saathi and the AOS Assistant are now backed up with instant automatic failover! 🚀`);
    });
}

function safeInit() {
    if (window._aos_initialized) return;
    window._aos_initialized = true;
    initDashboard();
}

if (document.readyState !== "loading") {
    safeInit();
} else {
    document.addEventListener("DOMContentLoaded", safeInit);
    window.addEventListener("load", safeInit);
}

