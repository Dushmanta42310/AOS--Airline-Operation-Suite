"""
Track ALL depth transitions in loadSeatMap (lines 2230-2561).
"""
filepath = r"d:\SOFTWERE\AOS_V9\frontend\static\dashboard.js"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

n = len(content)
i = 0
line_num = 1
depth = 0
string_quote = None
in_s_comment = False
in_m_comment = False
template_stack = []

# Skip to line 2230 area (but track depth properly from start)
target_start = 2230
target_end = 2561

while i < n:
    c = content[i]
    
    if c == '\n':
        line_num += 1
        in_s_comment = False
        i += 1
        continue
    if c == '\r':
        i += 1
        continue
    
    if in_s_comment:
        i += 1
        continue

    if in_m_comment:
        if c == '*' and i + 1 < n and content[i+1] == '/':
            in_m_comment = False
            i += 2
            continue
        i += 1
        continue

    if string_quote:
        if c == '\\':
            i += 2
            continue
        if string_quote == '`':
            if c == '$' and i + 1 < n and content[i+1] == '{':
                template_stack.append(depth)
                depth += 1
                i += 2
                string_quote = None
                continue
            elif c == '`':
                string_quote = None
                i += 1
                continue
        elif c == string_quote:
            string_quote = None
            i += 1
            continue
        i += 1
        continue

    if c == '/' and i + 1 < n:
        if content[i+1] == '/':
            in_s_comment = True
            i += 2
            continue
        if content[i+1] == '*':
            in_m_comment = True
            i += 2
            continue

    if c == '/' and i > 0:
        j = i - 1
        while j >= 0 and content[j] in (' ', '\t', '\r', '\n'):
            j -= 1
        if j >= 0 and content[j] in ('(', '=', ':', ',', '!', '&', '|', '?', ';', '[', '+', '-', '~', '^', '%', '<', '>', '{', '\n', 'n'):
            i += 1
            while i < n and content[i] != '/' and content[i] != '\n':
                if content[i] == '\\':
                    i += 1
                i += 1
            if i < n and content[i] == '/':
                i += 1
            continue

    if c in ("'", '"', '`'):
        string_quote = c
        i += 1
        continue

    if c == '{':
        depth += 1
        if target_start <= line_num <= target_end:
            print(f"  L{line_num}: {{ depth {depth-1}->{depth}")
    elif c == '}':
        if template_stack and depth == template_stack[-1] + 1:
            template_stack.pop()
            string_quote = '`'
            depth -= 1
            i += 1
            continue
        
        if target_start <= line_num <= target_end:
            print(f"  L{line_num}: }} depth {depth}->{depth-1}")
        depth -= 1

    i += 1

print(f"\nDepth at line {target_end}: {depth}")
