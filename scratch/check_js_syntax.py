filepath = r"d:\SOFTWERE\AOS_V9\frontend\static\dashboard.js"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

lines = content.splitlines()
i = 0
n = len(content)
line = 1
col = 1
stack = []
string_quote = None
in_s_comment = False
in_m_comment = False
in_regex = False

while i < n:
    c = content[i]
    
    if c == '\n':
        line += 1
        col = 1
        in_s_comment = False
        i += 1
        continue
    
    if in_s_comment:
        i += 1
        col += 1
        continue

    if in_m_comment:
        if c == '*' and i + 1 < n and content[i+1] == '/':
            in_m_comment = False
            i += 2
            col += 2
            continue
        i += 1
        col += 1
        continue

    if string_quote:
        if c == '\\':
            i += 2
            col += 2
            continue
        if string_quote == '`' and c == '$' and i + 1 < n and content[i+1] == '{':
            stack.append(('${', line, col, '`'))
            string_quote = None
            i += 2
            col += 2
            continue
        if c == string_quote:
            string_quote = None
        i += 1
        col += 1
        continue

    if in_regex:
        if c == '\\':
            i += 2
            col += 2
            continue
        if c == '/':
            in_regex = False
        i += 1
        col += 1
        continue

    if c == '/' and i + 1 < n and content[i+1] == '/':
        in_s_comment = True
        i += 2
        col += 2
        continue

    if c == '/' and i + 1 < n and content[i+1] == '*':
        in_m_comment = True
        i += 2
        col += 2
        continue

    if c == '/' and i > 0 and content[i-1] in ('(', '=', ':', ',', '!', '&', '|', '?', '{', ';'):
        in_regex = True
        i += 1
        col += 1
        continue

    if c in ("'", '"', '`'):
        string_quote = c
        i += 1
        col += 1
        continue

    if c in ('{', '(', '['):
        stack.append((c, line, col, None))
        if len(stack) == 1 and c == '{':
            print(f"Top-level brace OPENED at line {line}:{col}")
    elif c in ('}', ')', ']'):
        if not stack:
            print(f"ERROR: Unmatched '{c}' at {line}:{col}")
            break
        top, l, cl, extra = stack.pop()
        if extra == '`' and top == '${' and c == '}':
            string_quote = '`'
            i += 1
            col += 1
            continue
        if len(stack) == 0 and top == '{':
            print(f"Top-level brace CLOSED at line {line}:{col}")
        expected = {'{': '}', '(': ')', '[': ']'}.get(top, '}')
        if c != expected:
            print(f"MISMATCH at {line}:{col}: Expected '{expected}' but found '{c}' (opened '{top}' at {l}:{cl})")

    i += 1
    col += 1

print("\nREMAINING STACK AT EOF:", stack)
