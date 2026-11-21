from typing import Optional
from random import randrange
from fastapi import FastAPI, Response, status, HTTPException, Depends
from fastapi.params import Body
from pydantic import BaseModel
import psycopg2
from psycopg2.extras import RealDictCursor
from sqlalchemy.orm import Session
from datetime import datetime
from .database import engine, SessionLocal, conn, cursor
from . import models
from .database import engine, SessionLocal

# Database tables create karne ke liye
models.Base.metadata.create_all(bind=engine)

app = FastAPI()
from .routers import posts

app.include_router(posts.router)


# Database Dependency (get_db) ko standard tarike se fix kiya
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- PYDANTIC SCHEMAS ---


class Post(BaseModel):
    title: str
    content: str
    published: bool = True


class PostResponse(BaseModel):
    id: int
    title: str
    content: str
    published: bool
    created_at: datetime

    class Config:
        orm_mode = True


# --- PSYCOPG2 DATABASE CONNECTION ---

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
        print("Database connected successfully!")
        break
    except Exception as error:
        print("database connection failed!")
        print("error", error)

# Aapka local array data (Agar kahi use karna ho)
my_post = [
    {"title": "Title of post 1", "Content": "Content of post 1", "id": 1},
    {"title": "favorite food", "content": "i like pizza", "id": 2},
]


def find_post(id):
    for p in my_post:
        if p["id"] == id:
            return p


def find_index_post(id):
    for i, p in enumerate(my_post):
        if p["id"] == id:
            return i


# --- API ROUTES ---


@app.get("/")
def root():
    return {"messege": "Hello world"}


# 2. Create Post
@app.post("/posts", status_code=status.HTTP_201_CREATED)
def create_posts(post: Post):
    cursor.execute(
        """insert into posts(title, content, published) values (%s,%s,%s) returning * """,
        (post.title, post.content, post.published),
    )
    new_post = cursor.fetchone()
    conn.commit()
    return {"data": new_post}


# 3. Fetch Single Post (Fixed: Comma missing aur response model ka flat object masla hal kiya)
@app.get("/posts/{id}", response_model=PostResponse)
def get_single_post(id: int):
    # (str(id),) mein comma lagaya taaki tuple sahi bane
    cursor.execute("""select * from posts where id = %s""", (str(id),))
    post = cursor.fetchone()

    if not post:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post with id {id} not found!",
        )

    return post  # Seedha flat object return kiya jo PostResponse ko chahiye


# 4. Delete Post
@app.delete("/posts/{id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_post(id: int):
    cursor.execute("""DELETE FROM posts WHERE id = %s RETURNING * """, (str(id),))
    deleted_post = cursor.fetchone()
    conn.commit()

    if deleted_post == None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post with id {id} does not exist",
        )

    return Response(status_code=status.HTTP_204_NO_CONTENT)


# 5. Update Post
@app.put("/posts/{id}")
def update_post(id: int, post: Post):
    cursor.execute(
        """update posts set title = %s, content = %s, published = %s where id = %s returning * """,
        (post.title, post.content, post.published, str(id)),
    )
    updated_post = cursor.fetchone()
    conn.commit()

    if updated_post == None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Post with id {id} does not exist",
        )

    return {"data": updated_post}
