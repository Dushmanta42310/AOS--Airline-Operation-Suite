import sys

def analyze_js(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        text = f.read()

    stack = []
    line_num = 1
    col_num = 0
    i = 0
    n = len(text)

    in_str = None # "'", '"', '`'
    in_comment = None # '//', '/*'
    template_stack = [] # stores depth of `${` inside template strings

    while i < n:
        c = text[i]

        if c == '\n':
            line_num += 1
            col_num = 0
            if in_comment == '//':
                in_comment = None
            i += 1
            continue
        col_num += 1

        # Handle comments
        if in_comment == '//':
            i += 1
            continue
        elif in_comment == '/*':
            if c == '*' and i + 1 < n and text[i+1] == '/':
                in_comment = None
                i += 2
                col_num += 1
            else:
                i += 1
            continue

        # Handle strings
        if in_str:
            if c == '\\':
                i += 2
                col_num += 1
                continue
            if in_str == '`':
                if c == '$' and i + 1 < n and text[i+1] == '{':
                    template_stack.append(in_str)
                    in_str = None
                    stack.append(('${', line_num, col_num))
                    i += 2
                    col_num += 1
                    continue
            if c == in_str:
                in_str = None
            i += 1
            continue

        # Not in string or comment
        if c == '/' and i + 1 < n:
            next_c = text[i+1]
            if next_c == '/':
                in_comment = '//'
                i += 2
                col_num += 1
                continue
            elif next_c == '*':
                in_comment = '/*'
                i += 2
                col_num += 1
                continue

        if c in ("'", '"', '`'):
            in_str = c
            i += 1
            continue

        if c in ('{', '(', '['):
            stack.append((c, line_num, col_num))
        elif c in ('}', ')', ']'):
            if not stack:
                print(f"Error: Unexpected '{c}' at Line {line_num}, Col {col_num}")
                return
            top, l, col = stack.pop()
            expected = {'}': '{', ')': '(', ']': '['}[c]
            if top == '${' and c == '}':
                if template_stack:
                    in_str = template_stack.pop()
            elif top != expected:
                print(f"Error: Mismatched '{c}' at Line {line_num}, Col {col_num}. Opened '{top}' at Line {l}, Col {col}")
                return

        i += 1

    if stack:
        print(f"Unclosed items remaining at end of file ({len(stack)} items):")
        for item, l, col in stack[-20:]:
            print(f"  Unclosed '{item}' opened at Line {l}, Col {col}")
    else:
        print("Success! All brackets, braces, and parens are perfectly matched!")

if __name__ == '__main__':
    analyze_js(r'd:\SOFTWERE\AOS_V9\frontend\static\dashboard.js')
