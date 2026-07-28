const API_BASE = `${window.location.origin}/api`;

const panelTitle = document.getElementById("panelTitle");
const loginView = document.getElementById("loginView");
const registerView = document.getElementById("registerView");
const loginTabs = document.getElementById("loginTabs");

const mobileTab = document.getElementById("mobileTab");
const userTab = document.getElementById("userTab");
const mobileForm = document.getElementById("mobileForm");
const userForm = document.getElementById("userForm");
const messageBox = document.getElementById("messageBox");
const sendOtpBtn = document.getElementById("sendOtpBtn");

function showMessage(type, text) {
  messageBox.className = `message ${type}`;
  messageBox.textContent = text;
}

function clearMessage() {
  messageBox.className = "message hidden";
  messageBox.textContent = "";
}

function switchTab(mode) {
  if (mode === "mobile") {
    mobileTab.classList.add("active");
    userTab.classList.remove("active");
    mobileForm.classList.remove("hidden");
    userForm.classList.add("hidden");
  } else {
    userTab.classList.add("active");
    mobileTab.classList.remove("active");
    userForm.classList.remove("hidden");
    mobileForm.classList.add("hidden");
  }
  clearMessage();
}

mobileTab.addEventListener("click", () => switchTab("mobile"));
userTab.addEventListener("click", () => switchTab("user"));

document.getElementById("mobileNo").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "");
});

document.getElementById("otp").addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/\D/g, "");
});

sendOtpBtn.addEventListener("click", async () => {
  const mobileNo = document.getElementById("mobileNo").value.trim();

  if (mobileNo.length !== 10) {
    showMessage("error", "Enter a valid 10-digit mobile number.");
    return;
  }

  try {
    sendOtpBtn.disabled = true;
    sendOtpBtn.textContent = "Sending...";

    const res = await fetch(`${API_BASE}/send-otp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mobileNo })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Unable to send OTP.");

    showMessage("success", data.otp ? `${data.message} OTP: ${data.otp}` : data.message);
  } catch (error) {
    showMessage("error", error.message);
  } finally {
    sendOtpBtn.disabled = false;
    sendOtpBtn.textContent = "Send OTP";
  }
});

mobileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const mobileNo = document.getElementById("mobileNo").value.trim();
  const otp = document.getElementById("otp").value.trim();

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginMode: "M", mobileNo, otp })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Mobile login failed.");

    // Store profile info for dashboard
    if (data.fullName)  sessionStorage.setItem("aos_fullName",  data.fullName);
    if (data.userId)    sessionStorage.setItem("aos_userId",    data.userId);
    if (data.loginMode) sessionStorage.setItem("aos_loginMode", data.loginMode);

    showMessage("success", data.message + " Redirecting...");
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1000);
  } catch (error) {
    showMessage("error", error.message);
  }
});

userForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const username = document.getElementById("username").value.trim();
  const password = document.getElementById("password").value.trim();

  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginMode: "U", username, password })
    });

    const data = await res.json();
    if (!res.ok) throw new Error(data.message || "Username login failed.");

    // Store profile info for dashboard
    if (data.fullName)  sessionStorage.setItem("aos_fullName",  data.fullName);
    if (data.userId)    sessionStorage.setItem("aos_userId",    data.userId);
    if (data.loginMode) sessionStorage.setItem("aos_loginMode", data.loginMode);

    showMessage("success", data.message + " Redirecting...");
    setTimeout(() => {
      window.location.href = "/dashboard";
    }, 1000);
  } catch (error) {
    showMessage("error", error.message);
  }
});

// ===================================================
// CHANGE PASSWORD MODAL INTERACTION
// ===================================================
const openModalBtn = document.getElementById("openChangePasswordModalBtn");
const modalOverlay = document.getElementById("changePasswordModal");
const closeModalBtn = document.getElementById("closeChangePasswordModalBtn");
const modalOldPassTab = document.getElementById("modalOldPassTab");
const modalOtpTab = document.getElementById("modalOtpTab");
const modalOldPassForm = document.getElementById("modalOldPassForm");
const modalOtpForm = document.getElementById("modalOtpForm");
const modalMessageBox = document.getElementById("modalMessageBox");
const modalSendOtpBtn = document.getElementById("modalSendOtpBtn");

function showModalMessage(type, text) {
  modalMessageBox.className = `message ${type}`;
  modalMessageBox.textContent = text;
}

function clearModalMessage() {
  modalMessageBox.className = "message hidden";
  modalMessageBox.textContent = "";
}

function switchModalTab(mode) {
  clearModalMessage();
  if (mode === "oldpass") {
    modalOldPassTab.classList.add("active");
    modalOtpTab.classList.remove("active");
    modalOldPassForm.classList.remove("hidden");
    modalOtpForm.classList.add("hidden");
  } else {
    modalOtpTab.classList.add("active");
    modalOldPassTab.classList.remove("active");
    modalOtpForm.classList.remove("hidden");
    modalOldPassForm.classList.add("hidden");
  }
}

if (openModalBtn) {
  openModalBtn.addEventListener("click", (e) => {
    e.preventDefault();
    modalOverlay.classList.remove("hidden");
    clearModalMessage();
    switchModalTab("oldpass");
  });
}

if (closeModalBtn) {
  closeModalBtn.addEventListener("click", () => {
    modalOverlay.classList.add("hidden");
  });
}

if (modalOverlay) {
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.add("hidden");
    }
  });
}

if (modalOldPassTab) {
  modalOldPassTab.addEventListener("click", () => switchModalTab("oldpass"));
}
if (modalOtpTab) {
  modalOtpTab.addEventListener("click", () => switchModalTab("otp"));
}

const modalMobileNo = document.getElementById("modalMobileNo");
if (modalMobileNo) {
  modalMobileNo.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });
}

const modalOtp = document.getElementById("modalOtp");
if (modalOtp) {
  modalOtp.addEventListener("input", (e) => {
    e.target.value = e.target.value.replace(/\D/g, "");
  });
}

if (modalSendOtpBtn) {
  modalSendOtpBtn.addEventListener("click", async () => {
    const mobileNo = modalMobileNo.value.trim();
    if (mobileNo.length !== 10) {
      showModalMessage("error", "Enter a valid 10-digit mobile number.");
      return;
    }

    try {
      modalSendOtpBtn.disabled = true;
      modalSendOtpBtn.textContent = "Sending...";

      const res = await fetch(`${API_BASE}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mobileNo })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Unable to send OTP.");

      showModalMessage("success", data.otp ? `${data.message} OTP: ${data.otp}` : data.message);
    } catch (error) {
      showModalMessage("error", error.message);
    } finally {
      modalSendOtpBtn.disabled = false;
      modalSendOtpBtn.textContent = "Send OTP";
    }
  });
}

if (modalOldPassForm) {
  modalOldPassForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("modalUsername").value.trim();
    const oldPassword = document.getElementById("modalOldPassword").value.trim();
    const newPassword = document.getElementById("modalNewPassword").value.trim();

    try {
      const res = await fetch(`${API_BASE}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "Old Password",
          username,
          oldPassword,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password.");

      showModalMessage("success", "✅ Password changed successfully! Closing...");
      setTimeout(() => {
        modalOverlay.classList.add("hidden");
        modalOldPassForm.reset();
      }, 1500);
    } catch (error) {
      showModalMessage("error", error.message);
    }
  });
}

if (modalOtpForm) {
  modalOtpForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = modalMobileNo.value.trim();
    const otp = modalOtp.value.trim();
    const newPassword = document.getElementById("modalOtpNewPassword").value.trim();

    try {
      const res = await fetch(`${API_BASE}/change-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "OTP",
          username,
          otp,
          newPassword
        })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "Failed to change password.");

      showModalMessage("success", "✅ Password changed successfully! Closing...");
      setTimeout(() => {
        modalOverlay.classList.add("hidden");
        modalOtpForm.reset();
      }, 1500);
    } catch (error) {
      showModalMessage("error", error.message);
    }
  });
}
