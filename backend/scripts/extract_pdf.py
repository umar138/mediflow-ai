import sys, json, pathlib
from PyPDF2 import PdfReader
pdf_path = r'C:/Users/xumar/.gemini/antigravity/brain/a264afd2-35e0-46d1-8297-78ae22722011/.user_uploaded/media_1795283733424_483016a7.pdf'
if not pathlib.Path(pdf_path).exists():
    print('PDF not found', file=sys.stderr)
    sys.exit(1)
reader = PdfReader(pdf_path)
text = ''
for page in reader.pages:
    txt = page.extract_text()
    if txt:
        text += txt + '\n'
print(text)
