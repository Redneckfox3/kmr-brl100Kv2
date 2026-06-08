import xlrd

def inspect_kmr():
    book = xlrd.open_workbook('kmr')
    for name in book.sheet_names():
        sheet = book.sheet_by_name(name)
        print(f"\n==================================================")
        print(f"SHEET: {name} (Dimensions: {sheet.nrows}x{sheet.ncols})")
        print(f"==================================================")
        
        # Let's read the first 80 rows
        for r in range(min(80, sheet.nrows)):
            row_vals = [sheet.cell_value(r, c) for c in range(sheet.ncols)]
            # Check if the row has any non-empty cell
            if any(str(val).strip() != "" for val in row_vals):
                # Clean up and print
                cleaned_vals = []
                for val in row_vals:
                    if isinstance(val, float) and val == int(val):
                        cleaned_vals.append(str(int(val)))
                    elif val == "":
                        cleaned_vals.append("")
                    else:
                        cleaned_vals.append(str(val).replace('\n', ' ').strip())
                
                # Filter trailing empty strings to keep it readable
                while cleaned_vals and cleaned_vals[-1] == "":
                    cleaned_vals.pop()
                
                if cleaned_vals:
                    print(f"Row {r:02d}: {cleaned_vals[:12]}")

if __name__ == "__main__":
    inspect_kmr()
