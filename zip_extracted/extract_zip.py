import zipfile, os, sys
zip_path = r'C:/Users/xumar/.gemini/antigravity/brain/a264afd2-35e0-46d1-8297-78ae22722011/.user_uploaded/media_1795267644172_fff147f4.zip'
extract_dir = r'C:/Users/xumar/Desktop/mediflow-ai/zip_extracted'
os.makedirs(extract_dir, exist_ok=True)
with zipfile.ZipFile(zip_path, 'r') as z:
    z.extractall(extract_dir)
print('extracted to', extract_dir)
