import re

js_path = r'd:\SOFTWERE\AOS_V9\frontend\static\dashboard.js'
with open(js_path, 'r', encoding='utf-8') as f:
    js_code = f.read()

# Update top of dashboard.js to directly define window.aosNavigateTo calling navigateToMenu
top_replacement = '''// Global navigation dispatcher available instantly on script load
window.aosNavigateTo = function(menuName, element) {
    console.log("[AOS NAV] Navigating to:", menuName);
    const li = element ? (element.closest ? element.closest('li') : null) : null;
    navigateToMenu(menuName, li);
};

function getMainContentEl() {
    return document.querySelector(".content") || document.querySelector(".main-content") || document.querySelector("main");
}
'''

# Remove old top dispatcher definition
old_top_pattern = r'// Global navigation dispatcher available instantly on script load.*?(?=async function initDashboard)'
js_code = re.sub(old_top_pattern, top_replacement + '\n', js_code, flags=re.DOTALL)

with open(js_path, 'w', encoding='utf-8') as f:
    f.write(js_code)

print("Successfully refactored top of dashboard.js!")
