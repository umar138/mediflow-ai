from fastapi import APIRouter

from fastapi import APIRouter


from ..database import cursor

router = APIRouter()


@router.get("/ping")
def ping():
    return {"message": "router chal raha hai"}


# 1. Fetch All Posts


@router.get("/posts")
def get_posts():  # Naam change kiya taaki duplicate error na aaye
    cursor.execute("""SELECT * FROM posts""")
    posts = cursor.fetchall()
    print(posts)
    return {"data": posts}
