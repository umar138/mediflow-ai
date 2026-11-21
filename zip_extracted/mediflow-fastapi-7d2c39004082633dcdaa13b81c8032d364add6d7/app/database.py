from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

import psycopg2
from psycopg2.extras import RealDictCursor

while True:
    try:
        conn = psycopg2.connect(
            host="localhost",
            database="fastapi",
            user="postgres",
            password="Nemo_p@ni10122003",
            cursor_factory=RealDictCursor,
        )
        cursor = conn.cursor()
        print("Database connected!")
        break
    except Exception as error:
        print("database connection failed!")
        print("error", error)
SQLALCHEMY_DATABASE_URL = "postgresql://postgres:Nemo_p%40ni10122003@localhost/fastapi"

engine = create_engine(SQLALCHEMY_DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


keywords = [
    "int",
    "float",
    "double",
    "boolean",
    "char",
    "if",
    "else",
    "for",
    "while",
    "do",
    "return",
    "void",
    "break",
    "continue",
    "switch",
]
# two-character operators (checked first)
ops2 = ["==", "!=", "<=", ">=", "&&", "||", "++", "--", "+=", "-=", "*=", "/="]
# single-character operators
ops1 = "+-*/%=<>!&|^"
# indicators (punctuation / delimiters)
indicators = ";,(){}[].:\"'#"


def add(d, key):
    d[key] = d.get(key, 0) + 1


def total(d):
    return sum(d.values())


def print_result(title, d):
    print(f"{title}: {total(d)}")
    if not d:
        print("  (none)")
    else:
        for k, v in d.items():
            print(f"  {k} -> {v} time(s)")


def main():
    s = input("Enter something: ")

    kw_found = {}
    op_found = {}
    dig_found = {}
    ind_found = {}

    n = len(s)
    i = 0
    while i < n:
        c = s[i]

        # word (identifier / keyword)
        if c.isalpha() or c == "_":
            start = i
            while i < n and (s[i].isalnum() or s[i] == "_"):
                i += 1
            w = s[start:i]
            if w in keywords:
                add(kw_found, w)
            continue

        # digits
        if c.isdigit():
            add(dig_found, c)
            i += 1
            continue

        # two-character operators
        if i + 1 < n and s[i : i + 2] in ops2:
            add(op_found, s[i : i + 2])
            i += 2
            continue

        # single-character operators
        if c in ops1:
            add(op_found, c)
            i += 1
            continue

        # indicators
        if c in indicators:
            add(ind_found, c)
            i += 1
            continue

        i += 1  # spaces / anything else

    print()
    print_result("Keywords used", kw_found)
    print_result("Operators used", op_found)
    print_result("Digits used", dig_found)
    print_result("Indicators used", ind_found)


if __name__ == "__main__":
    main()
