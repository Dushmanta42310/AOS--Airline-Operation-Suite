document.addEventListener("DOMContentLoaded", async () => {
    const avatarImg = document.getElementById("profileAvatar");
    const profileName = document.getElementById("profileName");
    const mainContent = document.querySelector(".content");
    const navLinks = document.querySelector(".nav-links") || document.getElementById("navLinks");
    const logoutBtn = document.getElementById("logoutBtn");

    const originalContent = mainContent ? mainContent.innerHTML : "";
    let currentUser = null;

    function setDefaultAvatar(name) {
        if (!avatarImg) return;
        const safeName = encodeURIComponent(name || "User");
        avatarImg.src = `https://ui-avatars.com/api/?name=${safeName}&background=0D8ABC&color=fff`;
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
                            <label>User ID (Unique Number)</label>
                            <input type="number" name="userId" placeholder="e.g. 102" required>
                        </div>

                        <div class="input-group">
                            <label>Username (Email)</label>
                            <input type="email" name="username" placeholder="name@aos.com" required>
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

    function renderHomeDashboard() {
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
        const normalized = (menuName || "").trim().toUpperCase();

        li.addEventListener("click", (e) => {
            const anchor = e.target.closest("a");
            if (!anchor) return;

            e.preventDefault();
            setActiveMenu(li);

            if (normalized === "DASHBOARD") {
                renderHomeDashboard();
            } else if (normalized === "CREATE USER") {
                renderCreateUserForm();
            } else {
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
        dashboardLi.innerHTML = `<a href="#" class="menu-link" data-menu="DASHBOARD">Dashboard</a>`;
        navLinks.appendChild(dashboardLi);
        bindMenuAction("DASHBOARD", dashboardLi);

        if (menus && menus.length > 0) {
            const uniqueMenus = [...new Set(menus.map(m => (m || "").trim()).filter(Boolean))];

            uniqueMenus.forEach((menu, index) => {
                if (menu.toUpperCase() === "DASHBOARD") return;

                const li = document.createElement("li");
                li.innerHTML = `<a href="#" class="menu-link" data-menu="${menu}">${menu}</a>`;
                navLinks.appendChild(li);
                bindMenuAction(menu, li);

                console.log(`Rendered menu ${index + 1}:`, menu);
            });
        } else {
            const li = document.createElement("li");
            li.innerHTML = `<a href="#" class="menu-link" data-menu="NO MENU">No Menu</a>`;
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

            renderMenus(data.menus || []);
            renderHomeDashboard();

            if (avatarImg && data.photoUrl) {
                avatarImg.src = data.photoUrl;
                avatarImg.onerror = () => {
                    console.warn("Profile image failed, using default avatar.");
                    setDefaultAvatar(cleanName);
                };
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
});