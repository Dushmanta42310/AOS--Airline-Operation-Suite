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

    showMessage("success", `${data.message} OTP: ${data.otp}`);
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
