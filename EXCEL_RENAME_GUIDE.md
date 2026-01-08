# Excel Guide: Bulk Rename Image Files

If you want to convert your UPPERCASE filenames to lowercase (or vice versa), here's how to do it in Excel and then use a script to rename the files.

## Method 1: Excel Formula to Generate New Filenames

1. **Open Excel** and create a new spreadsheet

2. **Column A:** Paste your drug names (one per row)
   ```
   A1: COX B-200(CELECOXIB) 10'S
   A2: 10D GLUCOSE INF 500ML
   A3: ABONIKI
   ...
   ```

3. **Column B:** Use this formula to generate the sanitized filename:
   ```excel
   =LOWER(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(A1,"(",""),")",""),"-",""),"/",""),"%",""),"&","")," ","_"),".",""),",",""),"'",""),"S'","s"),"'S","s"))&".jpg"
   ```

   This formula:
   - Removes special characters: `()`, `-`, `/`, `%`, `&`, `.`, `,`, `'`
   - Replaces spaces with underscores
   - Converts to lowercase
   - Adds `.jpg` extension

4. **Column C:** Add the full path (if needed):
   ```excel
   ="inventoryImages/"&B1
   ```

5. **Copy Column B** to get all the new filenames

## Method 2: Use PowerShell (Windows) or Terminal (Mac) to Rename Files

### For Windows (PowerShell):

1. **Create a CSV file** with old and new names:
   ```csv
   OldName,NewName
   10D_GLUCOSE_INF_500ML.jpg,10d_glucose_inf_500ml.jpg
   COX_B_200_CELECOXIB_10S.jpg,cox_b_200_celecoxib_10s.jpg
   ```

2. **Run this PowerShell script:**
   ```powershell
   $csv = Import-Csv "rename-list.csv"
   $folder = "C:\path\to\your\images"
   
   foreach ($row in $csv) {
       $oldPath = Join-Path $folder $row.OldName
       $newPath = Join-Path $folder $row.NewName
       if (Test-Path $oldPath) {
           Rename-Item -Path $oldPath -NewName $row.NewName
           Write-Host "Renamed: $($row.OldName) → $($row.NewName)"
       }
   }
   ```

### For Mac/Linux (Terminal):

1. **Create a script file** `rename-images.sh`:
   ```bash
   #!/bin/bash
   # Navigate to your images folder
   cd /path/to/inventoryImages
   
   # Rename all files to lowercase
   for file in *.jpg; do
       if [ -f "$file" ]; then
           newname=$(echo "$file" | tr '[:upper:]' '[:lower:]')
           if [ "$file" != "$newname" ]; then
               mv "$file" "$newname"
               echo "Renamed: $file → $newname"
           fi
       fi
   done
   ```

2. **Make it executable and run:**
   ```bash
   chmod +x rename-images.sh
   ./rename-images.sh
   ```

## Method 3: Use the Updated Script (Easiest!)

**Good news!** I've updated the import script to handle UPPERCASE filenames. 

1. **Open** `scripts/import-drugs-with-images.ts`
2. **Find this line** (around line 550):
   ```typescript
   const USE_UPPERCASE_FILENAMES = true; // Change to false if you rename files to lowercase
   ```
3. **Set it to `true`** (it's already set!)
4. **Run the import** - it will now generate URLs matching your UPPERCASE filenames

This means you **don't need to rename your files** - the script will work with your current uppercase naming!

## Quick Reference: Filename Conversion

| Drug Name | Uppercase Filename | Lowercase Filename |
|-----------|-------------------|-------------------|
| `10D GLUCOSE INF 500ML` | `10D_GLUCOSE_INF_500ML.jpg` | `10d_glucose_inf_500ml.jpg` |
| `COX B-200(CELECOXIB) 10'S` | `COX_B_200_CELECOXIB_10S.jpg` | `cox_b_200_celecoxib_10s.jpg` |
| `ABONIKI` | `ABONIKI.jpg` | `aboniki.jpg` |

## Recommendation

**Use Method 3** - just set `USE_UPPERCASE_FILENAMES = true` in the script. This is the easiest and requires no file renaming!

