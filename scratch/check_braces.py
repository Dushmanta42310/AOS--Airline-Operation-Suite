"""
Proper JS brace depth analyzer that skips braces inside strings, 
template literals, and comments.
"""
import re

with open(r'd:\SOFTWERE\AOS_V9\frontend\static\dashboard.js', 'r', encoding='utf-8') as f:
    content = f.read()

# State machine to track braces outside of strings/comments/templates
i = 0
depth = 0
in_single_quote = False
in_double_quote = False
in_template = False
template_depth = 0  # for nested ${} inside templates
in_line_comment = False
in_block_comment = False
line_num = 1
depth_at_line_start = 0

# Track depth transitions
zero_crossings = []
negative_points = []

prev_depth = 0

while i < len(content):
    ch = content[i]
    
    if ch == '\n':
        in_line_comment = False
        if depth != prev_depth:
            pass
        prev_depth = depth
        line_num += 1
        i += 1
        continue
    
    if in_line_comment:
        i += 1
        continue
        
    if in_block_comment:
        if ch == '*' and i + 1 < len(content) and content[i+1] == '/':
            in_block_comment = False
            i += 2
        else:
            i += 1
        continue
    
    if in_single_quote:
        if ch == '\\':
            i += 2
            continue
        if ch == "'":
            in_single_quote = False
        i += 1
        continue
        
    if in_double_quote:
        if ch == '\\':
            i += 2
            continue
        if ch == '"':
            in_double_quote = False
        i += 1
        continue
    
    if in_template:
        if ch == '\\':
            i += 2
            continue
        if ch == '`':
            in_template = False
            i += 1
            continue
        if ch == '$' and i + 1 < len(content) and content[i+1] == '{':
            template_depth += 1
            depth += 1  # this is template expression depth, not real
            i += 2
            continue
        i += 1
        continue
    
    # Normal code context
    if ch == '/' and i + 1 < len(content):
        if content[i+1] == '/':
            in_line_comment = True
            i += 2
            continue
        elif content[i+1] == '*':
            in_block_comment = True
            i += 2
            continue
    
    if ch == "'":
        in_single_quote = True
        i += 1
        continue
    if ch == '"':
        in_double_quote = True
        i += 1
        continue
    if ch == '`':
        in_template = True
        i += 1
        continue
    
    if ch == '{':
        depth += 1
    elif ch == '}':
        depth -= 1
        if template_depth > 0:
            template_depth -= 1
        if depth < 0:
            negative_points.append(line_num)
        if depth == 0 and prev_depth > 0:
            zero_crossings.append(line_num)
    
    i += 1

print(f"Final brace depth: {depth}")
print(f"Lines where depth returns to 0: {zero_crossings}")
if negative_points:
    print(f"Lines where depth goes NEGATIVE: {negative_points}")
else:
    print("No negative depth points - braces are balanced!")
